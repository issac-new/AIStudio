import { useState } from 'react';

// 派生状态违例样本：filter 结果存入 useState（应直接计算或 useMemo，否则源数据变更后不同步）
export function Derived({ items }: { items: string[] }) {
  const [nonEmpty] = useState(items.filter((x) => x.length > 0));
  return <div>{nonEmpty.length}</div>;
}
