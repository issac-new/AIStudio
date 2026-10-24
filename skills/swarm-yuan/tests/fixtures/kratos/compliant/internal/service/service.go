package service

import "github.com/google/wire"

// ProviderSet is service providers.
// 合规：全部 service provider 收录完整（wire 编译期注入链完整）
var ProviderSet = wire.NewSet(NewGreeterService)
