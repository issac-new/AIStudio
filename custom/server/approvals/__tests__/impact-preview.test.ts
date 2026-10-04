// impact-preview 域单测：覆盖 2026-10-04 九源调研落地项①的全部解析分支。
// 保守断言口径：非破坏性返回 null；无法静态界定必须 unbounded=true（宁可多看一眼）。
import { describe, expect, it } from 'vitest'
import { analyzeCommandImpact, summarizeImpact } from '../impact-preview'

describe('analyzeCommandImpact rm/rmdir', () => {
  it('rm 带旗标：剥旗标后目标全列', () => {
    const im = analyzeCommandImpact('rm -rf dist build/tmp')
    expect(im).toMatchObject({ danger: 'delete', unbounded: false })
    expect(im!.targets.map((t) => t.spec)).toEqual(['dist', 'build/tmp'])
  })

  it('rm 根路径：unbounded + root-path', () => {
    const im = analyzeCommandImpact('rm -rf /')
    expect(im).toMatchObject({ danger: 'delete', unbounded: true, note: 'root-path' })
  })

  it('rm 变量目标：unbounded + variable-target', () => {
    const im = analyzeCommandImpact('rm -rf $BUILD_DIR/cache')
    expect(im).toMatchObject({ unbounded: true, note: 'variable-target' })
  })

  it('rm 通配目标：列出但不判 unbounded（glob 可静态界定范围）', () => {
    const im = analyzeCommandImpact('rm -f *.log')
    expect(im!.targets[0]).toMatchObject({ spec: '*.log', kind: 'glob' })
    expect(im!.unbounded).toBe(false)
  })

  it('rm 无目标只有旗标：null（不假装零影响也不编目标）', () => {
    expect(analyzeCommandImpact('rm -rf')).toBeNull()
  })

  it('rmdir 走同一解析', () => {
    const im = analyzeCommandImpact('rmdir a/b')
    expect(im).toMatchObject({ danger: 'delete' })
  })
})

describe('analyzeCommandImpact git 族', () => {
  it('git clean -fd 带路径：列路径', () => {
    const im = analyzeCommandImpact('git clean -fd packages/legacy')
    expect(im).toMatchObject({ danger: 'delete', unbounded: false })
    expect(im!.targets.map((t) => t.spec)).toEqual(['packages/legacy'])
  })

  it('git clean -f 无路径：整工作区未跟踪文件，unbounded', () => {
    const im = analyzeCommandImpact('git clean -f')
    expect(im).toMatchObject({ danger: 'delete', unbounded: true, note: 'bare-glob' })
  })

  it('git clean -n（dry-run）不算删除', () => {
    expect(analyzeCommandImpact('git clean -n')).toBeNull()
  })

  it('git -C /repo clean -fdx：剥全局旗标后仍识别', () => {
    const im = analyzeCommandImpact('git -C /repo clean -fdx')
    expect(im).toMatchObject({ danger: 'delete', unbounded: true, note: 'bare-glob' })
  })

  it('git reset --hard：工作区重置不可枚举，unbounded', () => {
    const im = analyzeCommandImpact('git reset --hard HEAD~2')
    expect(im).toMatchObject({ danger: 'worktree-reset', unbounded: true })
  })

  it('git checkout -- paths：overwrite 列路径', () => {
    const im = analyzeCommandImpact('git checkout -- src/a.ts src/b.ts')
    expect(im).toMatchObject({ danger: 'overwrite', unbounded: false })
    expect(im!.targets.map((t) => t.spec)).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('git restore -- path 同款', () => {
    const im = analyzeCommandImpact('git restore -- src/a.ts')
    expect(im).toMatchObject({ danger: 'overwrite' })
  })

  it('git status 只读：null', () => {
    expect(analyzeCommandImpact('git status')).toBeNull()
  })
})

describe('analyzeCommandImpact find / truncate / 重定向 / 组合', () => {
  it('find -delete：起始路径为目标', () => {
    const im = analyzeCommandImpact('find build -name "*.tmp" -delete')
    expect(im).toMatchObject({ danger: 'delete', unbounded: false })
    expect(im!.targets[0]!.spec).toBe('build')
  })

  it('find 起始路径为通配：unbounded + bare-glob', () => {
    const im = analyzeCommandImpact('find . -name "*.log" -delete')
    expect(im).toMatchObject({ unbounded: true, note: 'bare-glob' })
  })

  it('> file 覆盖重定向：overwrite', () => {
    const im = analyzeCommandImpact('echo x > dist/manifest.json')
    expect(im).toMatchObject({ danger: 'overwrite' })
    expect(im!.targets[0]!.spec).toBe('dist/manifest.json')
  })

  it('>> 追加重定向不算覆盖', () => {
    expect(analyzeCommandImpact('echo x >> notes.md')).toBeNull()
  })

  it('truncate：overwrite', () => {
    const im = analyzeCommandImpact('truncate -s 0 data.db')
    expect(im).toMatchObject({ danger: 'overwrite' })
  })

  it('组合命令：&& 两侧都解析，unbounded 段优先', () => {
    const im = analyzeCommandImpact('rm -f a.log && git clean -fd')
    expect(im!.unbounded).toBe(true)
  })

  it('管道前段删除也算', () => {
    const im = analyzeCommandImpact('rm -f tmp/x | grep -q ok')
    expect(im).toMatchObject({ danger: 'delete' })
  })

  it('引号内的 ; 不切段', () => {
    const im = analyzeCommandImpact("rm -f 'a;b.txt'")
    expect(im!.targets[0]!.spec).toBe('a;b.txt')
  })

  it('sudo 前缀剥掉后仍识别', () => {
    const im = analyzeCommandImpact('sudo rm -rf /var/tmp/legacy')
    expect(im).toMatchObject({ danger: 'delete', unbounded: false })
  })
})

describe('analyzeCommandImpact 非破坏性', () => {
  it('只读与常规写命令返回 null', () => {
    for (const cmd of ['ls -la', 'cat a.txt', 'npm run build', 'git commit -m x', 'echo hi', '']) {
      expect(analyzeCommandImpact(cmd)).toBeNull()
    }
  })
})

describe('summarizeImpact', () => {
  it('null 透传；正常给三元摘要', () => {
    expect(summarizeImpact(null)).toBeNull()
    expect(summarizeImpact(analyzeCommandImpact('rm -f a b c'))).toEqual({ danger: 'delete', targetCount: 3, unbounded: false })
  })
})
