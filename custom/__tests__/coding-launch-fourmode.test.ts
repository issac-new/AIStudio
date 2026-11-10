// P1 Task 4 守门：启动参数四挡贯通（补丁 766 内容锁）＋DSH 布尔推导＋承接清单。
import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dshPermissionRequired } from '../server/executioncontract/mode-policy'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('dshPermissionRequired 四挡→DSH 布尔', () => {
  it('未配置档=现状（approvalRequired 原样）；yolo=自动放行；build/guarded/plan=不自动放行（reject_once）', () => {
    expect(dshPermissionRequired(undefined, undefined)).toBeUndefined()
    expect(dshPermissionRequired(undefined, true)).toBe(true)
    expect(dshPermissionRequired(undefined, false)).toBe(false)
    expect(dshPermissionRequired('yolo', true)).toBe(false)
    expect(dshPermissionRequired('build', false)).toBe(true)
    expect(dshPermissionRequired('guarded', false)).toBe(true)
    expect(dshPermissionRequired('plan', false)).toBe(true)
  })
})

describe('补丁 766 接线锁（四挡启动贯通）', () => {
  const patch = () => readFileSync(join(repoRoot, 'patches/766-server-coding-launch-fourmode.patch'), 'utf8')

  it('补丁存在且 series 登记', () => {
    expect(existsSync(join(repoRoot, 'patches/766-server-coding-launch-fourmode.patch'))).toBe(true)
    expect(readFileSync(join(repoRoot, 'patches/series'), 'utf8')).toContain('766-server-coding-launch-fourmode.patch')
  })

  it('run-manager 增 permissionMode 可选档；zcode --mode 优先四挡（未配置回落现状二值）；dsh 按四挡推导', () => {
    const p = patch()
    expect(p).toContain('permissionMode?:')
    expect(p).toContain('run.launch.permissionMode ?? (run.launch.approvalRequired ? \'plan\' : \'yolo\')')
    expect(p).toContain("permissionRequired: dshPermissionRequired(")
    expect(p).toContain("from '../../../../custom/executioncontract/mode-policy'")
    // 启动侧注入恰两处且分工明确：765 给账本调用、766 给 manager.start——各一枚补丁一处
    expect((p.split('permissionMode: sessionMode ? zcodeNativeMode(sessionMode) : undefined').length - 1)).toBe(2)
  })

  it('默认行为不变：未配置会话档不传 permissionMode（回落 yolo/plan 二值）', () => {
    expect(patch()).toContain('sessionMode ? zcodeNativeMode(sessionMode) : undefined')
  })
})

describe('承接清单 coding-backend-absorption.json', () => {
  const listPath = join(repoRoot, 'config/coding-backend-absorption.json')
  const contract = JSON.parse(readFileSync(join(repoRoot, 'config/execution-contract.json'), 'utf8'))

  it('文件存在且背端集合与契约 retired 完全一致（13 家，白名单不在内）', () => {
    expect(existsSync(listPath)).toBe(true)
    const list = JSON.parse(readFileSync(listPath, 'utf8'))
    const ids = list.backends.map((b: { id: string }) => b.id).sort()
    expect(ids).toEqual([...contract.codingBackends.retired].sort())
    expect(ids).toHaveLength(13)
    expect(ids).not.toContain('zcode')
    expect(ids).not.toContain('dsh')
  })

  it('每家十面、状态枚举合法、waived 必须带用户签字', () => {
    const list = JSON.parse(readFileSync(listPath, 'utf8'))
    const FACES = ['code-intelligence-lsp', 'multi-file-edit-patch', 'terminal-process', 'git-worktree',
      'checkpoint-rewind', 'image-input', 'mcp-client', 'session-resume', 'plan-mode', 'project-rules-files']
    const STATUSES = new Set(['source-confirmed', 'implemented', 'not-collected', 'waived'])
    for (const backend of list.backends) {
      expect(Object.keys(backend.faces).sort()).toEqual([...FACES].sort())
      for (const [face, entry] of Object.entries(backend.faces as Record<string, { status: string; evidence?: string[]; approvedBy?: string }>)) {
        expect(STATUSES.has(entry.status), `${backend.id}/${face} 状态非法`).toBe(true)
        if (entry.status === 'waived') expect(entry.approvedBy, `${backend.id}/${face} waived 须签字`).toBeTruthy()
        if (entry.status !== 'not-collected') {
          expect(Array.isArray(entry.evidence) && entry.evidence.length > 0, `${backend.id}/${face} 须证据路径`).toBe(true)
        }
      }
    }
  })

  it('implemented 面的证据路径真实存在（防注册表存在≠能力已吸收）', () => {
    const list = JSON.parse(readFileSync(listPath, 'utf8'))
    const implemented: Array<[string, string[]]> = []
    for (const backend of list.backends) {
      for (const [face, entry] of Object.entries(backend.faces as Record<string, { status: string; evidence?: string[] }>)) {
        if (entry.status === 'implemented' || entry.status === 'source-confirmed') implemented.push([`${backend.id}/${face}`, entry.evidence ?? []])
      }
    }
    expect(implemented.length).toBeGreaterThanOrEqual(4)
    for (const [key, evidence] of implemented) {
      for (const p of evidence) expect(existsSync(join(repoRoot, p)), `${key} 证据缺失: ${p}`).toBe(true)
    }
  })
})
