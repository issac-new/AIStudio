// evidence-store 守门（P1 Task 2）：九字段证据契约 + JSONL 追加式存储。
// 负例先行：缺关键字段 appendEvidence 抛错且不落盘（记录在档不得伪装成功）；
// 不存在主体 latestEvidenceFor 返回 null（不猜）；坏行跳过不阻断读（fail-soft）。
// 兼容读取：旧三字段行（P0 形状 {subject,status,source}）归一为 legacy 投影，
// 缺席字段如实 null，不编造 evidenceId/producer/时戳。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import {
  appendEvidence,
  evidenceStoreFile,
  latestEvidenceFor,
  validateEvidenceRecord,
} from '../evidence-store'
import type { EvidenceRecord } from '../../../../platform/contracts/evidence'

/** 九字段齐全的基准记录（over 覆盖个别字段构造负例）。 */
const rec = (over: Partial<EvidenceRecord> = {}): EvidenceRecord => ({
  evidenceId: 'gev/test/1',
  subjectId: 'G1',
  status: 'pass',
  producer: 'gate-evidence',
  commit: null,
  startedAt: 1790000000000,
  endedAt: 1790000000000,
  sourceDigest: '1790000000',
  artifactRefs: [],
  ...over,
})

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'platform-evidence-'))
  process.env.PLATFORM_EVIDENCE_FILE = join(dir, 'nested', 'evidence.jsonl')
})

afterEach(() => {
  delete process.env.PLATFORM_EVIDENCE_FILE
  rmSync(dir, { recursive: true, force: true })
})

describe('validateEvidenceRecord（九字段纯函数校验）', () => {
  it('九字段齐全合法（含 commit:null 与 sourceDigest:null 的如实缺席形态）', () => {
    expect(() => validateEvidenceRecord(rec())).not.toThrow()
    expect(() => validateEvidenceRecord(rec({ commit: 'a1b2c3d', sourceDigest: null, artifactRefs: ['runs/r1/evidence/issues.log'] }))).not.toThrow()
  })

  it('缺关键字段抛错且消息点名：evidenceId / subjectId / producer / commit', () => {
    expect(() => validateEvidenceRecord(rec({ evidenceId: undefined as unknown as string }))).toThrow(/evidenceId/)
    expect(() => validateEvidenceRecord(rec({ subjectId: '' }))).toThrow(/subjectId/)
    expect(() => validateEvidenceRecord(rec({ producer: '' }))).toThrow(/producer/)
    // commit 键缺席（undefined）=未声明缺失，与显式 null（合法）区分
    expect(() => validateEvidenceRecord(rec({ commit: undefined as unknown as null }))).toThrow(/commit/)
    expect(() => validateEvidenceRecord(rec({ sourceDigest: undefined as unknown as null }))).toThrow(/sourceDigest/)
  })

  it('commit 空串非法（要么真值要么显式 null，不接受空串糊弄）', () => {
    expect(() => validateEvidenceRecord(rec({ commit: '' }))).toThrow(/commit/)
  })

  it('status 越界抛错（四值之外不猜）', () => {
    expect(() => validateEvidenceRecord(rec({ status: 'ok' as EvidenceRecord['status'] }))).toThrow(/status/)
  })

  it('artifactRefs 非数组/含非字符串抛错；startedAt/endedAt 非有限数或时序颠倒抛错', () => {
    expect(() => validateEvidenceRecord(rec({ artifactRefs: 'nope' as unknown as string[] }))).toThrow(/artifactRefs/)
    expect(() => validateEvidenceRecord(rec({ artifactRefs: ['a', 1 as unknown as string] }))).toThrow(/artifactRefs/)
    expect(() => validateEvidenceRecord(rec({ startedAt: NaN }))).toThrow(/startedAt/)
    expect(() => validateEvidenceRecord(rec({ endedAt: 'x' as unknown as number }))).toThrow(/endedAt/)
    expect(() => validateEvidenceRecord(rec({ endedAt: 1790000000000 - 1 }))).toThrow(/endedAt/)
  })

  it('非对象输入抛错', () => {
    expect(() => validateEvidenceRecord(null)).toThrow()
    expect(() => validateEvidenceRecord('pass')).toThrow()
  })
})

