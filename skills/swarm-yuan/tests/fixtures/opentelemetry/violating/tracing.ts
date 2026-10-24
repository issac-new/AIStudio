// violating fixture:
//  - 无 service.name → fw_opentelemetry_service_name(warn)
//  - 无 exporter endpoint → fw_opentelemetry_exporter_endpoint(warn)
//  - 无 sampler 配置 → fw_opentelemetry_sampler(warn)
//  - 用 JaegerExporter → fw_opentelemetry_deprecated_exporter(fail)
//  - 无 deployment.environment → fw_opentelemetry_deployment_env(warn)
//  - 无 setAttribute → fw_opentelemetry_span_attributes(warn)
//  - 无 Baggage propagator → fw_opentelemetry_baggage_propagation(warn)
//  - 无 MeterProvider → fw_opentelemetry_metrics_export(warn)
//  - 无 OTel Logs API → fw_opentelemetry_logs_api(warn)
//  - 无 shutdown → fw_opentelemetry_graceful_shutdown(warn)
//
// 期望：bash run-framework-fixture.sh opentelemetry → violating 退出码 != 0（FAIL，因 deprecated_exporter fail 主触发）
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resource } from '@opentelemetry/resources';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { trace } from '@opentelemetry/api';

// 违规：无 service.name、无 deployment.environment（Resource 无任何属性）
const sdk = new NodeSDK({
  resource: new resource.ResourceAttributes({}),
  // 违规：用已废弃的 JaegerExporter（须迁 OTLPExporter）
  traceExporter: new JaegerExporter({}),
  // 违规：无 sampler 配置（默认 AlwaysOnSampler 全量采样）
});

sdk.start();

const tracer = trace.getTracer('app');

export function handleRequest(req: any) {
  // 违规：startSpan 但无 setAttribute（无业务上下文）
  const span = tracer.startSpan('handleRequest');
  // 违规：无 Baggage propagator 注册
  // 违规：无 MeterProvider（仅 trace）
  // 违规：无 OTel Logs API（裸 console.log）
  console.log('handling request');
  span.end();
}

// 违规：无 shutdown/forceFlush（进程退出丢最后一批 span）
