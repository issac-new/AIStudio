# nextjs fixture 说明

- violating 主触发 5 个 fail 意图：Server Component 内用 useState（app/page.tsx）/ Server Action 未鉴权（app/actions.ts）/
  middleware 未配路径匹配配置（middleware.ts）/ Client Component 调 next/headers（app/client-cookie.tsx）/
  pages/ 与 app/ 同路径 /dashboard 双定义（pages/dashboard.tsx + app/dashboard/page.tsx）。
- 断言登记：**5/5 主触发已断言**（`violating/expected-fail-ids`：`fw_nextjs_use_client`、
  `fw_nextjs_server_action_auth`、`fw_nextjs_middleware_matcher`、`fw_nextjs_headers_server_only`、`fw_nextjs_router_conflict`）。
- 2026-07-20 P1 唤醒记录（三类成因，分别处置）：
  1. `fw_nextjs_middleware_matcher`：原 fixture 注释含 "matcher" 字面量（含门禁 id），
     门禁为全文 grep 被注释中和而沉睡。本批改写注释措辞（全文件不再出现该字面量）唤醒；门禁判定逻辑未动。
  2. `fw_nextjs_headers_server_only`：原 fixture 无触发样本，新增 app/client-cookie.tsx 实例化唤醒；门禁判定逻辑未动。
  3. `fw_nextjs_router_conflict`：**门禁代码级沉睡 bug**——路径归一化 sed 以 `|` 为分隔符且模式内含 ERE 交替
     `(tsx|jsx|ts|js)`，GNU（gsed: unknown option to `s'）与 BSD（parentheses not balanced）sed 均解析报错，
     stderr 被 2>/dev/null 吞掉后 pages_paths/app_paths 恒为空，门禁恒 pass。
     本批将两条含交替的 s 命令分隔符 `|`→`:`（nextjs.sh:222-226，仅此改动，判定语义与输出行不动），
     并新增 pages//app/ 同路径样本实例化唤醒。对照证据：修复前 GNU/BSD 同样本 stderr 报错、stdout 为空；
     修复后同一样本两侧输出逐字节一致（app 侧 `dashboard/page`、pages 侧 `dashboard`）。
     已知残留：app/ 根 page 归一化为 "page" 而非空串，根路由级冲突（pages/index + app/page）不识别，
     属判定面扩张，登记留 P1-1+（同 spring-boot actuator 处置范式）。
- 已知交叉触发（warn 级，不修）：client-cookie.tsx 的 `'next/headers'` 导入含 `next/head` 子串，
  命中 fw_nextjs_metadata_api(warn) 启发式误报；该 warn 不改变 violating 退出码，修门禁属判定面扩张留后续。
- 无法实例化项登记：无（5 个 fail 门禁全部实例化）。
- compliant 侧 middleware 配 config 路径匹配、仅一种 Router、Client 不碰 next/headers，期望全 pass。
