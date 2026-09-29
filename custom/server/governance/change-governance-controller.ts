/**
 * 需求变更治理 REST（/api/change-gov/*）——调研落地轮 2026-09-29。
 *
 *   GET  /api/change-gov/meta                级别/SLA/五维词表/管控基准/冻结层级（前端单一事实源）
 *   GET  /api/change-gov/requests?status=&level=   变更单清单
 *   POST /api/change-gov/requests            新建（草稿）
 *   PATCH /api/change-gov/requests/:id       草稿编辑
 *   POST /api/change-gov/requests/:id/submit     提交评审（落 SLA 时限 + 冻结穿透判定）
 *   POST /api/change-gov/requests/:id/resubmit   驳回后重提（计一次通过率分母）
 *   POST /api/change-gov/requests/:id/decide     决议 approve/reject（冻结窗口 409 拦截）
 *   POST /api/change-gov/requests/:id/implement  实施登记（回填返工工时）
 *   GET  /api/change-gov/metrics?month=YYYY-MM    管控基准指标（实绩 vs 基准 vs 判定）
 *   GET  /api/change-gov/freeze-windows      冻结窗口清单
 *   POST /api/change-gov/freeze-windows      新建窗口（三级）
 *   PATCH /api/change-gov/freeze-windows/:id 启停
 *
 * 方法论与设计：docs/2026-09-29-change-gov-three-accounts-research.md。
 * 存储：change-governance-store（node:sqlite，CHANGE_GOV_DB 可覆写）。
 * 挂载：patch 506 在 bootstrap/routes.ts（与 490 同款两行）——控制面独立成文件，
 * series 台账在案惯例：已挂控制器追加端点在活进程不生效，端点组独立文件+独立挂载。
 */
import Router from '@koa/router'
import {
  CHANGE_LEVELS, FreezeGateError, type CreateChangeInput,
  changeGovMeta, computeMetrics, createFreezeWindow, createRequest, decideRequest,
  getRequest, implementRequest, listFreezeWindows, listRequests, resubmitRequest,
  setFreezeActive, submitRequest, updateDraft,
} from './change-governance-store'

const router = new Router({ prefix: '/api/change-gov' })

function fail(ctx: { status: number; body: unknown }, status: number, error: unknown): void {
  ctx.status = status
  ctx.body = { ok: false, error: error instanceof Error ? error.message : String(error) }
}

router.get('/meta', (ctx) => {
  ctx.body = { ok: true, ...changeGovMeta() }
})

router.get('/requests', (ctx) => {
  const status = typeof ctx.query.status === 'string' && ctx.query.status ? ctx.query.status : undefined
  const levelRaw = Number(ctx.query.level)
  const level = Number.isFinite(levelRaw) && levelRaw >= 1 && levelRaw <= 4 ? levelRaw : undefined
  ctx.body = { ok: true, items: listRequests({ status, level }), levels: CHANGE_LEVELS }
})

router.post('/requests', (ctx) => {
  try {
    const item = createRequest((ctx.request.body ?? {}) as unknown as CreateChangeInput)
    ctx.status = 201
    ctx.body = { ok: true, item }
  } catch (e) {
    fail(ctx, 400, e)
  }
})

for (const [path, fn] of [
  ['/requests/:id/submit', submitRequest],
  ['/requests/:id/resubmit', resubmitRequest],
] as const) {
  router.post(path, (ctx) => {
    try {
      ctx.body = { ok: true, item: fn(String(ctx.params.id)) }
    } catch (e) {
      fail(ctx, 400, e)
    }
  })
}

router.patch('/requests/:id', (ctx) => {
  try {
    ctx.body = { ok: true, item: updateDraft(String(ctx.params.id), (ctx.request.body ?? {}) as unknown as Partial<CreateChangeInput>) }
  } catch (e) {
    fail(ctx, 400, e)
  }
})

router.post('/requests/:id/decide', (ctx) => {
  try {
    const item = decideRequest(String(ctx.params.id), (ctx.request.body ?? {}) as unknown as Parameters<typeof decideRequest>[1])
    ctx.body = { ok: true, item }
  } catch (e) {
    if (e instanceof FreezeGateError) {
      ctx.status = 409
      ctx.body = { ok: false, error: e.message, code: 'freeze_gate', window: e.windowName, tier: e.tierName }
      return
    }
    fail(ctx, 400, e)
  }
})

router.post('/requests/:id/implement', (ctx) => {
  try {
    const body = (ctx.request.body ?? {}) as { rework_hours?: unknown }
    ctx.body = { ok: true, item: implementRequest(String(ctx.params.id), Number(body.rework_hours ?? 0)) }
  } catch (e) {
    fail(ctx, 400, e)
  }
})

router.get('/metrics', (ctx) => {
  try {
    const month = typeof ctx.query.month === 'string' ? ctx.query.month : undefined
    ctx.body = { ok: true, ...computeMetrics(month) }
  } catch (e) {
    fail(ctx, 400, e)
  }
})

router.get('/freeze-windows', (ctx) => {
  ctx.body = { ok: true, items: listFreezeWindows() }
})

router.post('/freeze-windows', (ctx) => {
  try {
    ctx.status = 201
    ctx.body = { ok: true, item: createFreezeWindow((ctx.request.body ?? {}) as unknown as Parameters<typeof createFreezeWindow>[0]) }
  } catch (e) {
    fail(ctx, 400, e)
  }
})

router.patch('/freeze-windows/:id', (ctx) => {
  try {
    const body = (ctx.request.body ?? {}) as { active?: unknown }
    if (typeof body.active !== 'boolean') {
      fail(ctx, 400, new Error('active 必须是布尔'))
      return
    }
    ctx.body = { ok: true, item: setFreezeActive(String(ctx.params.id), body.active) }
  } catch (e) {
    fail(ctx, 400, e)
  }
})

// 兜底：单条查询（放最后避免吞 /:id 类子路由——与 fleet 路由序同一教训）
router.get('/requests/:id', (ctx) => {
  try {
    ctx.body = { ok: true, item: getRequest(String(ctx.params.id)) }
  } catch (e) {
    fail(ctx, 404, e)
  }
})

export const changeGovRoutes = router
