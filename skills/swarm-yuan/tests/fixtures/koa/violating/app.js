const Koa = require('koa');
const Router = require('@koa/router');

const app = new Koa();
const router = new Router();

router.get('/users', async (ctx) => {
  ctx.body = { q: ctx.query.q };
});

router.post('/users', async (ctx) => {
  const body = ctx.request.body;
  if (!body) {
    throw new Error('bad request');
  }
  ctx.body = body;
});

// 裸 app.use(router)：Koa 下路由不生效，须 app.use(router.routes())
app.use(router);

app.listen(3000);
