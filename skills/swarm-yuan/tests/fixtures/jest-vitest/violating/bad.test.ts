import { describe, it, expect, vi } from 'vitest';

// violating: vi.mock factory 引用外部变量未用 vi.hoisted + 残留 jest.fn + 快照无治理
const mockReturn = 'mocked';

vi.mock('./mod', () => ({
  default: () => mockReturn,
}));

describe('bad', () => {
  const fn = jest.fn();
  it('works', () => {
    fn();
    expect(fn).toHaveBeenCalled();
  });

  it('snapshot', () => {
    expect({ a: 1 }).toMatchSnapshot();
  });
});
