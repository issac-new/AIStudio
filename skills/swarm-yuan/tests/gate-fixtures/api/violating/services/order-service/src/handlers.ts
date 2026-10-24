// 订单写接口（违例样本）：POST 创建订单但无幂等设计，重试会重复创建/重复扣款
app.post('/orders', async (req, res) => {
  const order = await createOrderRecord(req.body);
  res.json(order);
});
