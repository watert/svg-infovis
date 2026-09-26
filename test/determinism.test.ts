// =====================================================================
// 字节确定性 · 源码级守卫 —— 「禁 Date.now / Math.random」从散文变成判决
//
// 为什么值得设门禁: 这条纪律已有的落地检查(`src/shapes/stat.ts` 的 golden 对账、
// `blocks/pictogram.test.ts` 的两次出图逐字节同)查的都是**产物**, 而产物是序列化器给的,
// 序列化器读的是刀算出来的数。破口长在刀里: 某把刀一旦溜进 `Date.now`(给 id 挂时间戳)
// 或 `Math.random`(给抖动加随机偏移), 产物就不再可复现 —— golden 对不上、SVG 文本 diff
// 天天变、website prerender 的逐字节一致当场失效。而它**静默**: 单跑一次门禁全绿,
// 隔一秒再跑就变了 —— 所以是"守卫有洞"而不是"红了要修"。
//
// 原来的洞: `anim-examples.test.ts` 那条只扫 3 个示例文件(`examples/gallery/anim-*.ts`),
// **刀本身(`src/`)没人看着**, 而破口恰恰长在那里。本条补上 `src/` / `blocks/` / `templates/`。
//
// ⚠ 必须**先剥注释**再查: 仓里有 3 处 `Date.now` 是"不许用"的**事故记录**
// (`src/serialize.ts:3`、`src/descriptor.ts:92`、`src/geometry/vec.ts:56`)。天真 `not.toContain`
// 会误报, 后果是后来人删掉告示牌来迁就门禁 —— 把禁令的证据当违规处理, 是本末倒置。
// 判据写法照 `test/layering.test.ts`: 纯函数 + 现造反例自证(它自己会响, 且只在真违规时响)。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dir, '..');

/**
 * 纪律的确切措辞(`src/serialize.ts` 文件头的铁律就是这三个写法)。**别扩成"看着像不确定的东西"**:
 * 无参 `new Date()` / `crypto.randomUUID()` 同样是时间源与随机源, 本条暂不管(仓内也零处),
 * 真要收编时**先在这儿加一项再让它响** —— 悄悄放宽或悄悄收紧, 都会让下一个人读不懂这条门禁的边界。
 */
const FORBIDDEN = ['Date.now', 'Math.random', 'performance.now'] as const;

/** 受管辖的三个目录: `src/` 是刀本身, `blocks/` 是块的组合层, `templates/` 是给人抄的起手骨架 */
const ROOTS = ['src', 'blocks', 'templates'] as const;

/** 仓内相对路径(相对仓库根), 如 `src/geometry/vec.ts` —— 报错里直接可读, 不用再换算 */
type Mod = string;

const walk = (dir: Mod, out: Mod[] = []): Mod[] => {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(p, out);
    // 测试文件豁免: 它们**成篇在讨论**这些写法(还有专门造伪随机数据的), 且不进产物。
    // 本条管的是"刀", 不是"守刀的尺子"。
    else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
};

/**
 * 剥掉注释, 输出**与原文等长**(注释字符换成空格, 换行原位保留)。等长是为了行号不漂:
 * 报的是"文件 + 行号 + 那行原文", 行号一旦错位, 这条门禁比没有更坏 —— 指错地方比不指更费时间。
 *
 * 单趟状态机, 只认三件事: `//` 行注释、`/*` 块注释、三种引号围起来的字符串。串里的双斜线
 * **不是**注释(否则 `'https://…'` 会被吃掉半行代码, 变成假绿)。⚠ 不解析正则字面量,
 * 只靠"转义 `\` 连吞下一个字符"兜住 `\/` 这类写法; 带裸双斜线的正则会多吃半行 ——
 * 那是**假绿**方向, 仓内出现这种写法时得把这里换成真词法分析。
 */
const stripComments = (src: string): string => {
  const out = src.split('');
  let mode: 'code' | 'line' | 'block' | 'str' = 'code';
  let quote = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && (n === '/' || n === '*')) { out[i] = ' '; mode = n === '/' ? 'line' : 'block'; }
      else if (c === "'" || c === '"' || c === '`') { mode = 'str'; quote = c; }
      else if (c === '\\') i++;                                  // 转义连吞: 正则里的 \/ 不是注释开头
    } else if (mode === 'str') {
      if (c === '\\') i++;
      else if (c === quote) mode = 'code';
      else if (c === '\n' && quote !== '`') mode = 'code';        // 引号没闭合也只是字符串, 别吞掉余下全文
    } else if (c === '\n') {
      if (mode === 'line') mode = 'code';                          // 行注释到此为止; 块注释跨行, 换行只当行号锚点
    } else if (mode === 'block' && c === '*' && n === '/') {
      out[i] = ' '; out[i + 1] = ' '; mode = 'code'; i++;
    } else {
      out[i] = ' ';
    }
  }
  return out.join('');
};

/**
 * 剥注释后逐行找禁用写法, 命中给 `文件:行号: 那行原文`。行取**原文**(让人一眼看到真代码),
 * 因剥离保原始位置, 行号与原文严格对齐。空数组 = 干净。
 */
