package service

import "github.com/google/wire"

// ProviderSet is service providers.
// 违规：漏收 NewOrderService（见 order.go），wire 注入链断裂
var ProviderSet = wire.NewSet(NewGreeterService)
