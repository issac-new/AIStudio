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
// 违规：同目录缺 wire_gen.go（injector 未生成/未提交，wireApp 编译期未定义）
func wireApp(*conf.Server, *conf.Data, log.Logger) (*kratos.App, func(), error) {
	panic(wire.Build(server.ProviderSet, data.ProviderSet, biz.ProviderSet, service.ProviderSet, newApp))
}
