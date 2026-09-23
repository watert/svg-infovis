#!/usr/bin/env bash
# =====================================================================
# svg2png · 本地 SVG 栅格化 (视觉验证用)
#
#   ./scripts/svg2png.sh <in.svg> [out.png] [maxSize]
#
# 优先级: rsvg-convert(装了 librsvg) > qlmanage(macOS Quick Look / WebKit)
# 两条都是**毫秒级、零浏览器**的本地路径, 取代"起 Chrome headless + sleep + kill"那套。
#
# 为什么默认落在 qlmanage: 它背后是 WebKit, 对 text-anchor / 圆弧 / 内联字体
# 这些我们重度依赖的特性支持最准; ImageMagick 的内置 MSVG 不支持 dominant-baseline(我们已弃),
# 且常见的 magick 构建不带 Freetype(文字直接渲染不出来)。
#
# 注: qlmanage 恒输出**正方形**画布, 内容按宽度缩好后底部留白 —— 脚本会按 SVG 宽高比裁掉。
#     没装 sips 或 SVG 没写 width/height 时保留原样(宁可留白, 不要裁错)。
# =====================================================================
set -euo pipefail

in="${1:?用法: svg2png.sh <in.svg> [out.png] [maxSize]}"
out="${2:-${in%.svg}.png}"
max="${3:-1400}"

[ -f "$in" ] || { echo "找不到输入: $in" >&2; exit 1; }

# ── 产物守卫 (260919) ────────────────────────────────────────────────
# 出图链路上 SVG 走 stdout、诊断走 stderr, 二者只差一个重定向符号。
# 调用方若写 `bun run x.ts > out.svg 2>&1`, stderr 的 [error] 诊断会落在文件**头部**
# (stderr 无缓冲, 先于块缓冲的 stdout 落盘) —— 文件照样 14KB、照样以 </svg> 收尾、
# exit code 照样 0, 直到这里才炸成 librsvg 的
#   "Error reading SVG …: XML parse error: Error domain 1 code 4 on line 1 column 1 of
#    data: Start tag expected, '<' not found"
# 那句报错一个字都不提真因(它只看见"第 1 列不是 '<'")。所以守卫钉在这个**必经的边界**上。
#
# ⚠ 守卫里的 `tr` **必须带 LC_ALL=C** (260919 实测): shell 的 locale 不是 UTF-8 时,
#   `tr -d '[:space:]'` 遇到中文那串多字节会吐 `tr: Illegal byte sequence` 并非零退出,
#   命令替换拿到空串 → case 匹配失败 → **完整的 SVG 被误判成"尾部没有 </svg>"**,
#   而报错文案还振振有词地建议"重出一次"。判据只认 `<`/`>`/`/`/字母 这些 ASCII 字节,
#   按字节处理既正确又不受 locale 摆布。
head_ok=0; tail_ok=0
case "$(head -c 8 "$in" | LC_ALL=C tr -d '[:space:]')" in '<svg'*|'<?xml'*) head_ok=1 ;; esac
case "$(tail -c 64 "$in" | LC_ALL=C tr -d '[:space:]')" in *'</svg>'*) tail_ok=1 ;; esac

if [ "$head_ok" = 0 ] || [ "$tail_ok" = 0 ]; then
  {
    echo "✗ $in 不是一份完整 SVG:"
    if [ "$head_ok" = 0 ]; then
      echo "    头部 8 字节 = [$(head -c 8 "$in" | cat -v | LC_ALL=C tr -d '\n')]  (应为 <svg 或 <?xml)"
    fi
    if [ "$tail_ok" = 0 ]; then
      echo "    尾部 64 字节里没有 </svg>  (文件被截断? 出图时抛异常了?)"
    fi
    if [ "$head_ok" = 0 ] && [ "$tail_ok" = 1 ]; then
      echo "    但尾部是完整 </svg> ⇒ 出图时 stderr 混进了 stdout。前 200 字节:"
      head -c 200 "$in" | sed 's/^/      | /'
      echo "    典型成因: bun run xxx.ts > out.svg 2>&1   ← 去掉 2>&1 重出:"
      echo "        bun run xxx.ts > $in"
      echo "    只救这一份: sed -n '/<svg/,\$p' \"$in\" > \"${in%.svg}.fixed.svg\""
    else
      echo "    重出一次; 尾巴也缺通常是脚本中途抛异常(诊断在 stderr, 看图请读 stderr)。"
    fi
  } >&2
  exit 1
