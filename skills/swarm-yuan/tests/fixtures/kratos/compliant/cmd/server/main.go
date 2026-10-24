// compliant fixture 入口：kratos.Name + kratos.Version 元数据齐备 → app_metadata pass
package main

import (
	kratos "github.com/go-kratos/kratos/v2"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/go-kratos/kratos/v2/transport/grpc"
	"github.com/go-kratos/kratos/v2/transport/http"
)

var (
	// Name is the name of the compiled software.
	Name = "kratos-fixture"
	// Version is the version of the compiled software.
	Version = "v1.0.0"
)

// newApp 合规：kratos.Name/kratos.Version 写入注册中心实例元数据
func newApp(logger log.Logger, hs *http.Server, gs *grpc.Server) *kratos.App {
	return kratos.New(
		kratos.Name(Name),
		kratos.Version(Version),
		kratos.Logger(logger),
		kratos.Server(
			hs,
			gs,
		),
	)
}

func main() {
	app, cleanup, err := wireApp(nil, nil, nil)
	if err != nil {
		panic(err)
	}
	defer cleanup()
	if err := app.Run(); err != nil {
		panic(err)
	}
}
