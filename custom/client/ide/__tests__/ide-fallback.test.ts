// @vitest-environment jsdom
// 未物化任务工作区兜底视图守门（2026-10-30 run23 复盘续作）：
//   四态判定（无任务/解析中/不存在或无权/解析故障/未物化）+ 任务简报卡 + 只读文件区。
// 关键纪律：not_found / resolve_error 不渲染文件树（解析故障不能装成正常空目录）；
// 未物化时任务目录有文件→任务工作区只读树，目录已回收→服务器默认根只读树。
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const locale = ref('zh')
vi.mock('vue-i18n', () => ({ useI18n: () => ({ locale }) }))

vi.mock('@/components/hermes/files/FileTree.vue', () => ({
  default: { name: 'FileTree', template: '<div data-testid="stub-default-tree" />' },
}))
vi.mock('@/stores/hermes/files', () => ({
  useFilesStore: () => ({ workspaceRoot: undefined }),
}))

const listMock = vi.fn()
vi.mock('../api/taskWorkspace', () => ({
  ideTaskFilesApi: { list: (...a: unknown[]) => listMock(...a) },
}))

// useIdeTask 任务号解析（同一文件里的纯逻辑用例）
const getTaskMock = vi.fn()
const listBoardsMock = vi.fn()
const listTasksMock = vi.fn()
vi.mock('@/api/hermes/kanban', () => ({
  getTask: (...a: unknown[]) => getTaskMock(...a),
  listBoards: (...a: unknown[]) => listBoardsMock(...a),
  listTasks: (...a: unknown[]) => listTasksMock(...a),
}))

import IdeUnmaterializedView from '../components/IdeUnmaterializedView.vue'
import { useIdeTask } from '../composables/useIdeTask'
import { ideFallbackStateOf, looksLikeTaskNumber, primaryOwnerOf, runMarkOf, titleMatchesTaskNumber } from '../composables/useIdeFallback'

const task = {
  id: 't_af224933',
  title: 'DEV-CHWX-S1 契约镜像+配置域+工程骨架（RUN=20261028-v8-run23）',
  status: 'done',
  assignee: null,
  body: 'S1 范围：…',
  raci: { responsible: ['hu'], approver: ['wei'], consulted: [], informed: [] },
}

function mountView(props: Record<string, unknown>) {
  return mount(IdeUnmaterializedView, { props: props as never })
}

beforeEach(() => {
  locale.value = 'zh'
  listMock.mockReset()
  listMock.mockResolvedValue({ path: '', entries: [] })
})

describe('ideFallbackStateOf（四态判定）', () => {
  const base = { requestedId: 't1', task: null, taskSettled: true, taskMiss: false, workspace: null, workspaceError: null, workspaceSettled: true }

  it('无任务 → no_task', () => {
    expect(ideFallbackStateOf({ ...base, requestedId: null })).toBe('no_task')
  })

  it('解析在途 → resolving（不提前判「不存在」）', () => {
    expect(ideFallbackStateOf({ ...base, taskSettled: false })).toBe('resolving')
    expect(ideFallbackStateOf({ ...base, workspaceSettled: false })).toBe('resolving')
  })

  it('任务不存在/无权 → not_found；解析故障 → resolve_error', () => {
    expect(ideFallbackStateOf({ ...base, taskMiss: true })).toBe('not_found')
    expect(ideFallbackStateOf({ ...base, workspaceError: { status: 502 } })).toBe('resolve_error')
    // 任务卡都没解析出来（超时/网络）：是解析故障，不能按「未物化」兜底
    expect(ideFallbackStateOf({ ...base, taskError: { status: 0 } })).toBe('resolve_error')
  })

  it('任务在、工作区未物化 → unmaterialized；已物化 → ready', () => {
    expect(ideFallbackStateOf({ ...base, task: task as never, workspace: { materialized: false } })).toBe('unmaterialized')
    expect(ideFallbackStateOf({ ...base, task: task as never, workspace: { materialized: true } })).toBe('ready')
  })
})

