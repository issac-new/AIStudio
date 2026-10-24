// violating fixture：NewOrderService 定义了 provider 但未收录 ProviderSet
// → fw_kratos_wire_provider(fail) 主触发
package service

// OrderService 违规：provider 游离于 wire.NewSet 之外（wire 生成报 provider 缺失/服务静默不注册）
type OrderService struct {
}

func NewOrderService() *OrderService {
	return &OrderService{}
}
