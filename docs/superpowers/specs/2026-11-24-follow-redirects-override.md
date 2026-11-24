# 2026-11-24 回归安全面清偿：follow-redirects 高危通告（补丁 818）

> 状态：merged（2026-11-24；合并提交 929989c5f）
> 基线：3ebe7cbbc（main）

## 变更

全面复盘批收尾时补做依赖漏洞扫描（在 `vendor/hermes-studio` 下执行 `npm audit --omit=dev --registry=https://registry.npmjs.org/`），studio 基线的生产依赖报出 3 个漏洞：

- **follow-redirects 1.16.0（高危）**：axios 1.20.0 的间接依赖。三条通告 GHSA-q3jh-wrc6-jgq8、GHSA-8r9p-f939-6h3c、GHSA-mrwp-f3q8-3g9p，都指向同一类问题——跨源重定向时凭据头处理不当，数组形式的头、正则转义、跨域数组等情形下，Authorization、Cookie 一类凭据可能跟随重定向发到其它源。
- **katex 0.11.0 至 0.18.1（低危，直接依赖）**：GHSA-238p-pmpm-9mq7，既有的原型污染可绕过信任限制；经 `@vscode/markdown-it-katex` 引入的同一问题在扫描里另计一条。

上一轮（2026-11-21）同一扫描为 0。三条都是此后新发布的通告，不是本仓改动引入。

处理：

- **follow-redirects**：新增补丁 818，在 studio 的 `package.json` 的 `overrides` 里钉 `^1.16.3`。1.16.3 落在 axios 声明的 `^1.16.0` 范围内，是补丁级升级；清单里已有用 `overrides` 钉 sherpa-onnx 的先例，补丁序列里也早有改这份清单的补丁。上游基线升级后，若上游自带修复版本，这条覆盖自然可以退役。
- **katex**：修复版 0.18.2 超出上游声明的范围，属于依赖升级，随上游基线升级解决，记入挂账 N35-8。

生效条件：装依赖时解析。新克隆与 CI 走 `npm install` 即生效；已有安装需要在 `vendor/hermes-studio` 重跑一次 `npm install`（或 `npm update follow-redirects`）。

### 任务卡

#### 完成条件

1. 补丁在干净基线上可应用，经真实注入管线尾部增量应用后结论为 complete。
2. 独立小工程验证覆盖规则能把 follow-redirects 解析到 1.16.3。
3. 主检出更新依赖后：已装版本为 1.16.3，`npm audit` 高危归零，全量 vitest 不回归。

#### 输入与来源

扫描输出（`npm audit --json`）、`vendor/hermes-studio/package.json` 与锁文件、三条通告的 GitHub 链接。

#### 工作流边界

只改补丁序列与文档；不直接改 `vendor/` 下的受跟踪文件，不碰宿主运行时。

#### 工具与副作用

补丁 818 只在 `package.json` 增加一行；主检出更新依赖会改动共享依赖树里的一个包（`follow-redirects`）并重写锁文件的工作副本。

#### 结果与证据

见“验证”。

#### 异常与恢复

补丁可按序列登记反向撤出；依赖更新可用 `npm install` 按锁文件恢复。

#### 验收反例

撤掉补丁 818 再扫描：高危应重新出现 1 个。

## 决策记录

| # | 决策 | 依据 | 备选与否决理由 |
|---|---|---|---|
| D1 | follow-redirects 走补丁加 `overrides`，不直接改 vendor 文件 | 仓规：改上游文件必须进补丁序列；`overrides` 是清单既有机制 | 直接在 vendor 里改并提交（否决：绕过基线通道，重放时丢失）／等上游（否决：高危，且修复版在声明范围内） |
| D2 | katex 不在本批修 | 修复版超出上游声明范围，是真正的依赖升级，可能影响公式渲染 | 强行升到 0.18.2（否决：未经上游验证的升级，风险大于低危通告本身） |
| D3 | 不在软链共享依赖的 worktree 里跑 npm 安装类命令 | 实测 npm 把 worktree 的 `node_modules` 软链当“非目录”删除，并开始整体重装；共享树未受损，但 worktree 的链接被断开 | 照常在 worktree 安装（否决：同类事故已有先例） |

## 验证

- **扫描**：`npm audit --omit=dev`（官方源）在 `vendor/hermes-studio` 报 3 个（高 1、低 2）。注意默认镜像源 `registry.npmmirror.com` 不实现审计接口，必须显式指定官方源。
- **覆盖机制**：独立小工程（axios 1.20.0 加同一条 `overrides`）安装后，follow-redirects 解析到 1.16.3。
- **补丁应用**：`npm run ensure-injected` 以尾部增量应用 818，结论 complete；第二次运行为空操作。
- **干净基线重放**：合并前档里的根 vitest 含“补丁系列在干净树上的全量重放”用例，通过；根 vitest 合计 9943 个用例通过、1 个失败、11 个跳过。失败的 1 个是调用宿主 `hermes` 命令的真实 CLI 回归测试（`kanban-title-edit.regression-1`），原因是宿主 hermes 当时处于更新后不同步的状态（挂账 N35-9），与本补丁无关；合并前档其余 13 个测试面全部通过。
- **合入后（主检出）**：`npm update follow-redirects` 只改动 1 个包，已装版本 1.16.3；共享依赖树顶层条目前后一致（622 对 622）。复扫 `npm audit --omit=dev`：高危归零，余 2 个低危（katex，N35-8）。最终树上的全量 vitest：1242 个文件通过、6 个跳过，9944 个用例通过、11 个跳过，零失败——前述真实 CLI 用例此时通过，原因是宿主 hermes 的不同步状态在其后自行恢复（20:18 复查，两条警告消失、`hermes pm doctor` 的 python 项通过），见挂账 N35-9 的更新。

## 设计文档影响

DESIGN_SYNC: none。理由：本批是为上游基线的一条间接依赖钉修复版本，补丁登记在 `patches/series`（序列即事实源）；不改变产品行为、架构或数字总账。设计正本 5.4 节关于依赖声明与升级的原则不受影响。
