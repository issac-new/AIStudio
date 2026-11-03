// run 制品读写单测（F1）：路径围栏、原子写读、缺席如实。
// 变异探针：把 isValidRun 判定去掉 → 第 1 例会红；把「文件缺席返回 available:false」
// 改成返回空对象 → 第 3 例会红。
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listRunJsonStems, readRunJson, runFilePath, writeRunJson } from '../run-artifacts'

let root = ''
const RUN = '20261103-v8-run-test'

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'runfx-'))
  mkdirSync(join(root, 'runs', RUN), { recursive: true })
  process.env.OBS_SIM_ROOT = root
})

afterEach(() => {
  delete process.env.OBS_SIM_ROOT
  rmSync(root, { recursive: true, force: true })
})

describe('runFilePath（围栏）', () => {
  it('合法 run 返回拼接路径；非法 run 与未配 SIM_ROOT 返回 null', () => {
    expect(runFilePath(RUN, 'evidence', 'a.json')).toBe(join(root, 'runs', RUN, 'evidence', 'a.json'))
    expect(runFilePath('../escape', 'a.json')).toBeNull()
    const saved = process.env.OBS_SIM_ROOT
    delete process.env.OBS_SIM_ROOT
    expect(runFilePath(RUN, 'a.json')).toBeNull()
    process.env.OBS_SIM_ROOT = saved
  })
})

describe('writeRunJson / readRunJson', () => {
  it('写入后可读回，内容一致', () => {
    const w = writeRunJson(RUN, ['evidence', 'ac-trace.json'], { a: 1, rows: [{ acId: 'AC-1' }] })
    expect(w.written).toBe(true)
    const r = readRunJson<{ a: number }>(RUN, ['evidence', 'ac-trace.json'])
    expect(r.available).toBe(true)
    if (r.available) expect(r.doc.a).toBe(1)
    // 落盘文件真实存在且为 JSON
    const raw = readFileSync(join(root, 'runs', RUN, 'evidence', 'ac-trace.json'), 'utf8')
    expect(JSON.parse(raw).a).toBe(1)
  })

  it('文件缺席返回 available:false 并说明未采集（不编造空对象）', () => {
    const r = readRunJson(RUN, ['evidence', 'ac-trace.json'])
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toContain('未采集')
  })

  it('坏档返回 available:false 并说明解析失败', () => {
    mkdirSync(join(root, 'runs', RUN, 'evidence'), { recursive: true })
    writeFileSync(join(root, 'runs', RUN, 'evidence', 'bad.json'), '{oops')
    const r = readRunJson(RUN, ['evidence', 'bad.json'])
    expect(r.available).toBe(false)
    if (!r.available) expect(r.reason).toContain('解析失败')
  })

  it('非法 run 写入失败并给原因（不抛）', () => {
    const w = writeRunJson('../escape', ['a.json'], { a: 1 })
    expect(w.written).toBe(false)
    if (!w.written) expect(w.reason).toContain('run')
  })
})

describe('listRunJsonStems', () => {
  it('列出 JSON 文件名（去扩展、升序）；目录缺席返回空数组', () => {
    writeRunJson(RUN, ['governance', 'stage-keys', 'dev-done.json'], { stage: 'dev-done' })
    writeRunJson(RUN, ['governance', 'stage-keys', 'req-frozen.json'], { stage: 'req-frozen' })
    expect(listRunJsonStems(RUN, ['governance', 'stage-keys'])).toEqual(['dev-done', 'req-frozen'])
    expect(listRunJsonStems(RUN, ['governance', 'nope'])).toEqual([])
  })
})
