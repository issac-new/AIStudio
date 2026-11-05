// custom/platform/contracts/execution.ts
// 平台执行契约（P0 Task 5，2026-11-05；P1 Task 1 可观测化扩展）：未知 MCP 工具判定
// + 真实路径沙箱。
// 定位：跨执法门/控制器共享的执行面单一事实源——「什么算未知工具」「什么算越出
// 沙箱」只在此定义一次；enforce-gate 消费并 re-export 保持旧导入面（同 identity.ts
// 先例）。运行时零依赖（type import 不产生耦合），文件系统探测只读。
//
// 两条硬边界的产品语义（计划书全局约束：不能用 Shell 文本检查代替真实沙箱）：
//  1) 未知 MCP 工具硬拒：mcp__{server}__{tool} 的动词启发式（单层分类信号，见下文
//     MCP_READ_CONNECTORS 删除注记）判不出类别时，平台无法评估该工具的风险面——
//     按未治理拒绝（mcp-unknown），不再回落保守 write 让它混进普通审批快道。
//     修复出口是补动词映射/登记连接器。
//  2) 真实路径沙箱：配置 HERMES_TOOL_SANDBOX_ROOTS 后，路径判定基于真实文件系统
//     状态（realpathSync.native canonicalize，symlink 逃逸可检出）；terminal/code
//     本质上能触达任意路径（cd/重定向），路径白名单管不住 shell——没有真实 OS 级
//     沙箱证明（容器/VM/Seatbelt）就拒绝（sandbox-terminal-unavailable）。
//
// P1 Task 1（2026-11-05 终审前置①②）：OS 证明从布尔升格为 attestation（声明+
// 三项探测信号+declaredOnly 观测标记）；无 context 相对路径从静默 null 改为显式
// skippedNoContext 标记——均只加可观测性（执法门落 govbus 事件），判定语义不变。
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { ToolCategory } from '../../server/permmodes/permission-modes'

// ---------- MCP 工具细分类（H3 剩余项③ + P0-5 收口；自 enforce-gate 迁入） ----------
// 背景：MCP 动态工具（运行时 mcp__{server}__{tool} 形态）无静态类别声明。分类信号
// 只有一层：工具动词启发式（工具名首/末段动词 get/list/search… 与 create/update…）。
// 历史注记：2026-10-16 的 H3③ 版本曾有第二层「连接器只读目录」（MCP_READ_CONNECTORS，
// 65 连接器目录人工判读），P0-5 收口「未知动词不再默认 read」后两分支完全等价——
// 目录对分类不再有任何效果（收录与否都只看动词），故删除（审查 M-1）。连接器级
// 信任面如需重建，应作为显式登记机制而非「收录即默认 read」。
// 判不出的动词一律算「未知」（返回 null），由 isUnknownMcpTool 消费走 mcp-unknown
// 硬拒；不给未知动词发任何类别通行证。
const MCP_PREFIX = 'mcp__'

/** 解析 mcp__{server}__{tool}（tool 自身可含 __，取首段为 server、余为 tool）。 */
function parseMcpName(tool: string): { server: string; tool: string } | null {
  if (!tool.startsWith(MCP_PREFIX)) return null
  const rest = tool.slice(MCP_PREFIX.length)
  const i = rest.indexOf('__')
  if (i <= 0) return null
  return { server: rest.slice(0, i).toLowerCase(), tool: rest.slice(i + 2).toLowerCase() }
}

/** 工具名首/末段动词→类别（命中即返回；顺序无关，互斥设计）。 */
const MCP_TOOL_VERBS: { re: RegExp; cat: ToolCategory }[] = [
  // 动词首形态（list_issues/get_user…MCP 主流命名）；末段宾语不限
  { re: /^(?:get|list|search|read|query|fetch|find|describe|show|view|browse|count|check|validate|inspect|export|download|lookup|retrieve|discover)(?:_|$)/, cat: 'read' },
  { re: /^(?:create|update|delete|set|write|insert|upsert|remove|drop|patch|put|post|send|publish|upload|move|copy|rename|archive|restore|assign|comment|reply|add|new|edit|modify)(?:_|$)/, cat: 'write' },
  { re: /^(?:run|execute|call|invoke|trigger|exec|eval|deploy|migrate|sync|import|batch|bulk|apply|submit)(?:_|$)/, cat: 'exec' },
  // 动词末形态（user_get/record_list…少数连接器命名）
  { re: /(?:^|_)(?:get|list|search|read|query|fetch|find|describe|show|view|count|check|lookup|retrieve)$/, cat: 'read' },
  { re: /(?:^|_)(?:create|update|delete|set|write|insert|remove|drop|send|publish|upload|assign|comment|reply|add|edit|modify)$/, cat: 'write' },
  { re: /(?:^|_)(?:run|execute|call|invoke|trigger|exec|eval|deploy|migrate|sync|import|batch|bulk|apply|submit)$/, cat: 'exec' },
]

