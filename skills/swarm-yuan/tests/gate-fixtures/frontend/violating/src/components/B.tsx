import { A } from './A';

// 组件 B（违例样本）：反向 import A，与 A 构成 A↔B 循环依赖（运行时易 undefined）
export function B() {
  return <div>{typeof A}</div>;
}
