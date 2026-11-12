// overlay[action-ledger]：副作用动作三态账本行为门（2026-11-12 handbook 吸收）。
// 真实 import 插件并驱动 pre/post hook；账本落 mkdtemp，不碰用户 ~/.hermes。
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hermes-agent-plugins', 'action-ledger')

function runPlugin(body: string, extraEnv: Record<string, string> = {}): any {
  const py = `
import importlib.util, sys, os, json, glob, tempfile
ledger_dir = tempfile.mkdtemp(prefix='action-ledger-')
os.environ['HERMES_ACTION_LEDGER_DIR'] = ledger_dir
${Object.entries(extraEnv).map(([k, v]) => `os.environ[${JSON.stringify(k)}] = ${JSON.stringify(v)}`).join('\n')}
spec = importlib.util.spec_from_file_location('al', ${JSON.stringify(join(pluginDir, '__init__.py'))})
m = importlib.util.module_from_spec(spec)
sys.modules['al'] = m
spec.loader.exec_module(m)
result = {}
${body}
path = os.path.join(ledger_dir, 'ledger.jsonl')
rows = [json.loads(line) for line in open(path, encoding='utf-8')] if os.path.exists(path) else []
result['rows'] = rows
print(json.dumps(result, ensure_ascii=False))
`
  const out = execFileSync('python3', ['-c', py], { encoding: 'utf8' })
  return JSON.parse(out.trim())
}

describe('action-ledger 三态账本', () => {
  it('intent→confirmed：成功结算带 external_ref；只读工具不记账', () => {
    const out = runPlugin(`
result['pre'] = m.pre_tool_call(tool_name='terminal', args={'cmd':'refund 1'}, session_id='s1', tool_call_id='tc1')
m.post_tool_call(tool_name='terminal', args={'cmd':'refund 1'}, session_id='s1', tool_call_id='tc1', status='ok', result={'refund_id':'RF-1'})
m.pre_tool_call(tool_name='read_file', args={'path':'x'}, session_id='s1', tool_call_id='tc2')
m.post_tool_call(tool_name='read_file', args={'path':'x'}, session_id='s1', tool_call_id='tc2', status='ok')
`)
    const rows = out.rows
    expect(out.pre).toBeNull()
    expect(rows.filter((r: any) => r.tool === 'terminal')).toHaveLength(2)
    expect(rows.find((r: any) => r.event === 'intent')).toMatchObject({ status: 'intended', tool: 'terminal' })
    expect(rows.find((r: any) => r.event === 'confirmed')).toMatchObject({ status: 'confirmed', external_ref: 'RF-1' })
    expect(rows.some((r: any) => r.tool === 'read_file')).toBe(false)
  })

  it('超时/未知结算写 sent，不写 failed；guard 开启后同键未结算会 block', () => {
    const out = runPlugin(`
m.pre_tool_call(tool_name='terminal', args={'cmd':'refund 2'}, session_id='s1', tool_call_id='tc3')
m.post_tool_call(tool_name='terminal', args={'cmd':'refund 2'}, session_id='s1', tool_call_id='tc3', status='error', error_message='timed out after 30s')
result['second'] = m.pre_tool_call(tool_name='terminal', args={'cmd':'refund 2'}, session_id='s1', tool_call_id='tc4')
`, { HERMES_ACTION_LEDGER_GUARD: '1', HERMES_ACTION_LEDGER_STALE_SECONDS: '300' })
    const rows = out.rows
    expect(rows.find((r: any) => r.event === 'sent')).toMatchObject({ status: 'sent', error_class: 'timeout_or_unknown' })
    expect(rows.some((r: any) => r.event === 'failed')).toBe(false)
    expect(out.second).toMatchObject({ action: 'block' })
    expect(String(out.second.message)).toContain('ACTION_LEDGER_BLOCKED')
    expect(rows.some((r: any) => r.event === 'blocked')).toBe(true)
  })

  it('guard 关闭时同键未结算只记账、不拦', () => {
    const out = runPlugin(`
m.pre_tool_call(tool_name='terminal', args={'cmd':'refund 3'}, session_id='s1', tool_call_id='tc5')
m.post_tool_call(tool_name='terminal', args={'cmd':'refund 3'}, session_id='s1', tool_call_id='tc5', status='error', error_message='connection reset')
result['second'] = m.pre_tool_call(tool_name='terminal', args={'cmd':'refund 3'}, session_id='s1', tool_call_id='tc6')
`)
    expect(out.second).toBeNull()
    expect(out.rows.filter((r: any) => r.event === 'intent')).toHaveLength(2)
  })
})
