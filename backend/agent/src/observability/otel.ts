/**
 * Observability — OpenTelemetry setup.
 *
 * Dev: traces → console (structured JSON logs).
 * Prod: swap ConsoleSpanExporter for OTLPTraceExporter pointing at your collector.
 *
 * Standard span attributes used across all nodes:
 *   user.id, session.thread_id, agent.node, memory.type
 *
 * TODO (prod): uncomment OTLP exporter and point at Langfuse collector endpoint.
 */

import { trace, context, SpanStatusCode, type Span } from "@opentelemetry/api"
import { NodeSDK } from "@opentelemetry/sdk-node"
import { SimpleSpanProcessor, ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"

const serviceName = process.env["OTEL_SERVICE_NAME"] ?? "gen-ux-agent"

function buildExporter() {
  const base = process.env["LANGFUSE_BASEURL"]
  const pub = process.env["LANGFUSE_PUBLIC_KEY"]
  const sec = process.env["LANGFUSE_SECRET_KEY"]
  if (base && pub && sec) {
    return new OTLPTraceExporter({
      url: `${base}/api/public/otel/v1/traces`,
      headers: {
        Authorization: `Basic ${Buffer.from(`${pub}:${sec}`).toString("base64")}`,
      },
    })
  }
  return new ConsoleSpanExporter()
}

const sdk = new NodeSDK({
  serviceName,
  spanProcessors: [new SimpleSpanProcessor(buildExporter())],
})

export function initTelemetry(): void {
  sdk.start()
  console.log(`[otel] Telemetry initialised — service: ${serviceName} (console exporter)`)
}

export function shutdownTelemetry(): Promise<void> {
  return sdk.shutdown()
}

const tracer = trace.getTracer(serviceName)

/** Wrap an async function in a named span with standard agent attributes. */
export async function withSpan<T>(
  spanName: string,
  attrs: {
    userId?: string
    sessionId?: string
    agentNode?: string
    memoryType?: string
  },
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(spanName, async (span) => {
    if (attrs.userId) span.setAttribute("user.id", attrs.userId)
    if (attrs.sessionId) span.setAttribute("session.thread_id", attrs.sessionId)
    if (attrs.agentNode) span.setAttribute("agent.node", attrs.agentNode)
    if (attrs.memoryType) span.setAttribute("memory.type", attrs.memoryType)

    try {
      const result = await fn(span)
      span.setStatus({ code: SpanStatusCode.OK })
      return result
    } catch (err) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: err instanceof Error ? err.message : String(err),
      })
      throw err
    } finally {
      span.end()
    }
  })
}

export { context, tracer }
