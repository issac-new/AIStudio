// violating fixture biz 层：
//  - import internal/data 分层倒挂 → fw_kratos_layer_dependency(fail) 主触发
package biz

import (
	"context"

	"example.com/kratos-fixture/internal/data" // 违规：biz 直接依赖 data 实现（应定义 Repo 接口由 data 实现、wire 注入）
)

// Greeter 领域模型
type Greeter struct {
	Name string
}

// GreeterUsecase 违规：直接持 *data.Data 具体类型（无法 mock、单测须连真实 DB）
type GreeterUsecase struct {
	d *data.Data
}

func NewGreeterUsecase(d *data.Data) *GreeterUsecase {
	return &GreeterUsecase{d: d}
}

func (uc *GreeterUsecase) FindGreeter(ctx context.Context, name string) (*Greeter, error) {
	return &Greeter{Name: name}, nil
}
