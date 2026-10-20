// 日常/推演导航域守门：共享技术组件可以，业务读面不互相侵入。
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { areaForPath } from '../routes'
import { activeStagesForRoute, centerForPath } from '../nav-centers'

const ROOT = resolve(__dirname, '..')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = resolve(dir, name)
    if (statSync(p).isDirectory()) return walk(p)
    return p.endsWith('.vue') || p.endsWith('.ts') ? [p] : []
  })
}

describe('daily/simulation domain split', () => {
  it('/app/sim* 不高亮任何日常阶段', () => {
    expect(areaForPath('/app/sim')).toBeNull()
    expect(centerForPath('/app/sim/evidence')).toBeNull()
    expect(activeStagesForRoute('ia2.simEvidence', '/app/sim/evidence', 4)).toEqual([])
  })

  it('阶段页不得 import 推演视图/API/运行上下文', () => {
    const offenders: string[] = []
    for (const p of walk(resolve(ROOT, 'views/stage'))) {
      const src = readFileSync(p, 'utf8')
      if (/from ['\"].*(views\/sim|api\/sim-|composables\/useRunContext)/.test(src)) offenders.push(p)
    }
    expect(offenders).toEqual([])
  })

  it('推演视图不得 import 日常工作台 store', () => {
    const offenders: string[] = []
    for (const p of walk(resolve(ROOT, 'views/sim'))) {
      const src = readFileSync(p, 'utf8')
      if (/store\/workspace|useDecisionRows/.test(src)) offenders.push(p)
    }
    expect(offenders).toEqual([])
  })
})
