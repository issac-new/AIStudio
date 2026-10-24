// violating fixture 入口：
//  - kratos.New 缺 kratos.Name/kratos.Version → fw_kratos_app_metadata(warn)
//  - 存在 wire.go(wire.Build) 但同目录无 wire_gen.go → fw_kratos_wire_gen_missing(warn)
package main

import (
	kratos "github.com/go-kratos/kratos/v2"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/go-kratos/kratos/v2/transport/grpc"
	"github.com/go-kratos/kratos/v2/transport/http"
)

// newApp 违规：kratos.New 未配 Name/Version（注册中心实例名/版本元数据为空）
func newApp(logger log.Logger, hs *http.Server, gs *grpc.Server) *kratos.App {
	return kratos.New(
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