fi

# ── 变量守卫 (260923) ────────────────────────────────────────────────
# 上面那条只查"是不是一份完整 SVG"; 但**能渲**不等于**渲对**: 整张图靠 CSS 自定义属性上色的
# 外来产物(archify 的 viewer 导出就是)在 rsvg 下会把填充与描边一并丢掉 —— 产物是"深底黑块",
# 而它同样能过上面的守卫、同样 exit 0。这条把"看着像成功"的那一类也喊出来。
# ⚠ 只警告、不改判决: 展平是**可选**的一步(起 Chrome 截图那条路不需要它), 也免得把
#   既有调用方(cli.ts / build-example-pngs.sh)的退出码语义改掉。
if grep -q 'var(--' "$in"; then
  {
    echo "⚠ $in 用了 CSS 自定义属性(var(--…)), 而 rsvg-convert / qlmanage 都不认 —— 栅格化结果会是黑底黑块, 且不报错。"
    echo "  先展平变量再栅格化:"
    echo "      bun run scripts/svg-varflatten.ts \"$in\" \"${in%.svg}.flat.svg\" && $0 \"${in%.svg}.flat.svg\" \"$out\" \"$max\""
  } >&2
fi

if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w "$max" -o "$out" "$in"
  echo "$out (rsvg-convert)"
  exit 0
fi

if command -v qlmanage >/dev/null 2>&1; then
  tmp="$(mktemp -d)"
  qlmanage -t -s "$max" -o "$tmp" "$in" >/dev/null 2>&1
  src="$tmp/$(basename "$in").png"
  [ -f "$src" ] || { echo "qlmanage 没能生成缩略图: $in" >&2; rm -rf "$tmp"; exit 1; }

  # 按 SVG 声明尺寸裁掉 qlmanage 的正方形留白
  sw="$(grep -o 'width="[0-9.]*"' "$in" | head -1 | sed 's/[^0-9.]//g' || true)"
  sh="$(grep -o 'height="[0-9.]*"' "$in" | head -1 | sed 's/[^0-9.]//g' || true)"
  if [ -n "$sw" ] && [ -n "$sh" ] && command -v sips >/dev/null 2>&1; then
    pw="$(sips -g pixelWidth "$src" | awk '/pixelWidth/{print $2}')"
    ph="$(sips -g pixelHeight "$src" | awk '/pixelHeight/{print $2}')"
    target="$(awk -v pw="$pw" -v ph="$ph" -v sw="$sw" -v sh="$sh" \
      'BEGIN{ h = int(pw * sh / sw + 0.5); print (h > 0 && h <= ph) ? h : ph }')"
    # qlmanage 把内容**顶部对齐**放进正方形画布(下方留白)。裁法要“从左上角起算”，
    # 故优先用 magick -crop; sips 的 cropOffset 是以**中心**为基准的, 得向上偏半个差值。
    if command -v magick >/dev/null 2>&1; then
      magick "$src" -crop "${pw}x${target}+0+0" +repage "$out"
    else
      off="$(awk -v ph="$ph" -v t="$target" 'BEGIN{ printf "%d", -((ph - t) / 2) }')"
      sips -c "$target" "$pw" --cropOffset "$off" 0 "$src" --out "$out" >/dev/null
    fi
  else
    mv "$src" "$out"
  fi
  rm -rf "$tmp"
  echo "$out (qlmanage/WebKit)"
  exit 0
fi

echo "没有可用的本地栅格化器 —— 装一个: brew install librsvg" >&2
exit 1
