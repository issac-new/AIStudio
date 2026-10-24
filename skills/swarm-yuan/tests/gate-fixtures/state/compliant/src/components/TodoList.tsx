import { useMemo, useState } from 'react';
import { useTodoStore } from '../store/todoStore';

// 待办列表（合规样本）：显式声明所需 props，派生数据用 useMemo 直接计算
export function TodoList({ prefix }: { prefix: string }) {
  const items = useTodoStore((s) => s.items);
  const [keyword, setKeyword] = useState('');
  // 派生数据不入 state：filter 结果随渲染计算，避免不同步
  const visible = useMemo(
    () => items.filter((x) => x.includes(keyword)),
    [items, keyword],
  );
  return (
    <ul data-prefix={prefix}>
      {visible.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}
