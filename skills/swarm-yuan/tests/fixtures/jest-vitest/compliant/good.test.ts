import { describe, it, expect, vi } from 'vitest';

// compliant: vi.hoisted 提升 + vi.fn（无 jest.*）+ inline 快照
const { mockReturn } = vi.hoisted(() => ({ mockReturn: 'mocked' }));

vi.mock('./mod', () => ({
  default: () => mockReturn,
}));

describe('good', () => {
  const fn = vi.fn();
  it('works', () => {
    fn();
    expect(fn).toHaveBeenCalled();
  });

  it('inline snapshot', () => {
    expect({ a: 1 }).toMatchInlineSnapshot(`
      Object {
        "a": 1,
      }
    `);
  });
});
