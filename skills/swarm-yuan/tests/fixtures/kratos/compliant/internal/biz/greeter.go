// compliant fixture biz 层：定义 Repo 接口（依赖倒置），不 import internal/data
// → layer_dependency pass
package biz

import (
	"context"

	"github.com/go-kratos/kratos/v2/log"
)

// Greeter 领域模型
type Greeter struct {
	Name string
}

// GreeterRepo 合规：biz 层定义仓库接口，data 层实现并经 wire 注入（可 mock、可替换实现）
type GreeterRepo interface {
	FindByName(ctx context.Context, name string) (*Greeter, error)
}

// GreeterUsecase 合规：仅依赖接口，不依赖 data 具体类型
type GreeterUsecase struct {
	repo GreeterRepo
	log  *log.Helper
}

func NewGreeterUsecase(repo GreeterRepo, logger log.Logger) *GreeterUsecase {
	return &GreeterUsecase{repo: repo, log: log.NewHelper(logger)}
}

func (uc *GreeterUsecase) FindGreeter(ctx context.Context, name string) (*Greeter, error) {
	return uc.repo.FindByName(ctx, name)
}
