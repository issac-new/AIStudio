// violating fixture 插件：插件内 decorate 未用 fastify-plugin 包裹
// → fw_fastify_encapsulation(warn)：装饰器仅本插件上下文可见，外部 undefined
async function utilPlugin (fastify, opts) {
  fastify.decorate('now', () => Date.now());
  fastify.decorateRequest('session', {});
}

module.exports = utilPlugin;
