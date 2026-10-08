// OpenAPI→契约提取器（v0.3.1，上游 lazyzhsh/quality-gate v1.29 W8 + v1.30 F06 本地方言
// 移植，MIT；口径对照其 adapters/openapi/extract-contract.mjs）：把真实 OpenAPI 文档
// （声明子集）转换为 contract 门禁的期望契约（kind:'api'），使契约来源可以是真实
// OpenAPI 文件而非手工归一化 JSON。
// 声明子集（越界即抛错 fail-closed，不做静默近似）：
// - OpenAPI 3.0.x JSON 形态（YAML 不在子集内）；
// - paths→operations：get/post/put/patch/delete；路径模板原样保留；
// - path item 只容忍 OpenAPI 既有的非操作字段（summary/description/servers/parameters），
//   其余键（head/options/trace/connect 或未知键）＝子集外抛错——不静默丢操作；
// - requestBody：application/json 的 schema.properties 字段名序列；schema 组合关键字
//   （allOf/oneOf/anyOf/not）子集外抛错——不静默展开为空字段表；
// - responses：取字典序最小的 2xx 响应（确定性规则），responseFields 取其 application/json
//   schema.properties 字段名序列；
// - parameters（query/path）：operation 定义按 name+in 覆盖 path 级同名同位置参数
//   （OpenAPI 语义——不是两个字段），同级 name+in 重复＝无效输入抛错；字段名并入
//   requestFields（path 级声明序在前、覆盖项占 path 槽位）、body 字段在后；
// - $ref 在消费子树内任意深度出现即抛错（无解析器，不做静默跳过）。

export interface ApiContractItem {
  method: string
  path: string
  requestFields: string[]
  responseStatus: number
  responseFields: string[]
}

export interface ApiContract {
  schemaVersion: '0.1'
  kind: 'api'
  source: string
  file: string
  itemCount: number
  items: ApiContractItem[]
}

class SubsetError extends Error {}

const fail = (code: string): never => { throw new SubsetError(code) }
const assertSubset = (condition: boolean, code: string): void => { if (!condition) fail(code) }

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const
const PATH_ITEM_FIELDS = new Set(['summary', 'description', 'servers', 'parameters'])

function jsonProperties(schema: unknown, where: string): string[] {
  assertSubset(schema !== null && typeof schema === 'object' && !Array.isArray(schema), `non-object schema at ${where} (declared subset)`)
  const s = schema as Record<string, unknown>
  assertSubset(s.allOf === undefined && s.oneOf === undefined && s.anyOf === undefined && s.not === undefined, `composition (allOf/oneOf/anyOf/not) unsupported at ${where} (declared subset)`)
  assertSubset(s.type === undefined || s.type === 'object', `non-object schema at ${where} (declared subset)`)
  const properties = s.properties
  if (properties === undefined) return []
  assertSubset(typeof properties === 'object' && properties !== null && !Array.isArray(properties), `properties not an object at ${where}`)
  return Object.keys(properties as Record<string, unknown>)
}

function mediaFields(media: unknown, where: string): string[] {
  assertSubset(media !== null && typeof media === 'object', `missing media object at ${where} (declared subset)`)
  const content = (media as Record<string, unknown>).content as Record<string, unknown> | undefined
  const json = content?.['application/json']
  assertSubset(json !== undefined, `non-JSON media at ${where} (declared subset)`)
  const schema = (json as Record<string, unknown>).schema ?? {}
  return jsonProperties(schema, where)
}

/** 消费子树内任意深度的 $ref 都不解析——检出即抛错（可定位路径），不做静默跳过。 */
function assertNoRefs(node: unknown, where: string): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => assertNoRefs(item, `${where}[${index}]`))
    return
  }
  if (node !== null && typeof node === 'object') {
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === '$ref') fail(`$ref unsupported at ${where}.${key} (declared subset: no $ref resolution)`)
      assertNoRefs(value, `${where}.${key}`)
    }
  }
}

interface OpenApiParameter {
  name: string
  in: string
}

function parameterName(parameter: unknown): string {
  assertSubset(parameter !== null && typeof parameter === 'object', 'malformed parameter (declared subset)')
  const p = parameter as Record<string, unknown>
  assertSubset(typeof p.name === 'string' && (p.in === 'query' || p.in === 'path'), `parameter ${String(p.name)} in ${String(p.in)} outside declared subset`)
  return p.name as string
}

const asParameters = (v: unknown): OpenApiParameter[] =>
  Array.isArray(v) ? (v.filter((x): x is OpenApiParameter => typeof x === 'object' && x !== null)) : []

