// 执法门 P0-1/P2-5 守门：身份工具白名单、沙箱路径、浏览器域名、放行决策账。
// P0 Task 5 增：真实路径沙箱（cwd 解析/realpath canonicalize/symlink 逃逸）与沙箱终端证明。
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  APPROVAL_CLASS_RULES,
  applyApprovalBridge,
  ekkoEnforceGateHook,
  evaluateEnforcement,
  sandboxNetworkViolation,
  sandboxPathViolation,
  toolAllowedByList,
  type IdentityLite,
} from '../enforce-gate'
import { queryPolicyDecisions } from '../policy-decisions'
import { registerIdentity } from '../../agentidentity/agent-identity'

const dirs: string[] = []

function tmp(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  dirs.push(dir)
  return dir
}

beforeEach(() => {
  process.env.POLICY_DECISION_DIR = tmp('policy-dec-')
  process.env.AGENT_IDENTITY_STORE = tmp('agent-identity-')
  process.env.HERMES_GOV_EVENT_DIR = tmp('gov-events-')
  process.env.HERMES_TOOL_ENFORCE = '1'
  delete process.env.HERMES_TOOL_ENFORCE_MODE
  delete process.env.HERMES_TOOL_SANDBOX_ROOTS
  delete process.env.HERMES_TOOL_OS_SANDBOX_PROOF
  delete process.env.HERMES_BROWSER_ALLOWLIST
  delete process.env.HERMES_BROWSER_DENYLIST
})

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  delete process.env.POLICY_DECISION_DIR
  delete process.env.AGENT_IDENTITY_STORE
  delete process.env.HERMES_GOV_EVENT_DIR
  delete process.env.HERMES_TOOL_ENFORCE
  delete process.env.HERMES_TOOL_ENFORCE_MODE
  delete process.env.HERMES_TOOL_SANDBOX_ROOTS
  delete process.env.HERMES_TOOL_OS_SANDBOX_PROOF
  delete process.env.HERMES_BROWSER_ALLOWLIST
  delete process.env.HERMES_BROWSER_DENYLIST
})

const identity = (allowlist: string[]): IdentityLite => ({ id: 'aid-001', name: 'alice', toolAllowlist: allowlist })

describe('身份工具白名单（P0-1）', () => {
  it('白名单支持精确与 prefix* 通配', () => {
    expect(toolAllowedByList('read_file', ['read_file'])).toBe(true)
    expect(toolAllowedByList('kanban_create', ['kanban_*'])).toBe(true)
    expect(toolAllowedByList('kanban_create', ['read_*'])).toBe(false)
  })

  it('命中白名单且无阶梯/模式时放行，规则 identity-pass', () => {
    const v = evaluateEnforcement('read_file', {}, 'p1', {
      masterOn: true,
      userId: 'alice',
      identityOf: () => identity(['read_file']),
    })
    expect(v).toMatchObject({ enforcing: true, allow: true, rule: 'identity-pass' })
  })

  it('未命中白名单硬拒，规则 identity-tool-denied', () => {
    const v = evaluateEnforcement('terminal_exec', { command: 'rm -rf /' }, 'p1', {
      masterOn: true,
      userId: 'alice',
      identityOf: () => identity(['read_file']),
    })
    expect(v).toMatchObject({ enforcing: true, allow: false, rule: 'identity-tool-denied' })
    if (v.enforcing && !v.allow) expect(v.error).toContain('terminal_exec')
  })

  it('身份 allowlist 与委托范围同时校验：任一未覆盖即拒绝', () => {
    const dual: IdentityLite = { id: 'aid-1', name: 'alice', toolAllowlist: ['read_file', 'terminal_exec'], delegationAllowlist: ['read_file'] }
    const run = (tool: string, id: IdentityLite) => evaluateEnforcement(tool, {}, 'p1', { masterOn: true, userId: 'alice', identityOf: () => id })
    expect(run('read_file', dual)).toMatchObject({ enforcing: true, allow: true })
    expect(run('terminal_exec', dual)).toMatchObject({ enforcing: true, allow: false, rule: 'identity-tool-denied' })
    // 身份白名单为空=未声明，只按委托范围校验
    const delegOnly: IdentityLite = { id: 'aid-2', name: 'bob', toolAllowlist: [], delegationAllowlist: ['terminal_exec'] }
    expect(run('terminal_exec', delegOnly)).toMatchObject({ enforcing: true, allow: true })
    expect(run('read_file', delegOnly)).toMatchObject({ enforcing: true, allow: false })
  })

  it('无身份记录或空白名单=未声明，不改变既有 no-config 行为', () => {
    expect(evaluateEnforcement('terminal_exec', {}, 'p1', { masterOn: true, userId: 'ghost' })).toMatchObject({
      enforcing: false, rule: 'no-config',
    })
    expect(evaluateEnforcement('terminal_exec', {}, 'p1', {
      masterOn: true, userId: 'alice', identityOf: () => identity([]),
    })).toMatchObject({ enforcing: false, rule: 'no-config' })
  })
})

