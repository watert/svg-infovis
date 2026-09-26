// =====================================================================
// geometry/port · 面上的点(全仓只许这一份)
//
// 260926 从 `knives/route` 下沉。原先 `geometry/box` 为了不复制公式, 值导入 route;
// route 又为了 `PIERCE_MIN` 值导入 audit。`rectFace` 因此把整座门禁求值进来, 而且
// `shapes/node` 与 `shapes/group`(audit 已经值导入它们)一旦改用 `rectFace`,
// 合法的「形状依赖几何」会收成环。
//
// 这里零 knives 依赖。`route` 再导出同一绑定, `from 'svg-infovis/knives/route'` 不用改。
// barrel 不要另写一条 `export *`: 与 route 的 `export *` 同名, 这些名字会从 barrel 消失。
// =====================================================================

import { type Pt, type Rect, rectBottom, rectCenter, rectRight } from './vec';

export type Side = 'top' | 'right' | 'bottom' | 'left';

/** 沿边位置: t 是 0..1 的比例, at 是绝对像素(优先) */
export type PortRef = { side: Side; t?: number; at?: number };

/** 面 → 朝外单位向量 (y-down) */
export function sideDir(side: Side): Pt {
  switch (side) {
    case 'top': return { x: 0, y: -1 };
    case 'bottom': return { x: 0, y: 1 };
    case 'left': return { x: -1, y: 0 };
    case 'right': return { x: 1, y: 0 };
  }
}

/** 面上的端口点: at(绝对) 优先于 t(比例), 默认取面中点 */
export function portPoint(r: Rect, port: PortRef): Pt {
  const c = rectCenter(r);
  switch (port.side) {
    case 'top': return { x: port.at ?? r.x + r.w * (port.t ?? 0.5), y: r.y };
    case 'bottom': return { x: port.at ?? r.x + r.w * (port.t ?? 0.5), y: rectBottom(r) };
    case 'left': return { x: r.x, y: port.at ?? r.y + r.h * (port.t ?? 0.5) };
    case 'right': return { x: rectRight(r), y: port.at ?? r.y + r.h * (port.t ?? 0.5) };
    default: return c;
  }
}
