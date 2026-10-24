package data

// GreeterRepo 数据层仓库实现
type GreeterRepo struct {
	data *Data
}

func NewGreeterRepo(data *Data) *GreeterRepo {
	return &GreeterRepo{data: data}
}
