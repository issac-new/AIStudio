const Router = require('@koa/router');

function validateUserBody(body) {
  return body && typeof body.name === 'string' && body.name.length > 0;
}

// factory 注入模式：依赖显式传入，返回配置好的 Router
function createUserRouter(deps) {
  const router = new Router();

  router.post('/users', async (ctx) => {
    const body = ctx.request.body;
    if (!validateUserBody(body)) {
      ctx.throw(400, 'name required');
    }
    ctx.state.user = { name: body.name };
    ctx.body = ctx.state.user;
  });

  return router;
}

module.exports = createUserRouter;
