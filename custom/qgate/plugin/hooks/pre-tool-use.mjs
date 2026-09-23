import { stdout } from 'node:process'
import { loadProject } from '../core/loader.js'
import { runGate, gitContext } from '../core/run.js'
import { resolveProfile, effectivePolicy } from '../core/profile.js'
import { selectGates } from '../core/impact.js'
import { tierOfProfile, VERDICT_TO_DELIVERY } from '../core/align.js'
import { resolve } from 'node:path'

async function main() {
  const cwd = resolve(process.cwd())
  const loaded = await loadProject(cwd)
  if (!loaded) return
  const changed = gitContext(cwd).changedPaths
  if (changed.length === 0) return
  const profile = loaded.resolveProfile()
  const enabled = profile.gates.filter((g) => g.spec.enabled ?? true)
  const toRun = selectGates(enabled, changed)
  if (toRun.length === 0) return

  const now = Date.now()
  const results = []
  for (const spec of toRun) {
    const result = await runGate({ spec, trigger: 'before_change', workspace: cwd, qgateDir: loaded.qgateDir, changedPaths: changed })
    const policy = effectivePolicy(spec, profile)
    const isBlocking = (result.run.verdict === 'FAIL' && policy.failure === 'block') ||
        (result.run.verdict === 'INCONCLUSIVE' && policy.inconclusive === 'block')
    results.push({ gate: spec.metadata.id, verdict: result.run.verdict, blocking: isBlocking })
    stdout.write(`[pre-tool-use] ${spec.metadata.id}: ${result.run.verdict}\n`)
  }
  const blocking = results.filter(r => r.blocking)
  if (blocking.length > 0) {
    stdout.write(`[pre-tool-use] BLOCKING: ${blocking.map(b => b.gate).join(', ')}\n`)
    process.exit(1)
  }
}
main().catch(err => {
  console.error('[pre-tool-use] error:', err)
  process.exit(2)
})
