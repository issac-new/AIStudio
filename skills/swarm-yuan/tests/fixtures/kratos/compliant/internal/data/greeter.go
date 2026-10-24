// compliant fixture data 层：实现 biz.GreeterRepo 接口（正确依赖方向 data→biz）
package data

import (
	"context"

	"example.com/kratos-fixture/internal/biz"
)

// GreeterRepo 数据层仓库实现
type GreeterRepo struct {
	data *Data
}

// NewGreeterRepo 合规：返回值类型为 biz 接口（依赖倒置，data 实现 biz 契约）
func NewGreeterRepo(data *Data) biz.GreeterRepo {
	return &GreeterRepo{data: data}
}

func (r *GreeterRepo) FindByName(ctx context.Context, name string) (*biz.Greeter, error) {
	return &biz.Greeter{Name: name}, nil
}
