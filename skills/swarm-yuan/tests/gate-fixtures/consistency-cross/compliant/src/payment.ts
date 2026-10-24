// 支付网关：标识符与术语表「支付 → PaymentGateway」一致
export class PaymentGateway {
  pay(id: number): string {
    return `paid-${id}`;
  }
}
