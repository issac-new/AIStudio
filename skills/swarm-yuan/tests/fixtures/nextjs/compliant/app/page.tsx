// compliant fixture: Server Component 无 Hook（数据获取用 fetch + cache）
import { Counter } from './counter';

export default async function Page() {
  // fetch 显式声明缓存语义
  const res = await fetch('https://api.example.com/data', { cache: 'no-store' });
  const data = await res.json();
  return (
    <div>
      <p>{data.title}</p>
      <Counter />
    </div>
  );
}