describe('沙箱硬边界（P2-5）', () => {
  it('显式路径超出沙箱根拒绝，根内放行，相对路径不检查', () => {
    expect(sandboxPathViolation('terminal_exec', { cwd: '/etc' }, ['/workspace'])).toBe('/etc')
    expect(sandboxPathViolation('terminal_exec', { cwd: '/workspace/repo' }, ['/workspace'])).toBeNull()
    expect(sandboxPathViolation('write_file', { path: '/tmp/x' }, ['/workspace'])).toBe('/tmp/x')
    expect(sandboxPathViolation('write_file', { path: 'relative/x' }, ['/workspace'])).toBeNull()
  })

  it('未配置根时不检查（不假装有沙箱）', () => {
    expect(sandboxPathViolation('terminal_exec', { cwd: '/etc' }, [])).toBeNull()
  })

  it('执法门对越界路径返回 sandbox-path', () => {
    process.env.HERMES_TOOL_SANDBOX_ROOTS = '/workspace'
    const v = evaluateEnforcement('terminal_exec', { cwd: '/etc' }, 'p1', { masterOn: true })
    expect(v).toMatchObject({ enforcing: true, allow: false, rule: 'sandbox-path' })
  })

  it('预算耗尽标记为硬边界 budget-exceeded', () => {
    const v = evaluateEnforcement('read_file', {}, 'p1', { masterOn: true, budgetBlocked: true })
    expect(v).toMatchObject({ enforcing: true, allow: false, rule: 'budget-exceeded' })
  })

  it('浏览器域名策略：denylist 优先、allowlist 外拒绝、无规则放行', () => {
    expect(sandboxNetworkViolation('browser_navigate', { url: 'https://evil.example/x' })).toBeNull()
    process.env.HERMES_BROWSER_DENYLIST = 'evil.example'
    expect(sandboxNetworkViolation('browser_navigate', { url: 'https://evil.example/x' })).toContain('denylist')
    delete process.env.HERMES_BROWSER_DENYLIST
    process.env.HERMES_BROWSER_ALLOWLIST = 'good.example'
    expect(sandboxNetworkViolation('browser_navigate', { url: 'https://other.example' })).toContain('allowlist')
    expect(sandboxNetworkViolation('browser_navigate', { url: 'https://good.example/a' })).toBeNull()
    expect(sandboxNetworkViolation('browser_click', { selector: '#a' })).toBeNull()
  })
})

