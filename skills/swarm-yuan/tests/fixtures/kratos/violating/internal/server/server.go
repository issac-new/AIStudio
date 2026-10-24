// violating fixture server 层：
//  - Middleware 栈无 recovery.Recovery() → fw_kratos_recovery_middleware(fail) 主触发
//  - 无 (http|grpc).Timeout( → fw_kratos_server_timeout(warn)
//  - proto 含 google.api.http 但缺 RegisterGreeterHTTPServer → fw_kratos_http_register_missing(warn)
//  - proto 含 validate.rules 但无 validate.Validate() → fw_kratos_validate_middleware(warn)
package server

import (
	"github.com/google/wire"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/go-kratos/kratos/v2/middleware/logging"
	"github.com/go-kratos/kratos/v2/transport/grpc"
	"github.com/go-kratos/kratos/v2/transport/http"

	v1 "example.com/kratos-fixture/api/helloworld/v1"
	"example.com/kratos-fixture/internal/service"
)

// ProviderSet is server providers.
var ProviderSet = wire.NewSet(NewGRPCServer, NewHTTPServer)

// NewGRPCServer 违规：中间件栈仅 logging，无 recovery.Recovery()（panic 崩进程）、无 grpc.Timeout
func NewGRPCServer(greeter *service.GreeterService, logger log.Logger) *grpc.Server {
	var opts = []grpc.ServerOption{
		grpc.Middleware(
			logging.Server(logger),
		),
	}
	srv := grpc.NewServer(opts...)
	v1.RegisterGreeterServer(srv, greeter)
	return srv
}

// NewHTTPServer 违规：同样无 recovery.Recovery() / Timeout，且未注册任何 HTTP 网关
func NewHTTPServer(logger log.Logger) *http.Server {
	var opts = []http.ServerOption{
		http.Middleware(
			logging.Server(logger),
		),
	}
	srv := http.NewServer(opts...)
	return srv
}
