// compliant fixture:
//   - useEffect 配 [items] 依赖数组 → fw_react_effect_deps pass
//   - key={item.id} 稳定 key → fw_react_list_key pass
//   - spread 不可变更新 setItems([...items, newItem]) → fw_react_immutable_state pass
// 期望：bash run-framework-fixture.sh react → compliant 退出码 0（PASS）
import { useState, useEffect } from 'react';

interface Item { id: number; name: string; }

export function List() {
  const [items, setItems] = useState<Item[]>([{ id: 1, name: 'A' }, { id: 2, name: 'B' }]);

  // 完整依赖数组 [items]
  useEffect(() => {
    console.log('items changed', items);
  }, [items]);

  const add = () => {
    // 不可变更新：spread 返回新引用
    setItems([...items, { id: Date.now(), name: 'C' }]);
  };

  return (
    <ul>
      {/* 稳定唯一 key={item.id} */}
      {items.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
      <button onClick={add}>add</button>
    </ul>
  );
}