describe('任务号解析与简报字段', () => {
  it('RUN 标记从标题/正文提取', () => {
    expect(runMarkOf(task)).toBe('20261028-v8-run23')
    expect(runMarkOf({ title: '无标记', body: 'RUN: run-9' })).toBe('run-9')
    expect(runMarkOf(null)).toBeNull()
  })

  it('负责人：RACI R 优先，回退 A；都没有返回 null（不猜）', () => {
    expect(primaryOwnerOf(task as never)).toBe('hu')
    expect(primaryOwnerOf({ id: 'x', title: 't', status: 'todo', raci: { approver: ['wei'] } } as never)).toBe('wei')
    expect(primaryOwnerOf({ id: 'x', title: 't', status: 'todo' } as never)).toBeNull()
  })

  it('任务号形态判定与标题前缀匹配（S1 不误配 S10）', () => {
    expect(looksLikeTaskNumber('DEV-CHWX-S1')).toBe(true)
    expect(looksLikeTaskNumber('RFD-001')).toBe(true)
    expect(looksLikeTaskNumber('t_af224933')).toBe(false)
    expect(titleMatchesTaskNumber('DEV-CHWX-S1 契约镜像', 'DEV-CHWX-S1')).toBe(true)
    expect(titleMatchesTaskNumber('DEV-CHWX-S10 误配', 'DEV-CHWX-S1')).toBe(false)
    expect(titleMatchesTaskNumber('其他卡', 'DEV-CHWX-S1')).toBe(false)
  })

  it('useIdeTask：卡 id 404 后按任务号逐板标题解析命中；非任务号 404 不扫板', async () => {
    getTaskMock.mockReset().mockRejectedValue(Object.assign(new Error('API Error 404: task not found'), { status: 404 }))
    listBoardsMock.mockReset().mockResolvedValue([{ slug: 'b1' }])
    listTasksMock.mockReset().mockResolvedValue([
      { id: 't1', title: 'DEV-CHWX-S1 契约镜像', status: 'done' },
      { id: 't2', title: 'DEV-CHWX-S10 其他', status: 'todo' },
    ])
    const reader = useIdeTask()
    const r = await reader.resolve('DEV-CHWX-S1')
    expect(r.task?.id).toBe('t1')
    expect(r.board).toBe('b1')
    expect(r.resolvedBy).toBe('task_number')
    expect(r.notFound).toBe(false)

    // S10 按完整任务号命中自己的卡（不是 S1 前缀误配）
    const r10 = await useIdeTask().resolve('DEV-CHWX-S10')
    expect(r10.task?.id).toBe('t2')

    // 卡 id 形态（t_xxx）404：不做标题扫描，直接如实 notFound
    listBoardsMock.mockClear()
    const rMiss = await useIdeTask().resolve('t_nope')
    expect(rMiss.notFound).toBe(true)
    expect(listBoardsMock).not.toHaveBeenCalled()
  })
})

