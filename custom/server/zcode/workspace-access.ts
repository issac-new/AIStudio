// overlay[zcode] 24h review X1：workspacePath 归属校验（引擎 run / checkpoint 恢复 / 投影入口）。
//
// 归属模型（会话注册表 + profile 可见面）：workspacePath 必须已注册于 Studio 会话注册表
// ——即某条会话绑定的 workspace（upstream session-store HermesSessionRow.workspace，经
// POST /api/studio/sessions/:id/workspace 绑定，ide/worktree.ts 建 worktree 同款落点），
// 且该会话的 profile 对调用方可见（upstream userCanAccessProfile，与 upstream 自身
// filterByAllowedProfiles 同一判据；super_admin 全通）。未注册/不可见 → 拒绝
// （invocation_not_allowed，词表语义：不区分「私有」与「不存在」，枚举安全）。
//
// 残余风险（如实注明，勿当无漏）：
//   - 未启用鉴权的单用户部署放行（ctx.state.user 缺席；fleet.ts canAccessProfile 同款先例）；
//   - 投影入口（/projection/watch|unwatch、/zcode socket subscribe）已同闸（X1 收口）；
//     GET /api/zcode-engine/projection 的 watching 清单仍对任意登录用户可读（仅路径元数据，
//     不含会话内容）；
//   - 隔离强度 = profile 隔离强度：会话 workspace 绑定由会话 owner 自行操作，
//     用户可绑任意路径到自己的会话（上游 setWorkspace 不查路径归属）；
//   - 路径按 path.resolve 归一化后精确比对（不做 realpath/大小写折叠）：绑定值与请求值
//     形态差异（符号链接、盘符大小写）会误拒（fail-closed 方向）；
//   - 会话注册表扫描上限 1 万条，超窗口的旧绑定不被识别 → 误拒（fail-closed 方向）。
//
// upstream 模块经 lazy require 取（projection-socket.ts loadUpstreamAuth 同款：custom
// 不做静态 import upstream——symlink 真实路径陷阱）；测试注入 stub。
import { resolve } from 'path'

/** 会话注册表行的最小消费面（upstream HermesSessionRow 的子集）。 */
export interface WorkspaceAccessRow {
  profile?: string | null
  workspace?: string | null
}

export interface WorkspaceAccessDeps {
  listSessions: () => WorkspaceAccessRow[]
  userCanAccessProfile: (userId: number | string, profile: string) => boolean
}

/** 调用方（ctx.state.user，上游 requireUserJwt 写入的 AuthenticatedUser 形态）。 */
export interface WorkspaceCaller {
  id?: number | string
  username?: string
  role?: string
}

/** 会话注册表扫描上限（upstream listSessions limit 参数）。 */
const SESSION_SCAN_LIMIT = 10_000

/** 路径归一化：resolve 收掉尾分隔符/相对段后精确比对。 */
export function normalizeWorkspacePath(p: string): string {
  return resolve(p.trim())
}

/**
 * 缺省归属面：lazy require upstream public/sessions + public/users（真实路径按 overlay
 * 与 upstream 兄弟布局解析，见文件头注释）。加载失败返回 null（调用侧 fail closed）。
 */
function loadUpstreamWorkspaceAccess(): WorkspaceAccessDeps | null {
  try {
    // 字面量 require 供构建期打包（esbuild）；运行期 ts-node CJS 走盘上相对解析。
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sessions = require('../../../../upstream/hermes-studio/packages/server/src/modules/studio/public/sessions') as {
      listSessions?: (profile?: string, source?: string, limit?: number) => WorkspaceAccessRow[]
    }
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const users = require('../../../../upstream/hermes-studio/packages/server/src/modules/studio/public/users') as {
      userCanAccessProfile?: (userId: number | string, profile: string) => boolean
    }
    if (typeof sessions.listSessions !== 'function' || typeof users.userCanAccessProfile !== 'function') return null
    return {
      listSessions: () => sessions.listSessions!(undefined, undefined, SESSION_SCAN_LIMIT),
      userCanAccessProfile: users.userCanAccessProfile,
    }
  } catch {
    return null
  }
}

let testDeps: WorkspaceAccessDeps | null = null

/** 测试注入归属面（null = 还原缺省 lazy require 路径）。 */
export function setWorkspaceAccessDepsForTests(deps: WorkspaceAccessDeps | null): void {
  testDeps = deps
}

/**
 * workspacePath 归属校验。deps 三态：
 *   - 省略（undefined）→ 用注入面/缺省 lazy require；
 *   - 显式 null → 无归属面（fail closed）；
 *   - 显式对象 → 按给定面判（纯函数可测）。
 * 调用方缺席（未启用鉴权的部署）→ 放行；super_admin → 放行（管理面）。
 */
export function canUseWorkspace(
  caller: WorkspaceCaller | null | undefined,
  workspacePath: string,
  deps?: WorkspaceAccessDeps | null,
): boolean {
  if (!caller) return true // 未启用鉴权的单用户部署（fleet.ts 先例）
  if (caller.role === 'super_admin') return true
  const d = deps !== undefined ? deps : (testDeps ?? loadUpstreamWorkspaceAccess())
  if (!d) return false // 归属校验面不可用 → fail closed，不放行任意路径
  const target = normalizeWorkspacePath(workspacePath)
  return d.listSessions().some((s) => {
    if (!s || typeof s.workspace !== 'string' || s.workspace.length === 0) return false
    if (normalizeWorkspacePath(s.workspace) !== target) return false
    return d.userCanAccessProfile(caller.id ?? 0, s.profile || 'default')
  })
}
