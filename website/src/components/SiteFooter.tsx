// 站点页脚: 三条口吻 + 许可(与仓根 README 同源, 不另写一份说法)
const CREED = [
  { k: '零运行时依赖', v: '库本体 0 dependency; 图标素材是构建期读盘, 不进运行时链' },
  { k: '字节确定性', v: '禁 Date.now / Math.random —— 同输入逐字节相同输出' },
  { k: '一处事实一处', v: '每个数字只有一个权威出处, 文档不互相抄一份' },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <ul className="site-creed">
        {CREED.map((c) => (
          <li key={c.k}>
            <strong>{c.k}</strong>
            <span>{c.v}</span>
          </li>
        ))}
      </ul>
      <p className="site-legal">
        MIT License · 图标素材 <a href="https://www.npmjs.com/package/lucide-static" target="_blank" rel="noreferrer">lucide-static</a> 为 ISC ·
        <a href="https://github.com/watert/svg-infovis" target="_blank" rel="noreferrer"> github.com/watert/svg-infovis</a>
      </p>
    </footer>
  );
}