/** MCP 工具细分类（仅动词启发式一层）：判不出返回 null（未知——由 isUnknownMcpTool
 *  消费硬拒）。调用方 toolCategoryOf 对 null 回落保守 write（最终防线是 mcp-unknown）。 */
export function mcpCategoryOf(tool: string): ToolCategory | null {
  const parsed = parseMcpName(tool)
  if (!parsed) return null
  const verb = MCP_TOOL_VERBS.find((candidate) => candidate.re.test(parsed.tool))
  return verb?.cat ?? null
}

/** 未知 MCP 工具：mcp__ 前缀且动词启发式（单层分类信号）判不出类别。
 *  非 mcp__ 前缀的未知工具不算（仍走保守 write + 既有审批链）。 */
export function isUnknownMcpTool(tool: string): boolean {
  return tool.startsWith(MCP_PREFIX) && mcpCategoryOf(tool) === null
}

// ---------- 真实路径沙箱（P2-5 起点 + P0-5 真实化） ----------

/** 沙箱判定的执行上下文：相对路径的解析基准。
 *  来源=上游 AgentToolContext（vendor ekko-agent tools/types.ts 的 cwd/workspaceRoot），
 *  由执法钩子透传——相对路径必须按真实 cwd 解析，不能因「解析不了」放行。 */
export interface SandboxPathContext {
  /** 本次工具调用的真实工作目录（优先解析基准）。 */
  cwd?: string
  /** 工作区根（cwd 缺席时的回退解析基准）。 */
  workspaceRoot?: string
}

const FILE_PATH_TOOLS = new Set(['read_file', 'write_file', 'patch', 'view_image'])

/** 显式路径提取：terminal/code 取 cwd/workdir 入参；文件类工具取 path/file_path。 */
function explicitPathsOf(tool: string, input: Record<string, unknown>): string[] {
  if (tool === 'terminal_exec' || tool === 'code_exec') {
    const v = input.cwd ?? input.workdir
    return typeof v === 'string' && v ? [v] : []
  }
  if (FILE_PATH_TOOLS.has(tool)) {
    const v = input.path ?? input.file_path
    return typeof v === 'string' && v ? [v] : []
  }
  return []
}

/** 冒号/逗号分隔的 env 列表解析（HERMES_TOOL_SANDBOX_ROOTS/HERMES_BROWSER_* 共用口径）。 */
export function parseEnvList(name: string, env: NodeJS.ProcessEnv = process.env): string[] {
  return (env[name] ?? '')
    .split(/[:,]/)
    .map((v) => v.trim())
    .filter(Boolean)
}

/** 已配置沙箱根非空=沙箱模式开启（terminal 证明门据此执法）。 */
export function sandboxRootsConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseEnvList('HERMES_TOOL_SANDBOX_ROOTS', env).length > 0
}

function expandHome(p: string): string {
  return p.startsWith('~') ? join(homedir(), p.slice(1)) : p
}

/** 真实路径 canonicalize（绝对路径输入）：realpathSync.native 优先——解析全部
 *  symlink 链，符号链逃逸在 canonical 空间里现形。目标不存在（ENOENT）时先看
 *  该段自身是不是符号链：悬垂 symlink 的链接名在盘上存在且指向别处，open('w')
 *  会经它在目标处创建文件——必须沿 readlink 递归到目标侧再判，不能把链接名当
 *  「不存在的普通名字」拼回（审查 I-1）。链接名确不存在时才向父级回溯到最近
 *  存在祖先，canonicalize 后拼回剩余段（检查时不存在≠执行时不存在，按「祖先
 *  真实状态+声明的剩余段」判）。不可判定错误（ELOOP/EACCES 等）原样抛出——
 *  调用方按越界处理（fail-closed：配置坏了不降级放行）。 */