describe('IdeUnmaterializedView（渲染四态）', () => {
  it('未物化 + 任务目录有文件：提示行 + 简报卡 + 任务工作区只读树', async () => {
    listMock.mockResolvedValue({ path: '', entries: [{ name: 'src', isDir: true, size: 0, modified: 0, children: [{ name: 'index.ts', isDir: false, size: 12, modified: 0 }] }] })
    const w = mountView({ state: 'unmaterialized', requestedId: 'DEV-CHWX-S1', task, board: 'hu-channel-wechat', workspacePath: '/ws/t_af224933', workspaceError: null, resolvedBy: 'task_number' })
    await flushPromises()
    expect(w.find('[data-testid="ide-fallback-notice"]').text()).toContain('未物化任务工作区')
    expect(w.find('[data-testid="ide-fallback-title"]').text()).toContain('DEV-CHWX-S1')
    expect(w.find('[data-testid="ide-fallback-status"]').text()).toBe('done')
    expect(w.find('[data-testid="ide-fallback-owner"]').text()).toBe('hu')
    expect(w.find('[data-testid="ide-fallback-run"]').text()).toContain('20261028-v8-run23')
    expect(w.find('[data-testid="ide-fallback-requested-id"]').text()).toContain('DEV-CHWX-S1')
    expect(w.find('[data-testid="ide-fallback-resolved-by"]').text()).toContain('按任务号命中')
    expect(w.find('[data-testid="ide-fallback-task-tree"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-fallback-task-tree"]').text()).toContain('index.ts')
    expect(w.find('[data-testid="stub-default-tree"]').exists()).toBe(false)
    expect(listMock).toHaveBeenCalledWith('t_af224933', 'hu-channel-wechat', 2)
  })

  it('未物化 + 任务目录已回收：提示行 + 默认根只读树 + 回收说明', async () => {
    const w = mountView({ state: 'unmaterialized', requestedId: 't_af224933', task, board: 'hu-channel-wechat', workspacePath: '/ws/t_af224933', workspaceError: null })
    await flushPromises()
    expect(w.find('[data-testid="ide-fallback-default-tree"]').exists()).toBe(true)
    expect(w.find('[data-testid="stub-default-tree"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-fallback-missing-note"]').text()).toContain('回收或未派发')
    expect(w.find('[data-testid="ide-fallback-task-tree"]').exists()).toBe(false)
  })

  it('端点已判 materialized=false：跳过任务目录探测（不触发慢接口），默认根立即呈现', async () => {
    const w = mountView({ state: 'unmaterialized', requestedId: 't_af224933', task, board: 'hu-channel-wechat', workspacePath: '/ws/t_af224933', workspaceError: null, workspaceMaterialized: false })
    await flushPromises()
    expect(listMock).not.toHaveBeenCalled()
    expect(w.find('[data-testid="stub-default-tree"]').exists()).toBe(true)
  })

  it('任务不存在或无权：点名请求 id + 看板入口；不渲染文件树', async () => {
    const w = mountView({ state: 'not_found', requestedId: 'DEV-NOPE-1', task: null, board: null, workspacePath: null, workspaceError: null })
    await flushPromises()
    expect(w.find('[data-testid="ide-fallback-notice"]').text()).toContain('DEV-NOPE-1')
    expect(w.find('[data-testid="ide-fallback-notice"]').text()).toContain('不存在或当前账号无权访问')
    expect(w.find('[data-testid="ide-fallback-title"]').text()).toContain('任务不存在或无权访问')
    expect(w.find('[data-testid="ide-fallback-requested-id"]').text()).toContain('DEV-NOPE-1')
    expect(w.find('[data-testid="ide-fallback-open-board"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-fallback-retry"]').exists()).toBe(true)
    expect(w.find('[data-testid="ide-fallback-files"]').exists()).toBe(false)
    expect(w.find('[data-testid="stub-default-tree"]').exists()).toBe(false)
    expect(listMock).not.toHaveBeenCalled()
    await w.find('[data-testid="ide-fallback-open-board"]').trigger('click')
    expect(w.emitted('open-board')).toBeTruthy()
  })

  it('解析故障：带状态码；不渲染文件树（不装成空目录）；重试可点', async () => {
    const w = mountView({ state: 'resolve_error', requestedId: 't_af224933', task, board: 'hu-channel-wechat', workspacePath: null, workspaceError: { status: 502 } })
    await flushPromises()
    expect(w.find('[data-testid="ide-fallback-notice"]').text()).toContain('HTTP 502')
    expect(w.find('[data-testid="ide-fallback-error-hint"]').text()).toContain('解析服务故障')
    expect(w.find('[data-testid="ide-fallback-files"]').exists()).toBe(false)
    expect(listMock).not.toHaveBeenCalled()
    await w.find('[data-testid="ide-fallback-retry"]').trigger('click')
    expect(w.emitted('retry')).toBeTruthy()
  })

  it('解析中：只出提示行，不下结论', async () => {
    const w = mountView({ state: 'resolving', requestedId: 't_af224933', task: null, board: null, workspacePath: null, workspaceError: null })
    expect(w.find('[data-testid="ide-fallback-notice"]').text()).toContain('正在解析')
    expect(w.find('[data-testid="ide-fallback-brief"]').exists()).toBe(false)
    expect(w.find('[data-testid="ide-fallback-files"]').exists()).toBe(false)
  })

  it('无任务：通用空态文案（组件可复用，不臆断失败）', async () => {
    const w = mountView({ state: 'no_task', requestedId: null, task: null, board: null, workspacePath: null, workspaceError: null })
    expect(w.find('[data-testid="ide-fallback-notice"]').text()).toContain('还没有任务工作区')
  })
})
