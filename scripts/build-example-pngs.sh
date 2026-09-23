#!/usr/bin/env bash
# =====================================================================
# build-example-pngs · 清单里的每个出图示例跑一遍 → PNG 落在 examples/images/
#
#   scripts/build-example-pngs.sh                      # 全部
#   scripts/build-example-pngs.sh basic style-lab-dark # 只跑指定项(key 即 PNG 名)
#   MAX=800 scripts/build-example-pngs.sh              # 改栅格长边(缺省 1400)
#
# **清单的唯一来源是 `examples/manifest.ts`**(260920 起) —— 本脚本不再自带一份 ITEMS 表。
# 过去"有哪些示例"散在脚本 ITEMS / SKILL 文件地图 / 人脑子里三处, 新增示例忘登记就在某一处漂;
# 现在脚本只有"怎么跑", "跑哪些"一律问清单(`bun run examples/manifest.ts --tsv`)。
# 仍然**不扫目录猜** —— 扫出来的"示例"包括 runner 与临时探针, 清单比猜可靠。
#
# 三条出口纪律(本仓咬过, 按它写):
#   · 图走 stdout / 文件、诊断只走 stderr —— **绝不合并 2>&1**
#     (合并会让诊断落在 SVG 头部, 而文件仍以 </svg> 收尾、exit 仍为 0: 失败长得像成功)
#   · 示例的**退出码就是判决**: 非 0 逐项记录, 最后统一汇报, 不静默
#   · 中间 SVG 一律落 $TMP; 只把 PNG 留在 examples/images/, 不往仓库里丢中间产物
# 260920 起出口**统一**: 所有示例都把图吐 stdout(过去 academic-figure / sequence-archify-style
# 自己 writeFileSync 到 /tmp, 清单里得为它们多留一列"SVG 来源" —— 特例少一个是一个)。

# =====================================================================
set -uo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_DIR="$SKILL_DIR/examples/images"
RASTER="$SKILL_DIR/scripts/svg2png.sh"
MAX="${MAX:-1400}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# ── 清单(唯一来源) ──────────────────────────────────────────────────────
if ! TSV="$(cd "$SKILL_DIR" && bun run examples/manifest.ts --tsv)"; then
  echo "✗ 取不到示例清单: \`bun run examples/manifest.ts --tsv\` 失败" >&2
  exit 2
fi

keys=(); files=(); args=()
while IFS=$'\t' read -r k f a; do
  [ -z "${k:-}" ] && continue
  keys+=("$k"); files+=("$f"); args+=("${a:-}")
done <<<"$TSV"

if [ "${#keys[@]}" -eq 0 ]; then
  echo "✗ 清单是空的 —— manifest.ts 的 EXAMPLES 没登记东西" >&2
  exit 2
fi

ONLY=("$@")
selected() {
  [ "${#ONLY[@]}" -eq 0 ] && return 0
  local k
  for k in ${ONLY[@]+"${ONLY[@]}"}; do [ "$k" = "$1" ] && return 0; done
  return 1
}

# 点名了清单里没有的 key 就当场拦下 —— 静默跑 0 项、汇总打"出图 0"会被读成"跑过了没问题"
# (退出码 2 = 用法错, 与 inspect.ts 的 1=图有病 / 2=命令错 同一约定)
for want in ${ONLY[@]+"${ONLY[@]}"}; do
  hit=0
  for k in "${keys[@]}"; do [ "$k" = "$want" ] && hit=1 && break; done
  if [ "$hit" -eq 0 ]; then
    echo "✗ 清单里没有 '$want'。可选: $(printf '%s ' "${keys[@]}")" >&2
    exit 2
  fi
done

mkdir -p "$OUT_DIR"
echo "输出目录: $OUT_DIR   (栅格长边 $MAX · 清单来自 examples/manifest.ts, ${#keys[@]} 项)"

ok=0; bad=0; missing=0
for i in "${!keys[@]}"; do
  key="${keys[$i]}"; file="${files[$i]}"; arg="${args[$i]}"
  selected "$key" || continue

  echo "── $key  ($file${arg:+ $arg})"
  cap="$TMP/$key.svg"
  if [ -n "$arg" ]; then
    ( cd "$SKILL_DIR" && bun run "$file" "$arg" > "$cap" )
  else
    ( cd "$SKILL_DIR" && bun run "$file" > "$cap" )
  fi
  code=$?
  if [ "$code" -ne 0 ]; then
    echo "   ⚠ 示例退出码 $code(判决不过; 诊断在上面 stderr, 图仍照出 —— runner 在门禁没过时给草稿)"
    bad=$((bad + 1))
  fi

  if [ ! -s "$cap" ]; then
    echo "   ✗ 拿不到 SVG(stdout 是空的): $file"
    missing=$((missing + 1))
    continue
  fi
  if "$RASTER" "$cap" "$OUT_DIR/$key.png" "$MAX"; then
    ok=$((ok + 1))
  else
    echo "   ✗ 栅格化失败: $cap"
    missing=$((missing + 1))
  fi
done

echo "── 汇总: 出图 $ok · 示例判决不过 $bad · 缺图 $missing"
# 判决落到 exit code: 示例非 0(门禁不过 / 抛异常)与缺图都算这次跑得不干净 ——
# 图仍照出(草稿), 但调用方在 shell 里必须能看见。别把"图有了"当成"过了"。
[ "$missing" -eq 0 ] && [ "$bad" -eq 0 ] || exit 1
