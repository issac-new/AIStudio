import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Server } from 'node:http'
import { createTrainingServer } from '../../scripts/start-training-manual.mjs'

// AIStudio 15 分钟演示稿契约：PPT 形态、图为主、来源合并为末尾附录台账。
const root = resolve(import.meta.dirname, '../..')
const manualPath = resolve(root, 'docs/manuals/aistudio-complete-training-manual.html')
const html = readFileSync(manualPath, 'utf8')
let server: Server | null = null

afterEach(async () => {
  if (!server) return
  await new Promise<void>(resolveClose => server!.close(() => resolveClose()))
  server = null
})

describe('AIStudio 15 分钟演示稿契约', () => {
  it('是单文件自包含演示稿：无外部脚本、样式、图片或字体', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).not.toMatch(/<script[^>]+src=/i)
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/i)
    expect(html).not.toMatch(/<img[^>]+src=["']https?:/i)
    expect(html).not.toMatch(/@import\s+url\(/i)
    expect(html).not.toMatch(/(?:src|href)=["'](?:https?:)?\/\//i)
    expect(html.length).toBeGreaterThan(20000)
  })

  it('PPT 形态：十五页、十二张图、末尾一页附录台账', () => {
    expect((html.match(/<section class="slide/g) ?? [])).toHaveLength(15)
    expect((html.match(/<svg/g) ?? [])).toHaveLength(12)
    expect((html.match(/class="ledger"/g) ?? [])).toHaveLength(1)
    expect((html.match(/<table/g) ?? [])).toHaveLength(1)
    expect(html).toContain('class="slide cover"')
    expect(html).toContain('aspect-ratio:16/9')
    expect(html).toContain('@page{size:A4 landscape')
    expect(html).toContain('container-type:inline-size')
    expect(html).toContain('100vh * 16 / 9')
    expect(html).toContain('requestFullscreen')
    expect(html).toContain('html:fullscreen .slide')
  })

  it('每页有页脚，图表有图注与无障碍标签', () => {
    const slides = [...html.matchAll(/<section class="slide([\s\S]*?)<\/section>/g)].map(match => match[0])
    slides.slice(1).forEach((slide, index) => {
      expect(slide, `第 ${index + 2} 页缺页脚`).toContain('class="slide-foot"')
    })
    const figures = [...html.matchAll(/<figure[\s\S]*?<\/figure>/g)].map(match => match[0])
    for (const figure of figures) {
      expect(figure).toMatch(/aria-label="[^"]+"/)
    }
  })

  it('覆盖全景、系统、流程、机制与三项来源清单', () => {
    for (const needle of [
      '人定方向，机器守门，AI 干活',
      '全景：这套系统凭什么保证质量',
      '判断依据：四论与三维保障',
      '五条原则',
      '五个关键问题与对应措施',
      '系统：四个模块与六类团队角色',
      '发布判断：四项条件同时成立',
      '流程：九节点、四阶段、六道质量门',
      '研发能力 SOP 化与五项能力',
      '六层实现',
      '技术递进：从技能封装到多智能体记忆',
      '生成与激活',
      '守门与证据',
      '收束：机制让正确做法成为默认路径',
      '附录：来源台账',
    ]) expect(html, `缺少页面：${needle}`).toContain(needle)
  })

  it('关键事实与版本一致，指南核心理念不缺失，边界不隐藏', () => {
    for (const fact of ['1.0.15-overlay', '0.8.20-studio.2', 'v0.23.1-team.2', '3.18.0', 'v2.100.3']) {
      expect(html, `版本缺失：${fact}`).toContain(fact)
    }
    for (const fact of ['SOP', '五项能力', '六层', '三类目录', '六段目录', '档位', 'SCHEMA_EPOCH', 'lessons', '59 道门禁', 'gate-runs', '四层拦截', '变异验证', 'ACP', 'R134', 'skill → spec → loop → graph → harness → multi-agent（memory）']) {
      expect(html, `核心理念缺失：${fact}`).toContain(fact)
    }
    expect(html).toContain('全部通过不等同于业务正确')
    expect(html).toContain('真实缺陷语料仍在采集')
    expect(html).not.toContain('【待补】')
    expect(html).not.toContain('编制日期')
    expect(html).not.toContain('这份手册')
    expect(html).not.toContain('AI 工厂')
    expect(html).not.toContain('导读')
  })

  it('启动器放行该页并保持只读安全边界', async () => {
    server = createTrainingServer()
    await new Promise<void>(resolveListen => server!.listen(0, '127.0.0.1', () => resolveListen()))
    const address = server.address()
    const port = address && typeof address !== 'string' ? address.port : 0
    const response = await fetch(`http://127.0.0.1:${port}/aistudio-complete-training-manual.html`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(response.headers.get('content-security-policy')).toContain("connect-src 'none'")
    expect(await response.text()).toContain('人定方向，机器守门，AI 干活')
  })
})
