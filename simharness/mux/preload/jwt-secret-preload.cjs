'use strict';
// jwt-secret-preload.cjs — S-L2 hardening preload（drill r004 前置①，kanban t_8d68f11e）
//
// 目的：AUTH_JWT_SECRET 与服务 token（webui/.token）分置。服务端语义（vendor dist）：
//   hU() = process.env.AUTH_JWT_SECRET || <fallback: 服务 token>
// 直接在启动 env 里放密钥会落入 exec 时刻 procargs，`ps eww` 同用户可读（r003 红方
// 即经 ps eww 泄露起链）。本预加载器在 node exec 之后从 0600 密钥文件读值写入
// process.env——setenv 只改进程内存，不回写 procargs，ps eww 不可见。
//
// fail-closed：密钥文件缺失/不可读/畸形 → exit 78（EX_CONFIG）拒启。
// 若放任缺文件回落服务 token 签名，等于静默恢复 r003 S-L2 漏洞（T4 铸造链 200）。
const fs = require('fs');
const SECRET_PATH = __dirname + '/auth-jwt-secret';

let secret;
try {
  secret = fs.readFileSync(SECRET_PATH, 'utf8').trim();
} catch (e) {
  console.error('[jwt-secret-preload] FATAL: cannot read ' + SECRET_PATH + ' (' + e.code + ') — refusing to start with service-token JWT fallback (S-L2)');
  process.exit(78);
}
if (!/^[0-9a-f]{64}$/.test(secret)) {
  console.error('[jwt-secret-preload] FATAL: ' + SECRET_PATH + ' malformed (want 64 hex chars from `openssl rand -hex 32`) — refusing to start');
  process.exit(78);
}
process.env.AUTH_JWT_SECRET = secret;
