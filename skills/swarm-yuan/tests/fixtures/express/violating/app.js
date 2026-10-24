const express = require('express');
const app = express();

// body 解析无 limit
app.use(express.json());

// 错误处理中间件被错误地放在路由之前
app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});

// 以下路由的错误无法被上面的错误中间件捕获
app.get('/users', async (req, res) => {
  const q = req.query.q;
  res.json({ q });
});

app.post('/users', async (req, res) => {
  res.json(req.body);
});

app.listen(3000);
