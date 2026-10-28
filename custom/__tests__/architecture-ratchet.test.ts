// 架构棘轮守门（2026-10-28 K19/K20/K21）
//
// 三个大重构不能一次铺开，但可以「锁住现状只许变好」：
//   K19 响应形状统一：ctx.body 直赋与 ok:false 字面量只许减少（新代码走 lib/http.ts）
//   K20 类型门禁：客户端 typecheck 基线只许降低（config/typecheck-client-baseline.json）
//   K21 前端依赖方向：ia2 → cockpit 与 cockpit → ia2 的双向 import 只许减少
//
// 基线数值为 2026-10-28 实测；改动基线必须同时说明减少的批次与本轮验证。
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../..')

function grepCount(pattern: string, paths: string[]): number {
  try {
    // 路径已限定在 custom/server（纯 .ts），不再用 --include（git grep 不支持该 GUN grep 选项）
    const out = execFileSync('git', ['grep', '-rn', pattern, '--', ...paths], { cwd: ROOT, encoding: 'utf8' })
    return out.split('\n').filter(Boolean).length
  } catch {
    return 0
  }
}

describe('架构棘轮：只许减少', () => {
  it('K19 服务端仍手写 ctx.body 的地方不超过 1193 处（新增请用 lib/http.ts）', () => {
    const n = grepCount('ctx\\.body\\s*=', ['custom/server'])
    expect(n, `新增了直接 ctx.body 赋值——请改用 custom/server/lib/http.ts（当前 ${n}）`).toBeLessThanOrEqual(1193)
  })

  it('K19 `ok: false` 字面量不超过 874 处（新失败体请用 fail()）', () => {
    const n = grepCount('ok:\\s*false', ['custom/server'])
    expect(n, `新增了手写 ok:false——请改用 fail()/unavailable()`).toBeLessThanOrEqual(874)
  })

  it('K21 ia2 依赖 cockpit 的 import 必须为 0（数据层已下沉 shared）', () => {
    const n = execFileSync('bash', ['-c', "grep -rn \"from '@/custom/cockpit\" custom/client/ia2 | wc -l"], { cwd: ROOT, encoding: 'utf8' }).trim()
    expect(Number(n), 'ia2 又新增了对 cockpit 的依赖——请下沉到 custom/client/shared').toBe(0)
  })

  it('K21 cockpit 依赖 ia2 的 import 必须为 0（workspace 已下沉 shared）', () => {
    const n = execFileSync('bash', ['-c', "grep -rn \"from '@/custom/ia2\" custom/client/cockpit | wc -l"], { cwd: ROOT, encoding: 'utf8' }).trim()
    expect(Number(n), 'cockpit 又新增了对 ia2 的依赖（反向环）——请下沉到 custom/client/shared').toBe(0)
  })

  it('K21 shared 内核不得反向依赖 ia2/cockpit（下沉层单向）', () => {
    const n = execFileSync('bash', ['-c', "grep -rn \"from '@/custom/\\(ia2\\|cockpit\\)\" custom/client/shared | wc -l"], { cwd: ROOT, encoding: 'utf8' }).trim()
    expect(Number(n), 'shared 出现对域的反向依赖——共享层必须保持自底向上').toBe(0)
  })

  it('K20 客户端类型基线存在且可读（typecheck:client 生成）', () => {
    const f = resolve(ROOT, 'config/typecheck-client-baseline.json')
    expect(existsSync(f), '缺客户端类型基线——先跑 npm run typecheck:client').toBe(true)
    const baseline = JSON.parse(readFileSync(f, 'utf8')) as { errors?: number; generatedAt?: string }
    expect(typeof baseline.errors).toBe('number')
  })

  it('K19 统一响应出口存在（lib/http.ts 的六个语义）', () => {
    const src = readFileSync(resolve(ROOT, 'custom/server/lib/http.ts'), 'utf8')
    for (const fn of ['export function ok(', 'export function created(', 'export function fail(', 'export function unavailable(', 'export function bodyOf', 'export function writeDenied(']) {
      expect(src, `lib/http.ts 缺 ${fn}`).toContain(fn)
    }
  })
})