function canonicalizeAbs(abs: string): string {
  try {
    return realpathSync.native(abs)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    // 悬垂 symlink：realpath 因目标缺失报 ENOENT，但链接本身在盘上——沿 readlink
    // 到目标侧递归（目标侧再缺失则回溯其最近存在祖先；链环由 realpath 的 ELOOP 兜底）。
    let linkStat: ReturnType<typeof lstatSync> | null = null
    try {
      linkStat = lstatSync(abs)
    } catch (lerr) {
      if ((lerr as NodeJS.ErrnoException).code !== 'ENOENT') throw lerr
    }
    if (linkStat?.isSymbolicLink()) {
      return canonicalizeAbs(resolve(dirname(abs), readlinkSync(abs)))
    }
    const parent = dirname(abs)
    if (parent === abs) throw err  // 防御：'/' 本身 ENOENT 属不可判定
    return join(canonicalizeAbs(parent), abs.slice(parent.length + 1))
  }
}

/** 对外口径：任意路径（含 ~/相对）→ canonical 绝对路径。 */
export function canonicalizePath(p: string): string {
  return canonicalizeAbs(resolve(expandHome(p)))
}

/** child 是否在 parent 内（含相等）。path.relative 判包含：非 '..' 前缀且非绝对。 */
export function pathWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

/** 「ROOTS 已配置但相对路径无解析基准」的显式标记（P1 Task 1 第三返回形态）：
 *  旧语义静默 null——ROOTS 配置了却对相对路径不检查，部署者误以为有覆盖。现在返回
 *  本标记，由调用方（执法门）落观测事件；本契约保持纯函数不落事件。判定仍不猜
 *  （无基准不虚构解析结果），fail-closed 拒绝留 P2 执行面统一处置。 */
export interface SkippedNoContext {
  skippedNoContext: true
}

/** 沙箱路径检查：返回越界路径/不可判定的配置（入参原样）、无基准跳过标记或 null。
 *  - roots 缺省读 HERMES_TOOL_SANDBOX_ROOTS（:/, 分隔）；未配置=不检查（不假装有沙箱）。
 *  - 显式绝对/~/路径直接判；相对路径按 context 解析（cwd 优先、workspaceRoot 回退），
 *    无 context 时不再静默跳过——返回 {skippedNoContext:true}（可见性，判定不猜）。
 *  - 判定在 canonical 空间进行：root 与目标都过 canonicalize；root 不可规范化或
 *    目标不可判定时返回该条目（fail-closed）。
 *  - 优先级：越界字符串（拒）> skippedNoContext（观测）> null；越界先命中时标记
 *    信息让位（拒绝是更响的结局，不双返）。 */
export function sandboxPathViolation(
  tool: string,
  input: Record<string, unknown>,
  rootsInput?: string[],
  context?: SandboxPathContext,
): string | SkippedNoContext | null {
  const roots = (rootsInput ?? parseEnvList('HERMES_TOOL_SANDBOX_ROOTS'))
    .map((root) => root.trim())
    .filter(Boolean)
  if (roots.length === 0) return null
  let canonicalRoots: string[]
  try {
    canonicalRoots = roots.map((root) => canonicalizePath(root))
  } catch {
    // root 自身不可规范化（symlink 环/权限异常）：整组根不可信，任一显式路径都拒
    return roots[0] ?? ''
  }
  const baseRaw = context?.cwd?.trim() ? context.cwd : context?.workspaceRoot?.trim() ? context.workspaceRoot : undefined
  let sawRelativeNoContext = false
  for (const raw of explicitPathsOf(tool, input)) {
    const candidate = raw.trim()
    if (!candidate) continue
    let target: string
    if (candidate.startsWith('/') || candidate.startsWith('~')) {
      target = resolve(expandHome(candidate))
    } else if (baseRaw) {
      target = resolve(baseRaw, candidate)
    } else {
      sawRelativeNoContext = true  // 相对路径且无解析基准：不猜，但不再静默（P1 Task 1）
      continue
    }
    try {
      const canonicalTarget = canonicalizeAbs(target)
      if (canonicalRoots.some((root) => pathWithin(root, canonicalTarget))) continue
      return raw
    } catch {
      return raw  // 目标不可判定（ELOOP/EACCES…）=越界（fail-closed）
    }
  }
  if (sawRelativeNoContext) return { skippedNoContext: true }
  return null
}

