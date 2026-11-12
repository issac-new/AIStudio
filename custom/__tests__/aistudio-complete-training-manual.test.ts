import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Server } from 'node:http'
import { createTrainingServer } from '../../scripts/start-training-manual.mjs'

// AIStudio 完整培训手册（含 swarm-yuan）的结构与事实守门。
// 单一事实源：本文件只断言“手册必须覆盖什么”，具体数字仍以手册引用的事实源为准。
const root = resolve(import.meta.dirname, '../..')
const manualPath = resolve(root, 'docs/manuals/aistudio-complete-training-manual.html')
const html = readFileSync(manualPath, 'utf8')
let server: Server | null = null

afterEach(async () => {
  if (!server) return
  await new Promise<void>(resolveClose => server!.close(() => resolveClose()))
  server = null
})

describe('AIStudio 完整培训手册契约', () => {
  it('是单文件自包含文档：不加载任何外部脚本、样式、图片或字体', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).not.toMatch(/<script[^>]+src=/i)
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/i)
    expect(html).not.toMatch(/<img[^>]+src=["']https?:/i)
    expect(html).not.toMatch(/@import\s+url\(/i)
    expect(html).not.toMatch(/(?:src|href)=["'](?:https?:)?\/\//i)
    expect(html.length).toBeGreaterThan(20000)
  })

  it('五段结构与十四张图齐备，每张图都有编号与图注', () => {
    const ids = [...html.matchAll(/<section class="chapter" id="(s\d+)">/g)].map(match => match[1])
    expect(ids).toEqual(['s1', 's2', 's3', 's4', 's5'])
    const figures = [...html.matchAll(/<figure>([\s\S]*?)<\/figure>/g)].map(match => match[1])
    expect(figures).toHaveLength(14)
    figures.forEach((figure, index) => {
      expect(figure, `图 ${index + 1} 缺 SVG`).toContain('<svg')
      expect(figure, `图 ${index + 1} 缺图注`).toMatch(new RegExp(`图 ${index + 1} `))
      expect(figure, `图 ${index + 1} 缺无障碍标签`).toMatch(/aria-label="[^"]+"/)
    })
    for (const match of html.matchAll(/<a href="#(s\d+)">/g)) expect(html).toContain(`id="${match[1]}"`)
  })

  it('覆盖 15 分钟课程的五段主线与关键机制', () => {
    for (const needle of [
      '人定方向，机器守门，AI 干活',
      '三层投影',
      '四论',
      '15 分钟',
      '手册结构',
      '人机界面层',
      '组织控制层',
      '机制执行层',
      '四个模块',
      '九节点',
      '四阶段',
      '五项能力',
      '六层实现',
      'SOP',
      '三类目录',
      'Step 1—5',
      'Step 10—13',
      'strict 终检',
      '59 道门禁',
      '四层拦截',
      '吸收来源',
      'AIStudio（hermes agent teams）',
      'swarm-yuan skill',
      'Ycode',
      '五个关键问题与对应措施',
      '可靠、准确、有效如何保证',
      '五条基本原则',
    ]) expect(html, `缺少主题：${needle}`).toContain(needle)
  })

  it('关键事实与当前版本一致，且不隐藏边界', () => {
    for (const fact of ['1.0.15-overlay', '0.8.20-studio.2', 'v0.23.1-team.2', '3.18.0', 'v2.100.3']) {
      expect(html, `版本缺失：${fact}`).toContain(fact)
    }
    for (const fact of ['59', '204']) {
      expect(html, `事实缺失：${fact}`).toContain(fact)
    }
    expect(html).toContain('全部通过不等同于业务正确')
    expect(html).toContain('真实缺陷语料仍在采集')
    expect(html).not.toContain('【待补】')
    // 手册不写自身编写过程与作者验证记录
    expect(html).not.toContain('本手册没有验证')
    expect(html).not.toContain('编制日期')
    expect(html).not.toContain('这份手册')
    expect(html).not.toContain('自包含文档')
    expect(html).not.toContain('AI 工厂')
    expect(html).not.toContain('学习路径')
    expect(html).not.toContain('导读')
  })

  it('按 A4 纵向排版，打印时隐藏侧栏并避免图表被截断', () => {
    expect(html).toContain('@page{size:A4 portrait')
    expect(html).toContain('@media print')
    expect(html).toContain('.toc{display:none')
    expect(html).toMatch(/figure,table,\.op,\.card,\.note\{break-inside:avoid\}/)
    expect(html).not.toContain('<table>')
    expect((html.match(/<figure>/g) ?? []).length).toBeGreaterThanOrEqual(14)
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
