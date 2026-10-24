const Koa = require('koa');
const helmet = require('koa-helmet');
const bodyParser = require('koa-bodyparser');
const cors = require('@koa/cors');
const createUserRouter = require('./routes/users');

const app = new Koa();

// 统一错误处理最先注册（洋葱模型：try/catch 包裹 await next()）
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.status = err.status || 500;
    ctx.body = { error: err.expose ? err.message : 'internal' };
    app.emit('error', err, ctx);
  }
});

app.use(helmet());
app.use(cors({ origin: 'https://app.example.com' }));
app.use(bodyParser({ jsonLimit: '1mb', formLimit: '1mb' }));

// factory 注入：createRouter(deps) 返回配置好的 Router
const userRouter = createUserRouter({ db: null });
app.use(userRouter.routes());
app.use(userRouter.allowedMethods());

app.on('error', (err) => {
  console.error('koa error', err.message);
});

app.listen(3000);
