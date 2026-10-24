package data

import "github.com/google/wire"

// ProviderSet is data providers.
var ProviderSet = wire.NewSet(NewData, NewGreeterRepo)

// Data 数据层聚合（db/redis 等连接持有处）
type Data struct {
}

func NewData() (*Data, func(), error) {
	cleanup := func() {}
	return &Data{}, cleanup, nil
}
