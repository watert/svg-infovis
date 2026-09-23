// =====================================================================
// geometry/inline-text · 行内加粗标记(`**粗**`)的解析 —— 唯一一份
//
// 由来(260920 ontology 图): 卡片那类"说明块"里 **值要加粗**(`Object Type: **Airport**`),
// 而 `label` 是一个字符串。于是文字层出现了一个 mini-markup —— 它一旦存在, 就有两个消费者:
//   · 渲染面(`shapes/node.ts`)要把它拆成 `<tspan>` 并按 run 上屏
//   · 度量面(`knives/measure.ts` ← `label_fit` / `nodeFit` 都用它)要按 run 算宽(粗体宽 3%)
// 两家各写一份解析 = 本仓最贵的那类事故(门禁量的宽度与画出来的宽度是两串不同的字)。
// 所以解析收在这里, 双方**只读它的输出**。
//
// 语法(刻意只有一条, 不做嵌套 / 不做斜体 —— 缺口等真需求再开):
//   `**粗**` 成对标记之间的文字按粗体;  `\*` = 一个字面星号;  `\\` = 一个字面反斜杠
// 落单的 `**` **不作废、不抛错**: 按字面量原样输出(于是它会在图上看得见, 自己暴露)。
// 抛错在这里是最坏的选择 —— 它会让"度量能不能算"与"图能不能画"分叉, 而那正是要焊死的东西。
//
// 定位: 纯文本处理, **零依赖**(与 `vec.ts` / `text-rows.ts` 同层同纪律)。
// 它不认识字体、不认识字号、更不认识布局 —— 只回答"这段文字由哪些 run 组成、各自粗不粗"。
// =====================================================================

/** 一段同字重的连续文字 */
export type TextRun = {
  text: string;
  /** true = 这段落在 `**...**` 里 */
  bold: boolean;
};

/** 粗体标记 */
export const BOLD_MARK = '**';

const isEscapeStart = (ch: string): boolean => ch === '*' || ch === '\\';

/**
 * 扫出所有 `**` 的**起始下标**(跳过转义)。
 *
 * 为什么要先扫一遍: 标记只有在**成对**时才作数, 而"后面还有没有配对的"要看过整串才知道。
 * 一遍扫完按下标配对(`[0,1]` / `[2,3]` / …), 落单的最后一个不进集合 —— 于是它退回字面量,
 * 不吞掉两个字符、也不把后半行悄悄变粗(那正是本文件要防的"静默改写")。
 */
function markerPositions(src: string): number[] {
  const pos: number[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && i + 1 < src.length && isEscapeStart(src[i + 1])) { i += 2; continue; }
    if (ch === '*' && src[i + 1] === '*') { pos.push(i); i += 2; continue; }
    i += 1;
  }
  return pos;
}

/**
 * 拆 run。不变式: 拼回 `runs.map(r => r.text).join('')` **恒等于**去掉转义后的原文
 * (`textUnits` 这类按字数算的口径因此不必理解标记语法)。
 *
 * 这条不变式是**落单标记必须退回字面量**的理由: 中间态的对子若被当作标记吃掉, 拼接就少两个字符,
 * 而"量宽的那串字"与"画出来的那串字"于是再次分叉 —— 本文件存在的全部意义就是不让它分叉。
 */
export function parseTextRuns(text: string): TextRun[] {
  const src = String(text ?? '');
  const marks = markerPositions(src);
  // 成对才作数(见 `markerPositions`); 落单的最后一个不做标记
  const paired = new Set(marks.slice(0, marks.length - (marks.length % 2)));
  const runs: TextRun[] = [];
  let buf = '';
  let bold = false;
  let i = 0;
  const flush = (): void => {
    if (buf) runs.push({ text: buf, bold });
    buf = '';
  };
  while (i < src.length) {
    const ch = src[i];
    // 转义: 吃掉反斜杠, 原样留住被转义的字符(不参与标记匹配)
    if (ch === '\\' && i + 1 < src.length && isEscapeStart(src[i + 1])) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '*' && src[i + 1] === '*' && paired.has(i)) {
      flush();
      bold = !bold;
      i += 2;
      continue;
    }
    buf += ch;
    i += 1;
  }
  flush();
  return runs.length ? runs : [{ text: '', bold: false }];
}

/** 去掉标记后的纯文本(给"这行有多少字 / 该给多宽"的对账用; 与 run 划分无关) */
export const plainText = (text: string): string => parseTextRuns(text).map((r) => r.text).join('');

/**
 * 含标记语法(标记**或**转义)才需要走 `parseTextRuns` —— 纯文本这条快路径据此少一次数组分配。
 * 判据必须把转义算进来: `\*` 在图上是一个星号, 原样留着就会画出两个字符。
 */
export const needsTextParse = (text: string): boolean => text.includes('*') || text.includes('\\');
