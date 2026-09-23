// =====================================================================
// route 择优表达式化的**等价性基线** (260919 建, 260922 从 experiments/ 搬进 test/)
//
// 背景: `transposedRoute` 的 `pick(strict)` 把择优审美写在控制流里("先要不自重叠且不蹭自己这两个
// 盒子, 再取更短")。改走 `compareRouteCost`(代价向量)是"审美表达式化"的第一步 ——
// 但**改 core 既有行为必须有等价证据**, 不是"看代码觉得等价"。
//
// 做法: 扫 端口 4×4 × 目标盒位 6 × lane 3 = 288 个组合, 把 `routeOrthogonal` 的折点列与四个
// 可行性标志打成一组合一行。`test/route-pick-baseline.txt`(tracked) 就是"改前那份产物"。
//
// 为什么住 test/ 而不是 experiments/(260922): 它此前是**手动跑的实验脚本**, 靠人记得"改择优
// 前后跑一次" —— 而靠人记得的基线等于没有基线。进了 test/ 就进了 `bun run verify`, 任何静默改
// 择优当场红。基线**要更新**时(先确认差异是想要的, 不是回归):
//   UPDATE_BASELINE=1 bun test test/route-pick-equivalence.test.ts
// 并在提交信息里说清"为什么这 288 行该变"。
// =====================================================================

import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { routeOrthogonal } from '../src/knives/route';

const FROM = { x: 100, y: 100, w: 80, h: 40 };

/** 目标盒位覆盖六种相对方位 —— 相背 / 相对 / 同列 / 同行的拓扑都能被扫到 */
const TOS = [
  { id: 'east', x: 300, y: 100, w: 80, h: 40 },
  { id: 'south', x: 100, y: 300, w: 80, h: 40 },
  { id: 'southeast', x: 300, y: 300, w: 80, h: 40 },
  { id: 'northeast', x: 300, y: -80, w: 80, h: 40 },
  { id: 'southwest', x: -200, y: 300, w: 80, h: 40 },
  { id: 'northwest', x: -200, y: -80, w: 80, h: 40 },
];

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
/** lane: 不给 / 区间内 / 越界(会触发投影) */
const LANES: Array<number | undefined> = [undefined, 60, -400];

/** 一次扫描 → 一组合一行(字段位置固定: 盒位 / 端口对 / lane / 折点列 / 标志) */
function sweep(): string[] {
  const lines: string[] = [];
  for (const to of TOS) {
    for (const fs of SIDES) {
      for (const ts of SIDES) {
        for (const lane of LANES) {
          const out = routeOrthogonal({
            from: FROM,
            fromPort: { side: fs },
            to,
            toPort: { side: ts },
            ...(lane === undefined ? {} : { lane }),
          });
          const points = out.points.map((q) => `${q.x},${q.y}`).join(' ');
          const flags = [
            out.laneProjected ? 'projected' : '',
            out.laneInfeasible ? 'infeasible' : '',
            out.laneIgnored ? 'ignored' : '',
            out.viaInfeasible ? 'via-bad' : '',
          ].filter(Boolean).join(',') || '-';
          lines.push(`${to.id}\t${fs}->${ts}\tlane=${lane ?? '-'}\t${points}\t${flags}`);
        }
      }
    }
  }
  return lines;
}

const BASELINE = fileURLToPath(new URL('./route-pick-baseline.txt', import.meta.url));
const COMBOS = TOS.length * SIDES.length * SIDES.length * LANES.length; // 288

describe('route 择优等价性基线', () => {
  test(`扫描覆盖面就是 ${COMBOS} 组合(不许为了让它好过而缩小扫描)`, () => {
    const lines = sweep();
    expect(lines.length).toBe(COMBOS);
    expect(lines.every((l) => l.split('\t').length === 5)).toBe(true);
  });

  test('与基线逐字节一致(改择优会让这里红)', () => {
    const got = `${sweep().join('\n')}\n`;
    if (process.env.UPDATE_BASELINE === '1') {
      writeFileSync(BASELINE, got);
      console.log(`已重写基线: ${BASELINE}`);
      return;
    }
    const want = readFileSync(BASELINE, 'utf8');
    if (want === got) return;
    const w = want.split('\n');
    const g = got.split('\n');
    const diffs: string[] = [];
    for (let i = 0; i < Math.max(w.length, g.length); i++) {
      if (w[i] !== g[i]) diffs.push(`  行 ${i + 1}\n    基线: ${w[i] ?? '(缺)'}\n    现在: ${g[i] ?? '(缺)'}`);
    }
    throw new Error(
      `择优等价性基线不一致: ${diffs.length} 处(差异是想要的再跑 UPDATE_BASELINE=1 重写, 否则是回归)\n`
      + diffs.slice(0, 20).join('\n')
      + (diffs.length > 20 ? `\n  …还有 ${diffs.length - 20} 处` : ''),
    );
  });

  test('同输入跑两遍逐字节相同(确定性)', () => {
    expect(sweep()).toEqual(sweep());
  });
});
