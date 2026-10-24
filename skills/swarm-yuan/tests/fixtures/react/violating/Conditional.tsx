// violating fixture 追加（2026-07-20 P1 唤醒）：
//   - 条件分支内调用 Hook（if 行内同时出现控制结构与 useEffect）→ fw_react_hooks_top_level(fail)
import { useState, useEffect } from 'react';

export function Conditional() {
  const [flag] = useState(false);
  if (flag) { useEffect(() => { console.log('conditional hook'); }, []); }
  return <div>{flag ? 'on' : 'off'}</div>;
}
