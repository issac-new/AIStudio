// 守门：仓库级 scope.yaml 是「作业区围栏」，不是逐批改动清单（2026-11-12 设计复盘 P0-3）。
// 病：旧做法每批追加具体文件路径，4 周 19→848 行、721 条（70 条宽 glob），范围门逐日失效。
// 本测试锁三件事：条目上限、条目形态（目录/** 或根文件白名单）、不得出现具体文件路径。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SCOPE = resolve(ROOT, '.qgate/scope.yaml')

// 根文件白名单：仓库级配置与入口（不含任何子目录文件）
const ROOT_FILES = new Set([
  'AGENTS.md', 'README.md', 'RELEASE-NOTES.md', 'RELEASE-MANIFEST.json',
  'package.json', 'package-lock.json', 'runtime-manifest.json',
  'vite.config.overlay.mts', 'vitest.config.ts', 'tsconfig.json', 'tsconfig.client.json',
  '.gitignore', '.gitattributes', '.npmrc', '.gitleaks.toml', '.env.example',
])

function entries(): string[] {
  return readFileSync(SCOPE, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim().replace(/^"(.*)"$/, '$1'))
}

function isDirGlob(entry: string): boolean {
  return /^[^/]+\/\*\*$/.test(entry) || /^\.[^/]+\/\*\*$/.test(entry)
}

describe('仓库 scope 围栏（L0.scope-check 输入）', () => {
  it('条目数 ≤ 60（禁止退化为逐批清单）', () => {
    expect(entries().length, `scope.yaml 条目 ${entries().length} 条，已超过围栏上限`).toBeLessThanOrEqual(60)
  })

  it('每个条目只能是目录/** 或根文件白名单（拒绝具体文件路径）', () => {
    const bad = entries().filter((entry) => !isDirGlob(entry) && !ROOT_FILES.has(entry))
    expect(bad, `以下条目是具体文件路径或未知根文件，应改为目录围栏或从清单移除：\n${bad.join('\n')}`).toEqual([])
  })

  it('围栏必须覆盖源码与文档作业区（防误删成空围栏）', () => {
    const set = new Set(entries())
    for (const required of ['custom/**', 'docs/**', 'scripts/**', 'patches/**', 'runtime/**', 'simharness/**']) {
      expect(set.has(required), `围栏缺少 ${required}`).toBe(true)
    }
  })

  it('L0.scope-check 声明可选 task-intent（登记后取围栏∩意图）', () => {
    const gate = readFileSync(resolve(ROOT, 'custom/qgate/gate-packs/l0/gates/scope-check.yaml'), 'utf8')
    expect(gate).toMatch(/taskIntent:\s*\n\s*file:\s*"\.qgate\/registers\/task-intent\.json"/)
    expect(gate).toMatch(/require:\s*false/)
  })
})
