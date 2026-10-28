// custom/server/lib/http.ts
// 服务端 HTTP 响应形状的单一入口（2026-10-28 K19 收敛起点）。
//
// 现状问题（对账实测）：`ctx.body=` 直接赋值 1376 处，失败体键名三套并行——
// `detail`(157) / `error`(104) / `problems`(131)，另有 200 + `ok:false` 与 4xx 混用。
// 客户端只按 HTTP 状态判失败时，200+`ok:false` 会被当成成功数据。
//
// 本模块只做「新增代码的单一写法」，不强行改写存量（存量按域灰度，见架构棘轮守门）：
//   ok(ctx, data)                → 200 { ok: true, ...data }
//   created(ctx, data, location) → 201 { ok: true, ...data } + Location 头
//   fail(ctx, status, error, o)  → status≥400 { ok: false, error, code?, problems? }
//   unavailable(ctx, note)       → 200 { ok: true, available: false, note }（读模型降级）
//   bodyOf(ctx) / writeDenied(ctx)  → 入参与 403 的统一实现
import type { Context } from 'koa'

export interface FailOptions {
  /** 机器可读错误码（前端据此分支，不用文案匹配） */
  code?: string
  /** 结构化问题清单（校验类） */
  problems?: string[]
  /** 附加字段（不含 ok/error 保留键） */
  extra?: Record<string, unknown>
}

/** 成功（读/写通用）：HTTP 200 + ok:true */
export function ok(ctx: Context, data: Record<string, unknown> = {}): void {
  ctx.status = 200
  ctx.body = { ok: true, ...data }
}

/** 创建成功：HTTP 201 + ok:true + Location */
export function created(ctx: Context, data: Record<string, unknown> = {}, location?: string): void {
  ctx.status = 201
  if (location) ctx.set('Location', location)
  ctx.body = { ok: true, ...data }
}

/** 失败：HTTP 非 2xx（缺省 400）+ ok:false + error 一句话 + 可选 code/problems */
export function fail(ctx: Context, status: number, error: string, opts: FailOptions = {}): void {
  ctx.status = status >= 400 ? status : 400
  ctx.body = {
    ok: false,
    error,
    ...(opts.code ? { code: opts.code } : {}),
    ...(opts.problems ? { problems: opts.problems } : {}),
    ...(opts.extra ?? {}),
  }
}

/** 读模型降级：源缺席但请求本身成功（fail-soft，不猜数） */
export function unavailable(ctx: Context, note?: string): void {
  ctx.status = 200
  ctx.body = { ok: true, available: false, ...(note ? { note } : {}) }
}

/** 请求体（空体返回 {}，避免各处重复 `(ctx.request.body ?? {})` 断言） */
export function bodyOf<T extends Record<string, unknown> = Record<string, unknown>>(ctx: Context): T {
  return ((ctx.request as { body?: unknown }).body ?? {}) as T
}

/** 权限拒绝：403 + ok:false + code */
export function writeDenied(ctx: Context, error = '权限不足', code = 'forbidden'): void {
  fail(ctx, 403, error, { code })
}
