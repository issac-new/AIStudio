import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// run31 N32-2：真实审计器 → 缺口侧柜 → 归桶写入器 → 审计复扫的闭环守门。
// 两个目标 FAIL 必须转 WARN；其余 FAIL 逐项保留，证明没有借自动登记放宽其他判据。
const HARNESS = join(__dirname, '..')
const ROOT = mkdtempSync(join(tmpdir(), 'retro-disp-writer-'))
const RUN = '20261118-v8-run31disp'
const EVID = join(ROOT, 'runs', RUN, 'evidence')
const FINDINGS = join(EVID, 'report-audit-findings.json')
const ISSUES = join(EVID, 'issues.log')
const AUDIT = join(HARNESS, 'mux', 'mx-report-audit.py')
const BACKFILL = join(HARNESS, 'mux', 'tri-disp-backfill.py')
const NOW = Math.floor(Date.now() / 1000)

function runAudit(run = RUN) {
  return spawnSync('python3', [AUDIT, '--run', run], {
    encoding: 'utf8',
    env: { ...process.env, AIPAY_SIM_ROOT: ROOT },
  })
}

function runBackfill(run = RUN) {
  return spawnSync('python3', [BACKFILL, '--run', run], {
    encoding: 'utf8',
    env: { ...process.env, AIPAY_SIM_ROOT: ROOT },
  })
}

function readFindings(run = RUN) {
  return JSON.parse(readFileSync(join(ROOT, 'runs', run, 'evidence', 'report-audit-findings.json'), 'utf8')) as {
    fails: string[]
    warns: string[]
  }
}

function fakePng(name: string, value: number) {
  // 审计器本组只核验非空与 md5，隔离夹具无需真实浏览器截图。
  writeFileSync(join(EVID, 'screenshots', 'steps', name), Buffer.alloc(11000, value))
}

function prepareFrameGapRun() {
  mkdirSync(join(EVID, 'screenshots', 'steps'), { recursive: true })
  writeFileSync(join(ROOT, 'runs', RUN, 'state.env'),
    `run_started_at=${NOW - 3600}\nreport_done=${NOW}\n`, 'utf8')
  writeFileSync(ISSUES, '', 'utf8')
  writeFileSync(join(EVID, 'governance-metrics.json'), JSON.stringify({ pairing: [] }), 'utf8')
  writeFileSync(join(EVID, 'r18-steps.json'), JSON.stringify({
    _schema: 1,
    steps: {
      23: { delivery: { frames: ['audit_done-op1-after.png'] } },
      25: {
        ops: [{
          title: '任务跳转 IDE 工作台',
          entry: '/app/ide',
          frames: ['ide_done-op1-before.png', 'ide_done-op1-after.png'],
        }],
      },
    },
  }), 'utf8')
  writeFileSync(join(EVID, 'simulation-report.html'), `<body><main class="main">
<article class="step" id="step23">
  <span class="st-num">23</span><div class="st-title"><h3>独立合规审计</h3></div><span class="ok">✅</span>
  <div>这步做什么</div><div>交付物及质量判据</div><div>已知问题</div><div>处置与改进</div>
  <p data-r18="d:0;o:0;e:0;v:1">门禁灯帧已登记</p>
  <p>帧缺失：（操作前帧未采集）</p>
  <img src="screenshots/steps/audit_done-op1-after.png" alt="独立审计门禁灯面板">
</article>
<article class="step" id="step25">
  <span class="st-num">25</span><div class="st-title"><h3>IDE 工作台</h3></div><span class="ok">✅</span>
  <div>这步做什么</div><div>交付物及质量判据</div><div>已知问题</div><div>处置与改进</div>
  <p data-r18="d:0;o:1;e:0">IDE 操作序列</p>
  <img src="screenshots/steps/ide_done-op1-before.png" alt="IDE 工作区操作前面板">
</article>
</main></body>`, 'utf8')
  fakePng('audit_done-op1-after.png', 23)
  fakePng('ide_done-op1-before.png', 25)
  // 后帧真实在盘但未嵌入：只触发「帧数不足」，不混同「文件缺失」。
  fakePng('ide_done-op1-after.png', 26)
}

