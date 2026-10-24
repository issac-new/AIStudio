// ACL 防腐层适配器：payment 上下文对外的唯一入口，做模型翻译与协议适配
import { pay } from '../contexts/payment/gateway';

export function payViaAcl(id: number): string {
  return pay(id);
}
