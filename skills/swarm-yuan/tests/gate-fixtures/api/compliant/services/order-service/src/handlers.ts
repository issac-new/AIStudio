// 订单写接口（合规样本）：以 idempotency-key 去重，重试/双击不会产生重复订单
app.post('/orders', async (req, res) => {
  const idempotencyKey = req.header('idempotency-key');
  const order = await createOrderOnce(idempotencyKey, req.body);
  res.json(order);
});
