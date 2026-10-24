// violating fixture: 注入脚本无回滚分支 → fw_vite_inject_clean(fail)
// 改写入口 HTML 后无法复原，须提供 clean 子命令回滚（本文件刻意缺失）
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
writeFileSync('index.html', html.replace('</head>', '  <script src="/inject.js"></script>\n</head>'));
console.log('injected (no rollback branch)');
