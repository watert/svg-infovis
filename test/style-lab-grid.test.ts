// =====================================================================
// style-lab grid · 并排四格的产物判据(两条, 都是**没有东西钉着**的纪律)
//
// ① **四格各自给 `pattern` id** —— `QUICKREF.md`「一张图里并排铺两种网格」那行讲的就是这件事,
//    但它此前只有实测记录、没有判据: 缺省 id 一律 `md-grid`, 而重复 id 下 `url(#md-grid)` 全解析
//    到**第一个定义** —— 四格会整片渲染成第一种网格(实测 dot 格纵向间距量到 10 而不是 14), 而
//    图上看不出这是 id 串台, 它长得就像"参数写错了"。
//
// ② **自产示例不用 `<g transform>`** —— `geometry/box.ts` 红线「不做嵌套坐标系」上最后一个活体
//    违例就在这里(并排四格从前靠 `translate(…)` 整体挪), 260925 拆成绝对坐标。拆得掉的前提是
//    网格相位有落脚处: 逐格 `origin` 把 tile 钉回格角 —— 少了它, 图案改从画布原点起算, 栅格后
//    实测差 16~22% 像素(rsvg 三档; 所以这条判据同时钉住"每格 pattern 带自己的 x/y")。
//
// 判据读的是**产物字节**(不是 gridLab 的中间量): 只有产物才算"出图那一刻的真话"。
// =====================================================================

import { describe, expect, it } from 'bun:test';
import { gridLab } from '../examples/labs/style-lab';

const CELL_CORNERS = ['16,46', '332,46', '16,242', '332,242'];
const occurrences = (hay: string, needle: string) => hay.split(needle).length - 1;

describe('style-lab grid · 并排四格的产物判据(各给 id · 零 transform)', () => {
  it('四个 pattern id 两两不同, 且各自恰好被一处 `url(#…)` 引用(重复 id 会让四格全走第一个定义)', () => {
    const svg = gridLab();
    const ids = [...svg.matchAll(/<pattern id="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(4);
    expect(new Set(ids).size).toBe(4);
    // 定义面与引用面一一对上: 不多不少各一处
    expect(ids.map((id) => occurrences(svg, `url(#${id})`))).toEqual([1, 1, 1, 1]);
    expect(occurrences(svg, 'url(#')).toBe(4);
  });

  it('产物里没有 `transform`; 四格的网格相位各自钉在格角上(`origin` = 格角)', () => {
    const svg = gridLab();
    // 平移编进坐标 ⇒ 产物里一个 transform 都不该有(旋转那条在 src/ 的标签上, 与本图无关)
    expect(svg).not.toContain('transform');
    const corners = [...svg.matchAll(/patternUnits="userSpaceOnUse" x="([\d.]+)" y="([\d.]+)"/g)].map((m) => `${m[1]},${m[2]}`);
    expect(corners).toEqual(CELL_CORNERS);
    // 纸底与铺满那块矩形也落在同一个格角上(相位与墨迹同源, 否则网格与底色会错开一格)
    for (const c of CELL_CORNERS) {
      const [x, y] = c.split(',');
      expect(svg).toContain(`<rect x="${Number(x).toFixed(2)}" y="${Number(y).toFixed(2)}" width="300.00" height="180.00" rx="0.00" fill="url(#`);
    }
  });
});
