// compliant fixture 路由：输入/输出 JSON Schema 全声明（Ajv 校验 + fast-json-stringify）
async function userRoutes (fastify, opts) {
  const userBodySchema = {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 64 },
      email: { type: 'string', format: 'email' }
    },
    additionalProperties: false
  };

  const userResponseSchema = {
    200: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' }
      }
    }
  };

  fastify.get('/users', {
    schema: {
      querystring: {
        type: 'object',
        properties: { q: { type: 'string', maxLength: 64 } }
      },
      response: userResponseSchema
    }
  }, async (request, reply) => {
    return { id: 'u1', name: 'alice' };
  });

  fastify.post('/users', {
    preHandler: fastify.authenticate,
    schema: {
      body: userBodySchema,
      response: userResponseSchema
    }
  }, async (request, reply) => {
    return { id: fastify.now().toString(), name: request.body.name };
  });
}

module.exports = userRoutes;
