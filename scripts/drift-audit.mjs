// 漂移盘点：series 全表 vs upstream 双树三态判定（只读，不改树）
// 三态：APPLIED（--check -R 过）/ MISSING（--check 过）/ REWRITTEN（两者都不过）
import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'
import { isHermesAgentPatchPath } from './inject.mjs'

const overlayRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const patchDir = resolve(overlayRoot, 'patches')
const upstreamBase = process.env.OVERLAY_UPSTREAM_ROOT?.trim()
  ? resolve(process.env.OVERLAY_UPSTREAM_ROOT.trim())
  : resolve(overlayRoot, '..', 'upstream')

const series = readFileSync(resolve(patchDir, 'series'), 'utf-8')
  .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))

function targetRoot(name) {
  const text = readFileSync(resolve(patchDir, name), 'utf-8')
  const m = text.match(/^(?:---|\+\+\+) [ab]\/(.+?)$/m)
  return m && isHermesAgentPatchPath(m[1])
    ? resolve(upstreamBase, 'hermes-agent')
    : resolve(upstreamBase, 'hermes-studio')
}

const rows = { APPLIED: [], MISSING: [], REWRITTEN: [], NOFILE: [] }
for (const name of series) {
  const p = resolve(patchDir, name)
  if (!existsSync(p)) { rows.NOFILE.push(name); continue }
  const root = targetRoot(name)
  const opts = { cwd: root, encoding: 'utf-8', stdio: 'pipe' }
  let reverse = true, forward = true
  try { execSync(`git apply --check -R ${JSON.stringify(p)}`, opts) } catch { reverse = false }
  try { execSync(`git apply --check ${JSON.stringify(p)}`, opts) } catch { forward = false }
  if (reverse) rows.APPLIED.push(name)
  else if (forward) rows.MISSING.push(name)
  else rows.REWRITTEN.push(name)
}
console.log(`series 总数 ${series.length}`)
console.log(`APPLIED(已应用) ${rows.APPLIED.length}`)
console.log(`MISSING(未应用可正打) ${rows.MISSING.length}`)
console.log(`REWRITTEN(不可逆不可正打) ${rows.REWRITTEN.length}`)
if (rows.NOFILE.length) console.log(`NOFILE ${rows.NOFILE.length}: ${rows.NOFILE.join(', ')}`)
console.log('\n-- MISSING 前 40 --'); rows.MISSING.slice(0, 40).forEach(n => console.log(' ', n))
console.log('\n-- REWRITTEN 全部 --'); rows.REWRITTEN.forEach(n => console.log(' ', n))
