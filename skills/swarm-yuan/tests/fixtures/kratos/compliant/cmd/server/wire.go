//go:build wireinject
// +build wireinject

package main

import (
	kratos "github.com/go-kratos/kratos/v2"
	"github.com/go-kratos/kratos/v2/log"
	"github.com/google/wire"

	"example.com/kratos-fixture/internal/biz"
	"example.com/kratos-fixture/internal/conf"
	"example.com/kratos-fixture/internal/data"
	"example.com/kratos-fixture/internal/server"
	"example.com/kratos-fixture/internal/service"
)

// wireApp init kratos application.
// 合规：同目录 wire_gen.go 已生成并提交（injector 声明与生成物一致）
func wireApp(*conf.Server, *conf.Data, log.Logger) (*kratos.App, func(), error) {
	panic(wire.Build(server.ProviderSet, data.ProviderSet, biz.ProviderSet, service.ProviderSet, newApp))
}