afterAll(() => {
  rmSync(ROOT, { recursive: true, force: true })
})

describe('run31 N32-2 帧缺口审计降级写入器', () => {
  it('第 23/25 步自动落 ISSUE＋观察 DISP，复扫只撤对应 R18 FAIL 且幂等', () => {
    prepareFrameGapRun()
    const missingText = 'R18 步 23 操作序列存在缺帧'
    const shortText = 'R18 步 25 操作序列帧数不足'

    const first = runAudit()
    const firstOut = first.stdout + first.stderr
    expect(first.status, firstOut).toBe(1)
    const before = readFindings()
    expect(before.fails.some((line) => line.startsWith(missingText))).toBe(true)
    expect(before.fails.some((line) => line.startsWith(shortText))).toBe(true)

    const written = runBackfill()
    expect(written.status, written.stdout + written.stderr).toBe(0)
    const log = readFileSync(ISSUES, 'utf8')
    const lines = log.trim().split('\n')
    const issue23 = lines.find((line) => line.startsWith('ISSUE|frame-capture-failed|step-23|'))
    const issue25 = lines.find((line) => line.startsWith('ISSUE|frame-capture-failed|step-25|'))
    expect(issue23).toBeTruthy()
    expect(issue23).toContain('操作序列存在缺帧 1 处')
    expect(issue23).toContain('真实缺口保留')
    expect(issue23).toContain('复扫仅将该步 FAIL 降为 WARN')
    expect(issue25).toBeTruthy()
    expect(issue25).toContain('操作序列帧数不足（当前渲染 1 帧／期望 ≥2 帧）')
    expect(issue25).not.toContain('已补齐')
    expect(log).toContain('DISP|frame-capture-failed|step-23|观察（')
    expect(log).toContain('DISP|frame-capture-failed|step-25|观察（')

    const second = runAudit()
    expect(second.status, second.stdout + second.stderr).toBe(1) // 无关夹具 FAIL 必须继续阻断
    const after = readFindings()
    for (const target of [missingText, shortText]) {
      expect(after.fails.some((line) => line.startsWith(target))).toBe(false)
      expect(after.warns.some((line) => line.startsWith(target) && line.includes('已登记采集失败'))).toBe(true)
    }
    const unrelated = before.fails.filter((line) =>
      !line.startsWith(missingText) && !line.startsWith(shortText))
    for (const finding of unrelated) {
      expect(after.fails).toContain(finding)
    }
    expect(after.fails).toHaveLength(before.fails.length - 2)

    runBackfill()
    expect(readFileSync(ISSUES, 'utf8')).toBe(log)
  })

  it('非目标 FAIL、WARN 与跨轮侧柜均不生成降级凭证', () => {
    const run = '20261118-v8-run31closed'
    const evid = join(ROOT, 'runs', run, 'evidence')
    mkdirSync(evid, { recursive: true })
    writeFileSync(join(ROOT, 'runs', run, 'state.env'), 'run_started_at=1\n', 'utf8')
    writeFileSync(join(evid, 'issues.log'), '', 'utf8')
    writeFileSync(join(evid, 'governance-metrics.json'), JSON.stringify({ pairing: [] }), 'utf8')
    const path = join(evid, 'report-audit-findings.json')
    writeFileSync(path, JSON.stringify({
      run,
      fails: ['R18 步 23 缺「对话全文」（无关缺口）', 'R18 步 99 操作序列存在缺帧（2 处）'],
      warns: ['R18 步 25 操作序列帧数不足（当前渲染 1 帧/期望 ≥2）（已登记采集失败）'],
    }), 'utf8')
    expect(runBackfill(run).status).toBe(0)
    expect(readFileSync(join(evid, 'issues.log'), 'utf8')).toBe('')

    writeFileSync(path, JSON.stringify({
      run: '20261118-v8-run31other',
      fails: ['R18 步 23 操作序列存在缺帧（2 处）'],
      warns: [],
    }), 'utf8')
    expect(runBackfill(run).status).toBe(0)
    expect(readFileSync(join(evid, 'issues.log'), 'utf8')).toBe('')
  })
})
