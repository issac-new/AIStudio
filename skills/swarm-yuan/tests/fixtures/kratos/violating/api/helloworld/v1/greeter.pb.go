// 本文件原由 protoc-gen-go 生成，后被手工改写（生成头标记被抹除）
// → fw_kratos_generated_code_edit(fail) 主触发
package v1

import "context"

// HelloRequest 手改生成代码：下次 make api 重新生成将整体覆盖此处改动
type HelloRequest struct {
	Name string `json:"name"`
}

func (m *HelloRequest) GetName() string { return m.Name }

type HelloReply struct {
	Message string `json:"message"`
}

// GreeterServer 手写的服务接口（脱离 protoc-gen-go-grpc 生成物演进）
type GreeterServer interface {
	SayHello(context.Context, *HelloRequest) (*HelloReply, error)
}

func RegisterGreeterServer(s interface{}, srv GreeterServer) {}
