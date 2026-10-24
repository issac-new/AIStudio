// violating fixture: 只读 upstream/ 直属目录新增测试文件 → fw_jest_no_upstream_test(fail)
// （ncwk 契约：upstream/ 全为只读第三方快照，禁新增测试）
import { describe, it, expect } from 'vitest';

describe('upstream-direct', () => {
  it('violates read-only upstream contract', () => {
    expect(1).toBe(1);
  });
});
