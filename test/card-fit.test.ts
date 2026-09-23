// =====================================================================
// knives/fit · cardFit / placeCard —— "图标 + 说明卡片"的块反算
//
// 由来(260920 ontology 图): 这类图里一个实体 = 图标(上) + 左对齐多行说明(下), 而**没有任何
// 一处尺寸是手定的**: 卡片宽由最宽的行说了算、块高由"图标 + 间隙 + 卡片"说了算、摆放按**整块的中心**。
//
// 与门禁的关系是本文件的核心(the 闭环):
//   `cardFit` 的 `w` 就是 `label_fit` 的 `widen-node` 修法要的那个数 —— 两处必须同式。
//   下面那条"闭环"用例不是"盒看起来够宽", 而是**把这盒喂回 `audit` 必须零诊断**:
//   反算公式漂了(比如用了 600 字重、或没算行内加粗), 它会当场红。
//
// 一条刻意的分工: 换行是**作者的决定**(`lines` 数组的每个元素就是一行), core 不替你折行。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { cardFit, placeCard } from '../src/knives/fit';
import { THRESHOLDS, audit } from '../src/knives/audit';
import { measureText } from '../src/knives/measure';
import { rowBlock } from '../src/geometry/text-rows';
import { NODE_TEXT_LAYOUT } from '../src/shapes/node';
import { ShapeInputError } from '../src/guard';

const L1 = 'Object Type: **Airport**';
const L2 = 'Object: JFK';
const LINES = [L1, L2, 'Properties: Opening Date,', 'Operating Capacity, Lat./Long.'];
const FS = 12;

const throws = (fn: () => unknown): ShapeInputError => {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ShapeInputError);
    return e as ShapeInputError;
  }
  throw new Error('本该抛 ShapeInputError, 却没有');
};

describe('knives/fit · cardFit 反算', () => {
  it('卡片宽 = 最宽的行 + 2×padX(向上取整), 高 = 行块 + 2×padY', () => {
    const f = cardFit({ lines: LINES, fontSize: FS, padding: [14, 12] });
    const perLine = LINES.map((t) => measureText(t, { fontSize: FS, weight: 400 }));
    expect(f.lineWidths).toEqual(perLine.map((r) => r.width));
    expect(f.w).toBe(Math.ceil(Math.max(...perLine.map((r) => r.width)) + 2 * 14));
    // 盒高走**行块**那份公式(单源: nodeShape / nodeFit / 旁注文本都用它)
    const blockH = rowBlock(perLine.length, FS * NODE_TEXT_LAYOUT.lineGapEm, perLine.map((r) => r.height)).height;
    expect(f.h).toBe(Math.ceil(blockH + 2 * 12));
    expect(f.lines).toBe(LINES.length);
    // 四行不是一行 —— 盒高确实跟着行数走
    expect(f.h).toBeGreaterThan(measureText('x', { fontSize: FS }).height + 2 * 12);
  });

  it('padding 缺省 = 该档呼吸位(与门禁 `label_fit` 同一个数), 两档给出不同的盒', () => {
    const std = cardFit({ lines: LINES, fontSize: FS, level: 'standard' });
    const show = cardFit({ lines: LINES, fontSize: FS, level: 'showcase' });
    expect(std.padding).toEqual([THRESHOLDS.standard.labelInset, THRESHOLDS.standard.labelInset]);
    expect(show.padding).toEqual([THRESHOLDS.showcase.labelInset, THRESHOLDS.showcase.labelInset]);
    // 两档呼吸位差 4 ⇒ 宽各加 8、高各加 8(阈值必须真起作用)
    expect(show.w - std.w).toBe(2 * (THRESHOLDS.showcase.labelInset - THRESHOLDS.standard.labelInset));
    expect(show.h - std.h).toBe(2 * (THRESHOLDS.showcase.labelInset - THRESHOLDS.standard.labelInset));
  });

  it('行内加粗算进盒宽(否则盒按 400 给、字按 600 画, 又是两把尺子)', () => {
    const bold = cardFit({ lines: [L1], fontSize: FS, padding: 0 });
    const bare = cardFit({ lines: ['Object Type: Airport'], fontSize: FS, padding: 0 });
    expect(bold.w).toBe(Math.ceil(measureText(L1, { fontSize: FS, weight: 400 }).width));
    expect(bold.w).toBeGreaterThan(bare.w);
  });

  it('不给 iconSize ⇒ 纯文字卡片: block 就是卡片本身, icon 为 null', () => {
    const f = cardFit({ lines: LINES, fontSize: FS, level: 'showcase' });
    expect(f.icon).toBeNull();
    expect(f.block).toEqual({ w: f.w, h: f.h });
  });

  it('给了 iconSize ⇒ block 高 = 图标 + 间隙 + 卡片; 图标矩形相对卡片**左上角** y 恒负', () => {
    const f = cardFit({ lines: LINES, fontSize: FS, level: 'showcase', iconSize: 110, iconGap: 14 });
    expect(f.block.h).toBe(110 + 14 + f.h);
    expect(f.block.w).toBe(Math.max(f.w, 110));
    expect(f.icon).toEqual({ x: Math.round(((f.w - 110) / 2) * 10) / 10, y: -14 - 110, w: 110, h: 110 });
    // 图标比卡片窄时块宽仍是卡片宽(图标居中, 不撑宽)
    expect(f.icon!.x).toBeGreaterThan(0);
  });

  it('图标比卡片宽时块宽吃图标(与 iconInkRect 同一口径)', () => {
    const narrow = cardFit({ lines: ['a'], fontSize: FS, padding: 0, iconSize: 200, iconGap: 10 });
    expect(narrow.w).toBeLessThan(200);
    expect(narrow.block.w).toBe(200);
    expect(narrow.icon!.x).toBeLessThan(0); // 相对卡片左上角为负 = 图标左右各探出卡片
  });

  it('守卫: 空 lines / 非字符串行 / iconSize ≤ 0 / iconGap < 0 → 抛', () => {
    expect(throws(() => cardFit({ lines: [] })).field).toBe('lines');
    expect(throws(() => cardFit({ lines: ['ok', 42 as unknown as string] })).field).toBe('lines');
    expect(throws(() => cardFit({ lines: ['a'], iconSize: 0 })).field).toBe('iconSize');
    expect(throws(() => cardFit({ lines: ['a'], iconSize: 10, iconGap: -1 })).field).toBe('iconGap');
  });
});