// ---------- OS 沙箱证明（terminal/code 硬边界；P1 Task 1 可观测化） ----------

/** 合法 OS 沙箱证明口径：部署者声明 agent 运行时进程被哪类真实 OS 级隔离约束，
 *  且文件系统 roots 由该隔离层（而非路径白名单）强制。
 *   - container：agent 运行时整体跑在容器内；
 *   - vm：跑在专用虚拟机内；
 *   - seatbelt：macOS sandbox-exec profile 生效（进程级文件系统 confinement）。
 *  命令文本审计类声明不算证明——证明的是执行环境，不是命令内容。 */
const OS_SANDBOX_PROOF_KINDS = new Set(['container', 'vm', 'seatbelt'])

/** OS 沙箱探测信号集：三项独立只读文件系统探测，均为「本机存在某种 OS 级隔离
 *  痕迹/能力」的弱佐证——不构成证明（证明口径仍是部署声明），只用于 declaredOnly
 *  可观测标记。probes 入参可注入（测试确定性），缺省走真实探测。 */
export interface OsSandboxProbeSignals {
  /** Docker 容器标记文件 /.dockerenv 存在。 */
  dockerenv: boolean
  /** /proc cgroup（self 与 1 号进程）呈现容器运行时标记（docker/containerd/kubepods…）。 */
  cgroupContainer: boolean
  /** macOS sandbox-exec 二进制在标准路径存在（seatbelt 能力信号——能力非激活）。 */
  sandboxExec: boolean
}

/** OS 沙箱证明 attestation（P1 Task 1：osSandboxProofActive 升格）。
 *  declared=部署声明了合法证明口径（原布尔语义）；declaredOnly=声明在案但三项探测
 *  无一佐证——执法门解锁 terminal 时据此落 autonomy 观测事件（fire-and-forget），
 *  不改变裁决。跨口径取「任一信号」而非按声明口径匹配：vm 无文件系统级标记，
 *  按口径匹配会让所有 vm 部署恒报 declaredOnly（噪音），故用粗口径+事件携带全信号
 *  供运维判读。 */
export interface OsSandboxAttestation {
  declared: boolean
  probeSignals: OsSandboxProbeSignals
  /** 声明在案且三项探测无一佐证（观测标记，非拒绝依据）。 */
  declaredOnly: boolean
}

const CGROUP_CONTAINER_MARKERS = /docker|containerd|kubepods|lxc|machine-rkt|garden/

function probeDockerenv(): boolean {
  try { return existsSync('/.dockerenv') } catch { return false }
}

function probeCgroupContainer(): boolean {
  // macOS 无 /proc（ENOENT 吞掉=无信号）；容器内 cgroup v1/v2 均含运行时路径标记
  for (const file of ['/proc/self/cgroup', '/proc/1/cgroup']) {
    try {
      if (CGROUP_CONTAINER_MARKERS.test(readFileSync(file, 'utf8'))) return true
    } catch { /* 不可读=无信号 */ }
  }
  return false
}

function probeSandboxExec(): boolean {
  try { return existsSync('/usr/bin/sandbox-exec') } catch { return false }
}

/** OS 沙箱证明 attestation：声明口径（env）+ 本机探测信号 → {declared, probeSignals,
 *  declaredOnly}。执法门消费（无证明仍拒 terminal，declaredOnly 落观测事件）。 */
export function osSandboxAttestation(
  env: NodeJS.ProcessEnv = process.env,
  probes?: OsSandboxProbeSignals,
): OsSandboxAttestation {
  const declared = OS_SANDBOX_PROOF_KINDS.has(String(env.HERMES_TOOL_OS_SANDBOX_PROOF ?? '').trim().toLowerCase())
  const probeSignals = probes ?? {
    dockerenv: probeDockerenv(),
    cgroupContainer: probeCgroupContainer(),
    sandboxExec: probeSandboxExec(),
  }
  const declaredOnly = declared && !(probeSignals.dockerenv || probeSignals.cgroupContainer || probeSignals.sandboxExec)
  return { declared, probeSignals, declaredOnly }
}
