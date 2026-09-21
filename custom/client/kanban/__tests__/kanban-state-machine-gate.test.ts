// overlay/custom/client/kanban/__tests__/kanban-state-machine-gate.test.ts
// 守门：kanban 状态机诚实化（patch 334 服务端 / 335 客户端）的关键语义必须留在注入态。
// 背景（装机轮在案缺口，2026-09-21 修复）：
//   ① CLI 无 `rm` 动词 → DELETE /api/hermes/kanban/:id 恒 500（review 仅是首撞场景）；
//   ② PATCH status:'todo'/'triage' 落入 bulk 链 default throw 被吞 → 静默无操作，
//      前端 moveTask 不回检 results[].ok 再叠加一层假成功。
// 本测试读注入态上游源码做文本断言（模式同 after-pack-combined / kanban-i18n 守门）：
// patch 被丢弃、series 被回退、或 clean 后忘 inject 时当场红。
// 修复语义变更时同步更新本文件的断言与 patch 注释。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// __tests__ → kanban → client → custom → overlay → ncwk 根；上游只读面从 ncwk/ 进
const upstreamRoot = resolve(here, '../../../../../upstream/hermes-studio')

function readInjected(relPath: string): string {
  const full = resolve(upstreamRoot, relPath)
  try {
    return readFileSync(full, 'utf8')
  } catch {
    throw new Error(`注入态文件缺失：${relPath} —— 请先 npm run inject 再跑测试`)
  }
}

function sliceBetween(src: string, startMark: string, endMark: string): string {
  const start = src.indexOf(startMark)
  expect(start, `源码中找不到起始锚点：${startMark}`).toBeGreaterThanOrEqual(0)
  const end = src.indexOf(endMark, start)
  expect(end, `源码中找不到结束锚点：${endMark}`).toBeGreaterThanOrEqual(0)
  return src.slice(start, end)
}

const SERVER = 'packages/server/src/modules/hermes/services/kanban/kanban-service.ts'
const CLIENT_STORE = 'packages/client/src/stores/hermes/kanban.ts'

describe('patch 334 服务端：DELETE 走 archive+purge 两步硬删', () => {
  const src = readInjected(SERVER)
  const deleteTaskBody = sliceBetween(src, 'export async function deleteTask', 'export async function decomposeTask')

  it('deleteTask 不再调用不存在的 CLI rm 动词', () => {
    expect(deleteTaskBody).not.toMatch(/'rm',\s*taskId/)
  })

  it('deleteTask 组合 archive --rm purge 参数（CLI 硬删唯一通路）', () => {
    expect(deleteTaskBody).toMatch(/'archive',\s*'--rm',\s*taskId/)
    expect(deleteTaskBody).toMatch(/'archive',\s*taskId\]/)
  })

  it('已归档任务跳过 archive 步直接 purge', () => {
    expect(deleteTaskBody).toMatch(/!==\s*'archived'/)
  })
})

describe('patch 334 服务端：bulk 状态机补全 todo/triage/scheduled', () => {
  const src = readInjected(SERVER)
  const bulkBody = sliceBetween(src, 'async function applyBulkStatus', 'export async function bulkUpdateTasks')

  it('scheduled 走 CLI schedule 动词', () => {
    expect(bulkBody).toMatch(/case 'scheduled':[\s\S]*?return scheduleTask\(taskId, opts\)/)
  })

  it('todo/triage 走 returnTaskToBacklog 组合迁移', () => {
    expect(bulkBody).toMatch(/case 'todo':[\s\S]*?case 'triage':[\s\S]*?return returnTaskToBacklog\(taskId, opts\)/)
  })

  it('returnTaskToBacklog 对不可达组合抛清晰错误而非静默', () => {
    const fn = sliceBetween(src, 'async function returnTaskToBacklog', 'async function applyBulkStatus')
    expect(fn).toMatch(/no path from '\$\{status\}' to 'todo'/)
    expect(fn).toMatch(/status === 'review'/)
    expect(fn).toMatch(/status === 'blocked' \|\| status === 'scheduled'/)
  })

  it('patchTask 回检 bulk results，单任务 PATCH 不再吞 ok:false', () => {
    const patchBody = sliceBetween(src, 'export async function patchTask', 'Home channel notification subscriptions')
    expect(patchBody).toMatch(/const failed = bulk\.results\.find\(r => !r\.ok\)/)
    expect(patchBody).toMatch(/if \(failed\) throw new Error\(failed\.error/)
  })
})

describe('patch 335 客户端：moveTask 回检 bulk results 不再假成功', () => {
  const src = readInjected(CLIENT_STORE)
  const moveBody = sliceBetween(src, 'async function moveTask', 'async function bulkComplete')

  it('bulk 返回的 ok:false 转为抛错（拖拽失败可见）', () => {
    const checks = moveBody.match(/bulk\.results\.find\(r => !r\.ok\)/g) ?? []
    expect(checks.length).toBeGreaterThanOrEqual(2) // todo/scheduled/triage/archived 分支 + default 分支
    expect(moveBody).toMatch(/if \(failed\) throw new Error\(failed\.error/)
  })

  it('todo/triage 不做乐观写入，拉真值回填（落点由父子门禁决定）', () => {
    expect(moveBody).toMatch(/status !== 'todo' && status !== 'triage'/)
    expect(moveBody).toMatch(/await fetchTasks\(true\)/)
  })
})
