// 支付网关：普通实现，与漂移条目无关
export class PaymentGateway {
  pay(id: number): string {
    return `paid-${id}`;
  }
}
