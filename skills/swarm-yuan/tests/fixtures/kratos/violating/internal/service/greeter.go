// violating fixture service 层：
//  - 未内嵌 v1.UnimplementedGreeterServer → fw_kratos_unimplemented_embed(warn)
//  - fmt.Errorf 直返业务错误 → fw_kratos_error_wrap(warn)
//  - 链路内 context.Background() → fw_kratos_context_propagation(warn)
package service

import (
	"context"
	"fmt"

	v1 "example.com/kratos-fixture/api/helloworld/v1"
	"example.com/kratos-fixture/internal/biz"
)

// GreeterService 违规：未值内嵌 UnimplementedGreeterServer（proto 增方法即编译断裂）
type GreeterService struct {
	uc *biz.GreeterUsecase
}

func NewGreeterService(uc *biz.GreeterUsecase) *GreeterService {
	return &GreeterService{uc: uc}
}

// SayHello 违规①：context.Background() 断链调下游（超时/取消/trace 断点）
// 违规②：fmt.Errorf 裸返（gRPC 状态码恒 Unknown，客户端无法 errors.Is 判定）
func (s *GreeterService) SayHello(ctx context.Context, req *v1.HelloRequest) (*v1.HelloReply, error) {
	g, err := s.uc.FindGreeter(context.Background(), req.GetName())
	if err != nil {
		return nil, fmt.Errorf("find greeter %s failed: %v", req.GetName(), err)
	}
	return &v1.HelloReply{Message: "Hello " + g.Name}, nil
}
