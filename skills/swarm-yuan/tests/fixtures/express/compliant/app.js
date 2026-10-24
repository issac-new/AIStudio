const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const userRouter = require('./routes/users');

const app = express();
app.disable('x-powered-by');

// 安全头基线须最先注册
app.use(helmet());
app.use(compression());
app.use(cors({ origin: ['https://app.example.com'] }));
app.use(express.json({ limit: '100kb' }));
app.use(rateLimit({ windowMs: 60000, limit: 100 }));
app.use(express.static('public', { maxAge: '1d', immutable: true }));

// 领域 Router 模块化挂载
app.use('/users', userRouter);

// 4 参数错误处理中间件最后注册（Express 5 async 拒绝自动进入此处）
app.use((err, req, res, next) => {
  res.status(500).json({ error: 'internal' });
});

app.listen(3000);
