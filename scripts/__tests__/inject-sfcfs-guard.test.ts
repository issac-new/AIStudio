// overlay/scripts/__tests__/inject-sfcfs-guard.test.ts
// 守门：inject 模板的 sfcFs 适配器必须保持 isFile() 语义（2026-11-21 修复的棘轮）。
// 根因：existsSync 对目录返回 true，compiler-sfc resolveExt 探星号再导出（export *
// from './types'）时把目录当文件命中 → readFile EISDIR 被吞 → 类型 scope 空 →
// defineProps<EdgeProps> 报 Unresolvable，生产构建断。文本锚定模板真身（生成物
// vite.config.overlay.mts 是派生态，修生成物会被下次 inject 洗掉）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const injectSrc = readFileSync(resolve(__dirname, '..', 'inject.mjs'), 'utf8');

describe('inject 模板 sfcFs 守门（isFile 语义）', () => {
  it('fileExists 用 statSync().isFile() 而非裸 existsSync', () => {
    // 模板字面量内（生成物段）的 sfcFs 定义
    expect(injectSrc).toMatch(
      /fileExists: \(f\) => \{ try \{ return statSync\(f\)\.isFile\(\); \} catch \{ return false; \} \}/,
    );
  });

  it('生成态 import 含 statSync（模板派生配置可加载）', () => {
    expect(injectSrc).toMatch(
      /import \{ readFileSync, realpathSync, statSync \} from 'node:fs';/,
    );
  });

  it('sfcFs 的 fileExists 不再退回裸 existsSync（棘轮：防手改回退）', () => {
    const sfcFsBlock = injectSrc.match(/const sfcFs = \{[\s\S]*?\};/);
    expect(sfcFsBlock).toBeTruthy();
    expect(sfcFsBlock![0]).not.toMatch(/existsSync/);
  });
});
