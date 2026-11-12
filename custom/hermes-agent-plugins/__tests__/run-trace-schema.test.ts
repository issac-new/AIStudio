// overlay[run-trace]: schema 1.2 行为门（2026-11-12 ai-agent-handbook 吸收）。
// 真实 import 插件并驱动 hook：验证 span_kind/关联字段/Context Manifest/HITL 边界，
// 以及旧行（只有 kind/phase）仍可写。纯结构断言不能替代真实 import。
import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'hermes-agent-plugins', 'run-trace')

function runPlugin(body: string): any {
  const py = `
import importlib.util, sys, os, json, glob, tempfile
trace_dir = tempfile.mkdtemp(prefix='rt-schema-')
os.environ['HERMES_RUN_TRACE_DIR'] = trace_dir
os.environ['HERMES_RUN_TRACE_PERMISSION_MODE'] = 'acceptEdits'
spec = importlib.util.spec_from_file_location('rt', ${JSON.stringify(join(pluginDir, '__init__.py'))})
m = importlib.util.module_from_spec(spec)
sys.modules['rt'] = m
spec.loader.exec_module(m)
class Ctx:
    def __init__(self): self.hooks = {}
    def register_hook(self, name, fn): self.hooks[name] = fn
ctx = Ctx(); m.register(ctx)
${body}
files = glob.glob(os.path.join(trace_dir, '*.jsonl'))
rows = [json.loads(line) for line in open(files[0], encoding='utf-8')]
print(json.dumps(rows, ensure_ascii=False))
`
  const out = execFileSync('python3', ['-c', py], { encoding: 'utf8' })
  return JSON.parse(out.trim())
}

describe('run-trace schema 1.2', () => {
  it('header/llm/tool/step/compaction/hitl 全链落 span_kind 与关联字段', () => {
    const rows = runPlugin(`
ctx.hooks['on_session_start'](session_id='s1', task_id='t1', model='m1', provider='p1')
ctx.hooks['pre_api_request'](session_id='s1', task_id='t1', turn_id='turn1', api_request_id='api1', model='m1', provider='p1', request_messages=[{'role':'user','content':'hi'}], system_prompt='SYS', message_count=1, tool_count=2, approx_input_tokens=10, request_char_count=40, started_at=100.0, retry_count=2)
ctx.hooks['post_api_request'](session_id='s1', task_id='t1', turn_id='turn1', api_request_id='api1', usage={'input_tokens':10,'output_tokens':5}, finish_reason='stop', started_at=100.0, ended_at=101.0, retry_count=2)
ctx.hooks['pre_tool_call'](session_id='s1', task_id='t1', turn_id='turn1', tool_call_id='tc1', tool_name='terminal', args={'cmd':'ls'})
ctx.hooks['post_tool_call'](session_id='s1', task_id='t1', turn_id='turn1', tool_call_id='tc1', tool_name='terminal', result='ok', status='ok', duration_ms=5)
ctx.hooks['pre_llm_call'](session_id='s1', task_id='t1', turn_id='turn1', model='m1', conversation_history=[])
ctx.hooks['post_llm_call'](session_id='s1', task_id='t1', turn_id='turn1', model='m1', assistant_response='done', conversation_history=[])
ctx.hooks['post_compaction'](session_id='s1', kind='history', reason='auto', before_tokens=100, after_tokens=40, messages_removed=3)
ctx.hooks['on_human_input_request'](session_id='s1', request_id='req1', kind='approval', platform='cli', prompt='sudo secret')
ctx.hooks['on_human_input_resolved'](session_id='s1', request_id='req1', outcome='approved')
ctx.hooks['on_session_end'](session_id='s1', task_id='t1', outcome='ok', ended_at=102.0)
`)
    const header = rows.find((r: any) => r.type === 'header')
    expect(header.version).toBe('1.2.0')
    expect(header.schema_version).toBe('1.2.0')
    expect(header.trace_id).toBeTruthy()

    const manifest = rows.find((r: any) => r.kind === 'context_manifest')
    expect(manifest).toBeTruthy()
    expect(manifest.manifest_version).toBe('1.0')
    expect(manifest.context_fingerprint).toMatch(/^sha256:/)
    expect(manifest.sources.some((s: any) => s.source_type === 'system_prompt')).toBe(true)
    expect(manifest.sources.some((s: any) => s.permission_basis === 'acceptEdits')).toBe(true)
    expect(manifest.message_count).toBe(1)
    expect(manifest.tool_count).toBe(2)

    const llmPost = rows.find((r: any) => r.kind === 'llm_span' && r.phase === 'post')
    expect(llmPost.span_kind).toBe('llm')
    expect(llmPost.attempt_id).toBe('api1:r2')
    expect(llmPost.retry_count).toBe(2)

    expect(rows.filter((r: any) => r.kind === 'step_span')).toHaveLength(2)
    expect(rows.find((r: any) => r.kind === 'step_span' && r.span_phase === 'end').step_semantics).toBe('model_turn')
    expect(rows.find((r: any) => r.kind === 'compaction_span').span_kind).toBe('compaction')
    const hitl = rows.filter((r: any) => r.kind === 'hitl_span')
    expect(hitl).toHaveLength(2)
    expect(hitl[0].trace_boundary).toBe('interrupt')
    expect(hitl[1].trace_boundary).toBe('resume')
    expect(hitl[0].prompt_chars).toBe(11)
    expect(hitl[0].prompt).toBeUndefined()
  })

  it('旧行（只有 kind/phase）保持可写，不被新必填字段拒绝', () => {
    const rows = runPlugin(`
ctx.hooks['on_session_start'](session_id='s1', task_id='t1')
m._write_jsonl_line(m._lookup_state('s1','t1').file_handle, {'type':'chunk','kind':'llm_span','phase':'pre','session_id':'s1','api_request_id':'old'})
ctx.hooks['on_session_end'](session_id='s1', task_id='t1', outcome='ok')
`)
    const old = rows.find((r: any) => r.kind === 'llm_span')
    expect(old).toBeTruthy()
    expect(old.span_kind).toBeUndefined()
    expect(old.phase).toBe('pre')
  })
})
