// compliant fixture:
//  - 插件（cors/rate-limit/swagger/装饰器）先于路由 register
//  - setErrorHandler 统一错误处理；logger 启用（生产 JSON）
//  - onSend 回传新 payload
//
// 期望：bash run-framework-fixture.sh fastify → compliant 退出码 0（PASS）
const fastify = require('fastify')({
  logger: { level: 'info' }
});

async function main () {
  // 插件注册须先于路由声明（钩子/装饰器对后续路由生效）
  await fastify.register(require('@fastify/cors'), {
    origin: ['https://app.example.com']
  });
  await fastify.register(require('@fastify/rate-limit'), {
    max: 100,
    timeWindow: '1 minute'
  });
  await fastify.register(require('@fastify/swagger'), {
    openapi: { info: { title: 'users-api', version: '1.0.0' } }
  });
  await fastify.register(require('./plugins/decorators'));

  // 统一错误处理：5xx 脱敏，原始错误入日志
  fastify.setErrorHandler((err, request, reply) => {
    request.log.error(err);
    const status = err.statusCode >= 400 && err.statusCode < 500 ? err.statusCode : 500;
    reply.code(status).send({
      statusCode: status,
      error: status < 500 ? err.message : 'Internal Server Error'
    });
  });

  // onSend 统一响应壳：async 钩子须回传新 payload 才生效
  fastify.addHook('onSend', async (request, reply, payload) => {
    const newPayload = JSON.stringify({ code: 0, data: JSON.parse(payload) });
    return newPayload;
  });

  await fastify.register(require('./routes/users'));

  await fastify.listen({ port: 3000 });
}

main();