const findNondeterminism = (file: Mod, src: string): string[] => {
  const bare = stripComments(src).split('\n');
  const raw = src.split('\n');
  const hits: string[] = [];
  for (let i = 0; i < bare.length; i++) {
    if (FORBIDDEN.some((p) => bare[i].includes(p))) hits.push(`${file}:${i + 1}: ${raw[i].trim()}`);
  }
  return hits;
};

/** 从磁盘读一批文件并汇总 —— 与 `findNondeterminism` 同一套判据, 只是喂文件而不是喂字符串 */
const scanNondeterminism = (files: Mod[]): string[] =>
  files.flatMap((f) => findNondeterminism(f, readFileSync(join(ROOT, f), 'utf8')));

describe('字节确定性 · 源码里禁掉时间源与随机源', () => {
  it('① src/ + blocks/ + templates/ 逐文件剥掉注释后, 零 Date.now / Math.random / performance.now', () => {
    const files = ROOTS.flatMap((d) => walk(d));
    // 先证"清单不空": walk 一旦改坏(路径写错), 空清单会让下面那条**假绿** —— 假绿比红贵
    for (const d of ROOTS) expect(files.some((f) => f.startsWith(`${d}/`)), `${d}/ 一个文件都没扫到`).toBe(true);
    expect(files.length, '扫描清单空得不正常').toBeGreaterThan(20);
    expect(scanNondeterminism(files), '刀里混进了时间源 / 随机源 —— 产物不再可复现').toEqual([]);
  });

  it('举证 · 会响(端到端): 往 src/ 现放一个含 Date.now 的模块, 走同一套 walk + 扫描被抓住', () => {
    const probe = 'src/determinism-probe.ts';
    writeFileSync(join(ROOT, probe), 'export const stamp = () => `t-${Date.now()}`;\n');
    try {
      const hits = scanNondeterminism(walk('src'));
      expect(hits, '对真违规一声不吭 = 这条门禁是装饰').toHaveLength(1);
      expect(hits[0]).toContain(`${probe}:1:`);
      expect(hits[0]).toContain('Date.now');
    } finally { rmSync(join(ROOT, probe), { force: true }); }
  });

  it('举证 · 不误报: 注释里的禁令(行注释 / 跨行块注释 / 串里的双斜线)不算违规', () => {
    const src = [
      '// 铁律: 禁 Date.now / Math.random。',
      '/* 跨行说明',
      '   performance.now 也是时间源, 一样不许',
      '*/',
      "const u = 'https://example.com/a/b';   // 串里的双斜线不是注释开头",
      'export const n = 1;',
    ].join('\n');
    expect(findNondeterminism('src/serialize.ts', src), '注释里的禁令被当成违规 = 逼人删告示牌').toEqual([]);
    // 反向对照: "代码 + 尾注释"照抓。⚠ 这条同时钉住"剥离只吃注释": 串里的双斜线若被当成注释,
    // 尾注释连同**后半个真语句一起消失**(`const n = 1;` 没了), 扫描当场变**假绿**
    const line = "const u = 'https://example.com/a/b'; const n = 1; // 注释里提 Date.now 不算";
    expect(stripComments(line), '串里的双斜线被当成注释开头, 后半行代码被吃掉').toContain('const n = 1;');
    expect(stripComments(line), '尾注释还在 = 注释没剥干净').not.toContain('注释里提');
    expect(findNondeterminism('src/serialize.ts', 'const r = String(Math.random); // 别的说明\n')).toHaveLength(1);
    expect(findNondeterminism('src/serialize.ts', `${line}\n`), '尾注释里的 Date.now 不该被抓').toEqual([]);
    // 剥离不改变行数: 上面报的行号才落得准
    for (const f of walk('src')) {
      const raw = readFileSync(join(ROOT, f), 'utf8');
      expect(stripComments(raw).split('\n').length, f).toBe(raw.split('\n').length);
    }
  });

  it('举证 · 剥离不吃代码: 无注释标记的代码行, 一行都不许被整行吃掉', () => {
    // 拿一个**独立**的行级块注释计数对账(不看字符串, 只数 `/*` 与 `*/`), 专抓"剥离器瞎了"这类假绿:
    // 注释体被多剥一层、把真代码当注释吞了, 表面看门禁全绿, 实际那片代码没人守着。
    let code = 0;
    for (const f of ROOTS.flatMap((d) => walk(d))) {
      const raw = readFileSync(join(ROOT, f), 'utf8').split('\n');
      const bare = stripComments(raw.join('\n')).split('\n');
      let depth = 0;
      for (let i = 0; i < raw.length; i++) {
        const inComment = depth > 0;
        depth = Math.max(0, depth + (raw[i].match(/\/\*/g) ?? []).length - (raw[i].match(/\*\//g) ?? []).length);
        if (inComment || /\/\/|\/\*|\*\//.test(raw[i]) || raw[i].trim() === '') continue;
        code++;   // 这一行**只能**是代码: 没注释标记, 也不在块注释体里
        expect(bare[i].trim(), `${f}:${i + 1} 整行代码被剥离器吃掉了 —— 这片源码从此没人守`).not.toBe('');
      }
    }
    expect(code, '对账清单空得不正常(walk 或标记判据坏了)').toBeGreaterThan(1000);
  });

  it('举证 · 三个禁用写法各自都会响', () => {
    for (const p of FORBIDDEN) {
      expect(findNondeterminism('src/knives/probe.ts', `export const v = ${p};\n`), p).toHaveLength(1);
    }
  });
});