/** 提取主函数：spec 为已解析的 OpenAPI 文档对象；file 为原文件路径（进 source 记录）。
    子集外输入抛 SubsetError（调用方转 error 证据 / CLI 退出码 3）。 */
export function extractApiContract(spec: unknown, file: string): ApiContract {
  assertSubset(spec !== null && typeof spec === 'object' && !Array.isArray(spec), 'document must be an object')
  const doc = spec as Record<string, unknown>
  assertSubset(typeof doc.openapi === 'string' && doc.openapi.startsWith('3.0'), `openapi ${String(doc.openapi)} outside declared subset (3.0.x JSON)`)
  const paths = doc.paths
  assertSubset(paths !== null && typeof paths === 'object' && !Array.isArray(paths), 'paths object required')

  const items: ApiContractItem[] = []
  for (const [route, pathItemRaw] of Object.entries(paths as Record<string, unknown>)) {
    assertSubset(pathItemRaw !== null && typeof pathItemRaw === 'object' && (pathItemRaw as Record<string, unknown>).$ref === undefined, `$ref path item unsupported at ${route}`)
    const pathItem = pathItemRaw as Record<string, unknown>
    for (const key of Object.keys(pathItem)) {
      if (PATH_ITEM_FIELDS.has(key)) continue
      assertSubset((METHODS as readonly string[]).includes(key), `${key} operation at ${route} outside declared subset (supported: ${METHODS.map((m) => m.toUpperCase()).join('/')})`)
    }
    assertNoRefs(pathItem, `paths.${route}`)
    const sharedParameters = asParameters(pathItem.parameters)
    const sharedKeys = new Set(sharedParameters.map((p) => `${p.in}\0${p.name}`))
    assertSubset(sharedKeys.size === sharedParameters.length, `duplicate path-level parameter name+in at ${route}`)
    for (const method of METHODS) {
      const operationRaw = pathItem[method]
      if (operationRaw === undefined) continue
      assertSubset(operationRaw !== null && typeof operationRaw === 'object' && (operationRaw as Record<string, unknown>).$ref === undefined, `$ref operation unsupported at ${method.toUpperCase()} ${route}`)
      const operation = operationRaw as Record<string, unknown>
      const operationParameters = asParameters(operation.parameters)
      const operationKeys = new Set(operationParameters.map((p) => `${p.in}\0${p.name}`))
      assertSubset(operationKeys.size === operationParameters.length, `duplicate operation-level parameter name+in at ${method.toUpperCase()} ${route}`)
      // name+in 唯一识别；operation 定义覆盖 path 级同名同位置参数（占 path 槽位），不是拼接
      const merged = [...sharedParameters]
      for (const parameter of operationParameters) {
        const slot = merged.findIndex((item) => `${item.in}\0${item.name}` === `${parameter.in}\0${parameter.name}`)
        if (slot >= 0) merged[slot] = parameter
        else merged.push(parameter)
      }
      const requestFieldNames = merged.map(parameterName)
      if (operation.requestBody !== undefined) {
        assertSubset((operation.requestBody as Record<string, unknown>).$ref === undefined, '$ref requestBody unsupported (declared subset)')
        requestFieldNames.push(...mediaFields(operation.requestBody, `${method.toUpperCase()} ${route} requestBody`))
      }
      const responses = operation.responses as Record<string, unknown> | undefined
      const successCodes = Object.keys(responses ?? {}).filter((code) => /^2\d\d$/.test(code)).sort()
      assertSubset(successCodes.length > 0, `no 2xx response at ${method.toUpperCase()} ${route}`)
      const responseRaw = responses![successCodes[0]]
      assertSubset(responseRaw !== null && typeof responseRaw === 'object' && (responseRaw as Record<string, unknown>).$ref === undefined, `$ref response unsupported at ${method.toUpperCase()} ${route}`)
      const contentKeys = Object.keys((responseRaw as Record<string, unknown>).content ?? {})
      const responseFieldNames = contentKeys.length > 0 ? mediaFields(responseRaw, `${method.toUpperCase()} ${route} responses.${successCodes[0]}`) : []
      items.push({
        method: method.toUpperCase(),
        path: route,
        requestFields: requestFieldNames,
        responseStatus: Number(successCodes[0]),
        responseFields: responseFieldNames,
      })
    }
  }
  return {
    schemaVersion: '0.1',
    kind: 'api',
    source: `openapi ${String(doc.openapi)} subset extraction`,
    file,
    itemCount: items.length,
    items,
  }
}

export { SubsetError }
