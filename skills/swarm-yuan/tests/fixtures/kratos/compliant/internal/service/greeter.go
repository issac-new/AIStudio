// compliant fixture service 层：
//  - 值内嵌 v1.UnimplementedGreeterServer → unimplemented_embed pass
//  - kratos errors 包装业务错误 → error_wrap pass
//  - ctx 透传 → context_propagation pass
package service

import (
	"context"

	"github.com/go-kratos/kratos/v2/errors"

	v1 "example.com/kratos-fixture/api/helloworld/v1"
	"example.com/kratos-fixture/internal/biz"
)

// GreeterService 合规：值内嵌 Unimplemented 基座（proto 增方法前向兼容）
type GreeterService struct {
	v1.UnimplementedGreeterServer

	uc *biz.GreeterUsecase
}

func NewGreeterService(uc *biz.GreeterUsecase) *GreeterService {
	return &GreeterService{uc: uc}
}

// SayHello 合规：入参 ctx 透传 biz 层；业务错误经 kratos errors 包装（code+reason 可判定）
func (s *GreeterService) SayHello(ctx context.Context, req *v1.HelloRequest) (*v1.HelloReply, error) {
	g, err := s.uc.FindGreeter(ctx, req.GetName())
	if err != nil {
		return nil, errors.NotFound("GREETER_NOT_FOUND", "greeter not found")
	}
	return &v1.HelloReply{Message: "Hello " + g.Name}, nil
}
