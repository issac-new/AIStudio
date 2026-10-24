// compliant fixture server 层：
//  - recovery.Recovery() 置链首 → recovery_middleware pass
//  - validate.Validate() + (http|grpc).Timeout 齐备 → validate_middleware / server_timeout pass
//  - RegisterGreeterServer + RegisterGreeterHTTPServer 双注册 → http_register_missing pass
package server

import (
	"time"

	"github.com/google/wire"

	"github.com/go-kratos/kratos/v2/log"
	"github.com/go-kratos/kratos/v2/middleware/logging"
	"github.com/go-kratos/kratos/v2/middleware/recovery"
	"github.com/go-kratos/kratos/v2/middleware/validate"
	"github.com/go-kratos/kratos/v2/transport/grpc"
	"github.com/go-kratos/kratos/v2/transport/http"

	v1 "example.com/kratos-fixture/api/helloworld/v1"
	"example.com/kratos-fixture/internal/service"
)

// ProviderSet is server providers.
var ProviderSet = wire.NewSet(NewGRPCServer, NewHTTPServer)

// NewGRPCServer 合规：recovery 置链首（最外层兜底 panic）+ validate 入参校验 + Timeout 慢请求防护
func NewGRPCServer(greeter *service.GreeterService, logger log.Logger) *grpc.Server {
	var opts = []grpc.ServerOption{
		grpc.Middleware(
			recovery.Recovery(),
			validate.Validate(),
			logging.Server(logger),
		),
		grpc.Timeout(2 * time.Second),
	}
	srv := grpc.NewServer(opts...)
	v1.RegisterGreeterServer(srv, greeter)
	return srv
}

// NewHTTPServer 合规：recovery 置链首 + validate + Timeout，并注册 REST 网关（与 gRPC 成对）
func NewHTTPServer(greeter *service.GreeterService, logger log.Logger) *http.Server {
	var opts = []http.ServerOption{
		http.Middleware(
			recovery.Recovery(),
			validate.Validate(),
			logging.Server(logger),
		),
		http.Timeout(2 * time.Second),
	}
	srv := http.NewServer(opts...)
	v1.RegisterGreeterHTTPServer(srv, greeter)
	return srv
}
