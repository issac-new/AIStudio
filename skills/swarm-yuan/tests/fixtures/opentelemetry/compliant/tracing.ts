// compliant fixture:
//  - service.name + deployment.environment → service_name / deployment_env pass
//  - OTLP exporter + endpoint → exporter_endpoint pass
//  - TraceIdRatioBased sampler → sampler pass
//  - 无 Jaeger/Zipkin exporter → deprecated_exporter pass
//  - setAttribute 业务上下文 → span_attributes pass
//  - W3CBaggagePropagator → baggage_propagation pass
//  - MeterProvider + OTLPMetricExporter → metrics_export pass
//  - OTel Logs API (LoggerProvider) → logs_api pass
//  - sdk.shutdown() → graceful_shutdown pass
//
// 期望：bash run-framework-fixture.sh opentelemetry → compliant 退出码 == 0（PASS）
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader, MeterProvider } from '@opentelemetry/sdk-metrics';
import { logs, LoggerProvider } from '@opentelemetry/api-logs';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-http';
import { trace, context, Baggage, W3CBaggagePropagator, W3CTraceContextPropagator } from '@opentelemetry/api';
import { TraceIdRatioBasedSampler, ParentBasedSampler } from '@opentelemetry/core';

// 合规：service.name + deployment.environment
const resource = new Resource({
  'service.name': 'order-service',
  'deployment.environment': 'prod',
});

// 合规：OTLP exporter + 显式 endpoint
const traceExporter = new OTLPTraceExporter({
  endpoint: 'http://otel-collector.observability:4318/v1/traces',
});

// 合规：TraceIdRatioBased + ParentBased sampler
const sampler = new ParentBasedSampler({
  inner: new TraceIdRatioBasedSampler(0.1),
});

// 合规：MeterProvider + OTLPMetricExporter
const meterProvider = new MeterProvider({
  readers: [new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({ url: 'http://otel-collector.observability:4318/v1/metrics' }),
  })],
  resource,
});

// 合规：OTel Logs API (LoggerProvider + OTLPLogExporter)
const loggerProvider = new LoggerProvider();
loggerProvider.addLogRecordProcessor(new (require('@opentelemetry/sdk-logs').BatchLogRecordProcessor)(
  new OTLPLogExporter({ url: 'http://otel-collector.observability:4318/v1/logs' })
));
logs.setGlobalLoggerProvider(loggerProvider);

const sdk = new NodeSDK({
  resource,
  traceExporter,
  // 合规：显式 sampler
  sampler,
  // 合规：Baggage propagator
  textMapPropagator: [new W3CTraceContextPropagator(), new W3CBaggagePropagator()],
  meterProvider,
});

sdk.start();

const tracer = trace.getTracer('order-service');

export async function handleRequest(req: any) {
  const span = tracer.startSpan('handleRequest');
  // 合规：setAttribute 业务上下文
  span.setAttribute('user.id', req.userId);
  span.setAttribute('order.id', req.orderId);
  try {
    console.log('handling');
    span.end();
  } catch (e) {
    span.recordException(e);
    span.end();
  }
}

// 合规：graceful shutdown
process.on('SIGTERM', async () => {
  await sdk.shutdown();
  loggerProvider.shutdown();
  meterProvider.shutdown();
  process.exit(0);
});
