// compliant fixture: upstream/<子包>/ 嵌套测试属第三方快照自带，prune 后不触发 fw_jest_no_upstream_test
// （门禁仅检 upstream/ 直属新增文件；本文件用于锁定嵌套 prune 行为）
import { describe, it, expect } from 'vitest';

describe('upstream-vendored', () => {
  it('is a vendored third-party snapshot test', () => {
    expect(true).toBe(true);
  });
});
