import { Counter, Histogram } from "prom-client";
/**
 * Creates a new set of default metrics for the MCP server.
 *
 * NOTE: `registers: []` prevents prom-client from auto-registering these into
 * the global registry; `PrometheusMetrics` registers them into its own
 * isolated `Registry` instead.
 */
export declare function createDefaultMetrics(): {
    readonly toolExecutionDuration: Histogram<"status" | "category" | "tool_name" | "operation_type" | "error_type">;
    readonly sessionCreated: Counter<string>;
    readonly sessionClosed: Counter<"reason">;
};
export type DefaultMetrics = ReturnType<typeof createDefaultMetrics>;
//# sourceMappingURL=metricDefinitions.d.ts.map