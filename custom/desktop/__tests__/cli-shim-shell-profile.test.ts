// 守门测试:patch 270 的 shellProfilePaths bash 候选顺序。
//
// 背景:2026-09-16 审查——bash 分支曾把 .bash_profile 排首,上游 ensureUnixShellPath
// 按列表顺序写第一个可写文件即停,导致:
//   (a) 用户只有发行版默认 ~/.profile 时,新建 .bash_profile 会遮蔽它(bash 登录
//       shell 只 source .bash_profile/.bash_login/.profile 中第一个存在的),
//       用户原有 PATH 条目静默丢失;
//   (b) Linux GUI 终端(mate-terminal/qterminal)默认起交互式非登录 bash,只读
//       .bashrc,写进 .bash_profile 修不到声明要修的目标场景。
// 故 bash(linux,含无 SHELL 兜底)必须 .bashrc 优先。真实写入语义(appendFileSync
// + 命中即 break)属上游 cli-shim,本测试锁注入产物中的顺序回归。
// 此测试读取 inject 注入产物,未就绪时整组 skip(与 after-pack-combined 同款)。
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const overlayRoot = resolve(__dirname, '..', '..', '..')
const cliShimPath = resolve(
  overlayRoot, '..', 'upstream', 'hermes-studio', 'packages', 'desktop', 'src', 'main', 'cli-shim.ts',
)

const readInjected = (): string | null => {
  if (!existsSync(cliShimPath)) return null
  return readFileSync(cliShimPath, 'utf-8')
}

describe('cli-shim shellProfilePaths (patch 270)', () => {
  const src = readInjected()
  const maybeIt = src ? it : it.skip

  maybeIt('bash 分支(含无 SHELL 的 linux 兜底)以 .bashrc 为首选写入目标', () => {
    const match = src!.match(
      /if \(name === 'bash' \|\| \(!name && platform === 'linux'\)\) \{\s*return \[([^\]]+)\]/,
    )
    expect(match, 'patch 270 的 bash 候选分支应存在且覆盖无 SHELL 的 linux').toBeTruthy()
    const entries = match![1].split(',').map(s => s.trim())
    const indexOf = (needle: string) => entries.findIndex(e => e.includes(needle))
    expect(indexOf('.bashrc')).toBeGreaterThanOrEqual(0)
    expect(indexOf('.bash_profile')).toBeGreaterThanOrEqual(0)
    expect(indexOf('.bashrc')).toBeLessThan(indexOf('.bash_profile'))
  })

  maybeIt('shellProfilePaths 已导出(守门测试可直接引用)', () => {
    expect(src).toMatch(/export function shellProfilePaths\(/)
  })
})
