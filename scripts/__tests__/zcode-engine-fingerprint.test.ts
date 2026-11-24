// zcode-engine.mjs 构建指纹守门（2026-11-24 N34 清偿批新发现）：
// 引擎启动脚本的「就绪」判定此前只看产物在不在——vendor/zcode 换血到 4.0 后，主检出的
// 引擎服务端产物仍停在 11-11 的 3.18.0 构建，zcode:serve 会原样拉起旧引擎。
// 守门：指纹对基线树对象与补丁序列内容敏感；陈旧判定覆盖产物缺席/戳记缺席/戳记不一致。
import { describe, expect, it } from 'vitest';
import { sourceFingerprint, isBuildFresh } from '../zcode-engine.mjs';

const STAMP = 'dist/.aistudio-stamp';

describe('构建指纹 sourceFingerprint', () => {
  it('基线换血（树对象变）→ 指纹变', () => {
    const a = sourceFingerprint({ treeOid: 'a1', patches: [] });
    const b = sourceFingerprint({ treeOid: 'b2', patches: [] });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('补丁内容或次序变 → 指纹变；同内容重算 → 指纹同', () => {
    const p1 = [['001-a.patch', 'diff --git a/x b/x\n'], ['002-b.patch', 'diff --git a/y b/y\n']];
    const p2 = [['001-a.patch', 'diff --git a/x b/x\nCHANGED'], ['002-b.patch', 'diff --git a/y b/y\n']];
    const p3 = [['002-b.patch', 'diff --git a/y b/y\n'], ['001-a.patch', 'diff --git a/x b/x\n']];
    const f = sourceFingerprint({ treeOid: 't', patches: p1 });
    expect(sourceFingerprint({ treeOid: 't', patches: p1 })).toBe(f);
    expect(sourceFingerprint({ treeOid: 't', patches: p2 })).not.toBe(f);
    expect(sourceFingerprint({ treeOid: 't', patches: p3 })).not.toBe(f);
  });
});

describe('陈旧判定 isBuildFresh', () => {
  const stamp = 'abcdef';
  it('产物缺席 / 戳记缺席 / 戳记不一致 → 陈旧；逐字一致 → 就绪', () => {
    const yes = () => true;
    const no = () => false;
    const read = () => `${stamp}\n`;
    expect(isBuildFresh('/x', `${STAMP}`, stamp, no, read)).toBe(false);       // 产物缺席
    expect(isBuildFresh('/x', `${STAMP}`, stamp, yes, () => { throw new Error('ENOENT'); })).toBe(false); // 戳记缺席
    expect(isBuildFresh('/x', `${STAMP}`, 'abcdef', yes, () => 'other\n')).toBe(false);                     // 指纹不符
    expect(isBuildFresh('/x', `${STAMP}`, stamp, yes, read)).toBe(true);       // 就绪
  });
});