describe('appendEvidence（JSONL 原子追加）', () => {
  it('追加单行 JSONL 且目录自动创建；九字段按固定键序落盘', () => {
    appendEvidence(rec())
    const file = evidenceStoreFile()
    expect(existsSync(file)).toBe(true)
    const lines = readFileSync(file, 'utf8').split('\n').filter(Boolean)
    expect(lines).toHaveLength(1)
    expect(Object.keys(JSON.parse(lines[0]))).toEqual([
      'evidenceId', 'subjectId', 'status', 'producer', 'commit',
      'startedAt', 'endedAt', 'sourceDigest', 'artifactRefs',
    ])
  })

  it('缺关键字段抛错且不落盘', () => {
    expect(() => appendEvidence(rec({ producer: '' }))).toThrow(/producer/)
    expect(existsSync(evidenceStoreFile())).toBe(false)
  })

  it('同主体多次追加：latest 取最后一行（追加序=最新序）', () => {
    appendEvidence(rec({ evidenceId: 'gev/test/1', endedAt: 1790000000001 }))
    appendEvidence(rec({ evidenceId: 'gev/test/2', endedAt: 1790000000002 }))
    const latest = latestEvidenceFor('G1')
    expect(latest && latest.evidenceId).toBe('gev/test/2')
  })
})

describe('latestEvidenceFor（读面 fail-soft，不猜）', () => {
  it('不存在主体返回 null；文件不存在返回 null', () => {
    appendEvidence(rec())
    expect(latestEvidenceFor('G9')).toBeNull()
    expect(latestEvidenceFor('G1')).not.toBeNull()
    process.env.PLATFORM_EVIDENCE_FILE = join(dir, 'absent', 'none.jsonl')
    expect(latestEvidenceFor('G1')).toBeNull()
  })

  it('roundtrip：追加后读回九字段逐一等值（commit:null 与 artifactRefs 原样）', () => {
    const src = rec({ commit: null, sourceDigest: null, artifactRefs: ['runs/r1/state.env'], status: 'unknown' })
    appendEvidence(src)
    const got = latestEvidenceFor('G1') as EvidenceRecord
    expect(got).toEqual(src)
  })

  it('旧三字段行（P0 形状）归一为 legacy 投影：subject→subjectId、source→sourceDigest、缺席=null', () => {
    const file = evidenceStoreFile()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, '{"subject":"G2","status":"pass","source":"1790000005"}\n', 'utf8')
    const got = latestEvidenceFor('G2')
    expect(got).toEqual({
      legacy: true,
      evidenceId: null,
      subjectId: 'G2',
      status: 'pass',
      producer: null,
      commit: null,
      startedAt: null,
      endedAt: null,
      sourceDigest: '1790000005',
      artifactRefs: [],
    })
  })

  it('坏行跳过不阻断读：非法 JSON 与 status 越界行略过，其余行仍可取', () => {
    const file = evidenceStoreFile()
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, [
      '{not json',
      JSON.stringify(rec({ evidenceId: 'gev/test/ok', subjectId: 'G3', status: 'bogus' as EvidenceRecord['status'] })),
      JSON.stringify({ evidenceId: 'gev/test/9', subjectId: 'G3', status: 'fail', producer: 'gate-evidence', commit: null, startedAt: 1, endedAt: 1, sourceDigest: 'x', artifactRefs: [] }),
    ].join('\n') + '\n', 'utf8')
    const got = latestEvidenceFor('G3') as EvidenceRecord
    expect(got.evidenceId).toBe('gev/test/9')
    expect(got.status).toBe('fail')
  })
})

describe('evidenceStoreFile（路径解析序：env 覆盖 > underWebUi 缺省）', () => {
  it('PLATFORM_EVIDENCE_FILE 显式覆盖整文件路径', () => {
    expect(evidenceStoreFile()).toBe(join(dir, 'nested', 'evidence.jsonl'))
  })

  it('env 缺席时落 fail-soft 缺省位 underWebUi（HERMES_WEB_UI_HOME 链）', () => {
    const prevFile = process.env.PLATFORM_EVIDENCE_FILE
    const prevHome = process.env.HERMES_WEB_UI_HOME
    delete process.env.PLATFORM_EVIDENCE_FILE
    process.env.HERMES_WEB_UI_HOME = dir
    try {
      expect(evidenceStoreFile()).toBe(join(dir, 'platform-evidence.jsonl'))
    } finally {
      if (prevFile !== undefined) process.env.PLATFORM_EVIDENCE_FILE = prevFile
      if (prevHome === undefined) delete process.env.HERMES_WEB_UI_HOME
      else process.env.HERMES_WEB_UI_HOME = prevHome
    }
  })
})
