// overlay/custom/server/loop/gateway/host-ownership.ts
// 推演问题 host-gateway-ownership：autostart 的 isGatewayRunningForProfile 在
// 另一 profile 的 gateway 占住 host 且明确报"不会服务本 profile"时，被误判为
// "本 profile 已在跑"而跳过启动，导致 sim profile gateway 永远起不来。
//
// 关键区分（勿混淆两类锁语义）：
//  - 本 profile 的 runtime lock（同 profile 重复启动）→ 合法幂等，视作在跑。
//  - host 守卫报"owns this host and will not serve this profile"→ 他人在跑，
//    本 profile 实际未被服务，必须另起（--force）而非跳过。
export function gatewayStatusLooksHostOwned(output: string): boolean {
  const text = output.toLowerCase()
  return (
    text.includes('already owns this host') &&
    text.includes('will not serve')
  )
}
