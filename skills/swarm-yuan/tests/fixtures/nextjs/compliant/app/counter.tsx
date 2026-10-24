'use client';
// compliant fixture: Client Component 标 'use client'（用 useState 合法）

import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