describe('真实路径沙箱（P0 Task 5：相对路径按真实 cwd 解析 + realpath canonicalize）', () => {
  it('相对路径按真实 cwd 解析：越出根拒、根内放行；无基准仍跳过', () => {
    const root = tmp('sandbox-rel-')
    expect(sandboxPathViolation('read_file', { path: '../outside.txt' }, [root], { cwd: root })).not.toBeNull()
    expect(sandboxPathViolation('read_file', { path: 'notes/a.txt' }, [root], { cwd: root })).toBeNull()
    // cwd 缺席时 workspaceRoot 兜底（上游 AgentToolContext 两字段都可得）
    expect(sandboxPathViolation('write_file', { path: '../escape.txt' }, [root], { workspaceRoot: root })).not.toBeNull()
    expect(sandboxPathViolation('write_file', { path: 'ok.txt' }, [root], { workspaceRoot: root })).toBeNull()
    // 无基准的相对路径仍跳过（旧语义不回退——裁决层无法确定基准就不猜）
    expect(sandboxPathViolation('write_file', { path: 'relative/x' }, [root])).toBeNull()
  })

  it('symlink 逃逸可检出：根内符号链指向根外即越界；根内链不误伤', () => {
    const root = tmp('sandbox-sym-')
    const outside = tmp('sandbox-outside-')
    mkdirSync(join(root, 'real'), { recursive: true })
    writeFileSync(join(outside, 'secret.txt'), 'x')
    symlinkSync(outside, join(root, 'leak'))              // 逃逸链：root/leak → 根外目录
    symlinkSync(join(root, 'real'), join(root, 'alias'))  // 根内链：root/alias → root/real
    expect(sandboxPathViolation('read_file', { path: join(root, 'leak', 'secret.txt') }, [root])).not.toBeNull()
    expect(sandboxPathViolation('read_file', { path: 'leak/secret.txt' }, [root], { cwd: root })).not.toBeNull()
    expect(sandboxPathViolation('read_file', { path: join(root, 'alias', 'f.txt') }, [root])).toBeNull()
  })

  it('悬垂 symlink 逃逸可检出：末段悬垂链（目标不存在）不算「根内名字」', () => {
    // root/danglink → outside/created.txt（目标不存在）。检查若只按「名字在根内」放行，
    // open('w') 会经 POSIX 悬垂链接在根外创建文件——这是检查时已存在的恶意状态。
    const root = tmp('sandbox-dang-')
    const outside = tmp('sandbox-dang-outside-')
    symlinkSync(join(outside, 'created.txt'), join(root, 'danglink'))
    expect(sandboxPathViolation('write_file', { path: join(root, 'danglink') }, [root])).not.toBeNull()
    expect(sandboxPathViolation('write_file', { path: 'danglink' }, [root], { cwd: root })).not.toBeNull()
  })

  it('悬垂 symlink 逃逸可检出：中间段悬垂链同样越界', () => {
    // root/mid → outside/deep（deep 不存在）；经 root/mid/x.txt 写入会落在根外。
    const root = tmp('sandbox-dang-mid-')
    const outside = tmp('sandbox-dang-mid-outside-')
    symlinkSync(join(outside, 'deep'), join(root, 'mid'))
    expect(sandboxPathViolation('write_file', { path: join(root, 'mid', 'x.txt') }, [root])).not.toBeNull()
    // 对照：根内悬垂链（目标在根内且不存在）不误伤
    symlinkSync(join(root, 'pending.txt'), join(root, 'inroot-dang'))
    expect(sandboxPathViolation('write_file', { path: join(root, 'inroot-dang') }, [root])).toBeNull()
  })

  it('不存在目标回溯最近存在祖先：根内深路径放行，借 .. 越出的不存在路径拒', () => {
    const root = tmp('sandbox-deep-')
    expect(sandboxPathViolation('write_file', { path: join(root, 'a', 'b', 'c.txt') }, [root])).toBeNull()
    expect(sandboxPathViolation('write_file', { path: join(root, '..', '..', 'stash.txt') }, [root])).not.toBeNull()
  })

  it('~ 展开仍按真实 home 判定（隔离 HOME 必在临时根外）', () => {
    const root = tmp('sandbox-home-')
    expect(sandboxPathViolation('read_file', { path: '~/outside-sandbox-probe.txt' }, [root])).not.toBeNull()
  })

  it('root 不可规范化（symlink 环）时 fail-closed：显式路径一律判越界', () => {
    const root = tmp('sandbox-loop-')
    symlinkSync(join(root, 'a'), join(root, 'b'))
    symlinkSync(join(root, 'b'), join(root, 'a'))
    expect(sandboxPathViolation('write_file', { path: join(root, 'x.txt') }, [join(root, 'b')])).not.toBeNull()
  })
})

