// violating fixture:
//   - useEffect 无依赖数组 → fw_react_effect_deps(fail) 主触发
//   - key={index} 列表渲染 → fw_react_list_key(warn)
//   - items.push(...) 直接 mutate state → fw_react_immutable_state(fail)
// 期望：bash run-framework-fixture.sh react → violating 退出码 != 0（FAIL）
import { useState, useEffect } from 'react';

interface Item { id: number; name: string; }

export function List() {
  const [items, setItems] = useState<Item[]>([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);

  // 无依赖数组：每次 render 触发副作用
  useEffect(() => {
    console.log('items changed', items);
  });

  const add = () => {
    // 直接 mutate state：push 返回新长度，引用未变 → React 不 re-render
    items.push({ id: Date.now(), name: 'C' });
    setItems(items);
  };

  return (
    <ul>
      {/* index 作 key：增删时 DOM 复用错位 */}
      {items.map((item, index) => (
        <li key={index}>{item.name}</li>
      ))}
      <button onClick={add}>add</button>
    </ul>
  );
}
