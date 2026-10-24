// order 上下文：违规样本——绕过 ACL 防腐层，直接 import payment 上下文内部实现
import { pay } from '../payment/gateway';

export function placeOrder(id: number): string {
  return pay(id);
}