describe('沙箱终端证明（P0 Task 5：sandbox-terminal-unavailable）', () => {
  it('roots 配置即沙箱模式：terminal/code 无真实 OS 沙箱证明硬拒', () => {
    const root = tmp('sandbox-term-')
    process.env.HERMES_TOOL_SANDBOX_ROOTS = root
    const v = evaluateEnforcement('terminal_exec', { command: 'cat /etc/passwd', cwd: root }, 'p1', { masterOn: true })
    expect(v).toMatchObject({ enforcing: true, allow: false, rule: 'sandbox-terminal-unavailable' })
    expect(evaluateEnforcement('code_exec', { code: 'print(1)' }, 'p1', { masterOn: true }).rule)
      .toBe('sandbox-terminal-unavailable')
    // 路径越界的 terminal 报更具体的 sandbox-path（既有断言语义不回退）
    expect(evaluateEnforcement('terminal_exec', { command: 'ls', cwd: '/etc' }, 'p1', { masterOn: true }).rule)
      .toBe('sandbox-path')
  })

  it('合法证明（container）解锁终端门；Shell 文本检查类声明不算证明', () => {
    const root = tmp('sandbox-proof-')
    process.env.HERMES_TOOL_SANDBOX_ROOTS = root
    process.env.HERMES_TOOL_OS_SANDBOX_PROOF = 'container'
    // 有证明且无其他策略 → 不再因沙箱拒绝（no-config 不执法）
    expect(evaluateEnforcement('terminal_exec', { command: 'ls', cwd: root }, 'p1', { masterOn: true }).rule)
      .toBe('no-config')
    process.env.HERMES_TOOL_OS_SANDBOX_PROOF = 'shell-audit'  // 命令文本审计≠OS 级隔离
    expect(evaluateEnforcement('terminal_exec', { command: 'ls', cwd: root }, 'p1', { masterOn: true }).rule)
      .toBe('sandbox-terminal-unavailable')
  })

  it('未配置 roots 时无终端证明门（不假装有沙箱）', () => {
    expect(evaluateEnforcement('terminal_exec', { command: 'ls' }, 'p1', { masterOn: true }).rule).toBe('no-config')
  })

  it('sandbox-terminal-unavailable 不在审批类规则集，审批桥不放行', () => {
    const root = tmp('sandbox-term-bridge-')
    process.env.HERMES_TOOL_SANDBOX_ROOTS = root
    expect(APPROVAL_CLASS_RULES.has('sandbox-terminal-unavailable')).toBe(false)
    const deny = evaluateEnforcement('terminal_exec', { command: 'ls', cwd: root }, 'p1', { masterOn: true })
    const bridged = applyApprovalBridge(deny, { approved: true })
    expect(bridged).toMatchObject({ allow: false, rule: 'sandbox-terminal-unavailable' })
  })
})

describe('执法钩子：真实执行上下文透传（P0 Task 5）', () => {
  it('钩子透传真实 cwd：相对路径越界在钩子层被拦，根内放行', async () => {
    const root = tmp('sandbox-hook-')
    process.env.HERMES_TOOL_SANDBOX_ROOTS = root
    const hook = ekkoEnforceGateHook()
    const denied = await hook.preExecute?.('write_file', { path: '../leak.txt' }, { profileId: 'p1', cwd: root })
    expect(denied).toMatchObject({ allow: false })
    expect((denied as { error?: string } | undefined)?.error).toContain('../leak.txt')
    const ok = await hook.preExecute?.('write_file', { path: 'inside.txt' }, { profileId: 'p1', cwd: root })
    expect(ok).toBeUndefined()  // 根内且无其他策略 → no-config 不拦
  })
})

describe('执法钩子：身份与放行决策账（P0-2）', () => {
  it('放行与拒绝都落独立决策账，可按结果查询', async () => {
    const reg = registerIdentity({ name: 'alice', kind: 'human', owner: 'ops', toolAllowlist: ['read_file'] }, 'test')
    expect(reg.ok).toBe(true)
    const hook = ekkoEnforceGateHook()
    await hook.preExecute?.('read_file', { path: '/a' }, { userId: 'alice', sessionId: 's1' })
    const denied = await hook.preExecute?.('terminal_exec', { command: 'x' }, { userId: 'alice', sessionId: 's1' })
    expect(denied).toMatchObject({ allow: false })

    const all = queryPolicyDecisions({ days: 1, sessionId: 's1' })
    expect(all.total).toBe(2)
    expect(all.byOutcome).toEqual({ allow: 1, deny: 1 })
    expect(all.entries.some((e) => e.rule === 'identity-pass' && e.allow)).toBe(true)
    expect(all.entries.some((e) => e.rule === 'identity-tool-denied' && !e.allow)).toBe(true)
  })
})
