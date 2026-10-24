// violating fixture: Server Component 内用 useState（文件首行无 'use client'）
// → fw_nextjs_use_client(fail) 主触发
import { useState } from 'react';

export default function Page() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(count + 1)}>{count}</button>;
}