describe('knives/fit · placeCard 按整块中心摆', () => {
  const withIcon = cardFit({ lines: LINES, fontSize: FS, padding: [14, 12], iconSize: 110, iconGap: 14 });
  const noIcon = cardFit({ lines: LINES, fontSize: FS, padding: [14, 12] });
  const A = placeCard(withIcon, { x: 400, y: 300 });
  const B = placeCard(noIcon, { x: 400, y: 300 });

  it('`at` 是**整块的中心**: 块的中心恒等于 at(带不带图标都一样)', () => {
    expect(A.block.x + A.block.w / 2).toBe(400);
    expect(A.block.y + A.block.h / 2).toBe(300);
    expect(B.block.x + B.block.w / 2).toBe(400);
    expect(B.block.y + B.block.h / 2).toBe(300);
  });

  it('卡片**底边**贴住块的底边, 图标整块在上方(于是卡片内部的文字基线不随图标是否在图挪动)', () => {
    expect(A.card.y + A.card.h).toBe(A.block.y + A.block.h);
    expect(A.icon!.y + A.icon!.h + 14).toBe(A.card.y);
    expect(A.icon!.x + A.icon!.w / 2).toBe(A.card.x + A.card.w / 2);
  });

  it('带图标的那块把卡片**整体下移** (块高差)/2 —— "心"在块上, 不在卡片上', () => {
    expect(A.card.y - B.card.y).toBe((A.block.h - B.block.h) / 2);
    expect(A.block.h - B.block.h).toBe(110 + 14);
    expect(A.card.w).toBe(B.card.w); // 卡片本身尺寸与图标无关
  });
});

describe('knives/fit · 闭环: 反算的盒必须真过门禁', () => {
  it('cardFit 的 w/h 喂回 audit, `label_fit` 零诊断(反算公式与闸门同式)', () => {
    const f = cardFit({ lines: LINES, fontSize: FS, level: 'showcase' });
    const report = audit({
      width: 600, height: 400,
      nodes: [{
        id: 'airport',
        rect: { x: 40, y: 40, w: f.w, h: f.h },
        label: LINES.join('\n'),
        fontSize: FS,
        align: 'start',
        weight: f.weight, // 400 = 正文档 —— 必须与 cardFit 算盒时那个数同源
      }],
      edges: [],
    }, { level: 'showcase' });
    expect(report.diagnostics.filter((d) => d.code === 'label_fit')).toEqual([]);
    expect(report.pass).toBe(true);
  });

  it('盒宽少 2px 就拦得住 —— 上一条不是"门禁没在查"(反证)', () => {
    const f = cardFit({ lines: LINES, fontSize: FS, level: 'showcase' });
    const report = audit({
      width: 600, height: 400,
      nodes: [{ id: 'airport', rect: { x: 40, y: 40, w: f.w - 4, h: f.h }, label: LINES.join('\n'), fontSize: FS, align: 'start', weight: f.weight }],
      edges: [],
    }, { level: 'showcase' });
    expect(report.diagnostics.some((d) => d.code === 'label_fit')).toBe(true);
  });

  it('字重也是同源的那一位: 按 400 反算的盒配缺省字重(600)会被拦, 按 600 反算的才合身', () => {
    const at600 = cardFit({ lines: [L1], fontSize: FS, level: 'standard', weight: 600 });
    const at400 = cardFit({ lines: [L1], fontSize: FS, level: 'standard', weight: 400 });
    expect(at600.w).toBeGreaterThan(at400.w);
    const auditWith = (w: number) => audit({
      width: 400, height: 200,
      // 节点**不声明**字重 ⇒ 门禁按缺省 600 量 —— 与 at600 的那把尺子同源
      nodes: [{ id: 'n', rect: { x: 10, y: 10, w, h: 40 }, label: L1, fontSize: FS, align: 'start' }],
      edges: [],
    });
    expect(auditWith(at600.w).diagnostics.filter((d) => d.code === 'label_fit')).toEqual([]);
    expect(auditWith(at400.w).diagnostics.some((d) => d.code === 'label_fit')).toBe(true);
  });
});
