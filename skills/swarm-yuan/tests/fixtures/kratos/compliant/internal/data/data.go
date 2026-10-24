package data

import (
	"github.com/google/wire"

	"github.com/go-kratos/kratos/v2/log"
)

// ProviderSet is data providers.
var ProviderSet = wire.NewSet(NewData, NewGreeterRepo)

// Data 数据层聚合（db/redis 等连接持有处）
type Data struct {
}

func NewData(logger log.Logger) (*Data, func(), error) {
	cleanup := func() {}
	return &Data{}, cleanup, nil
}
