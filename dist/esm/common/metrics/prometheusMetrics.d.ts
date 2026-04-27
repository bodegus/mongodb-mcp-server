import { Registry } from "prom-client";
import type { Metrics, MetricDefinitions } from "./metricsTypes.js";
export declare class PrometheusMetrics<TMetrics extends MetricDefinitions> implements Metrics<TMetrics> {
    readonly registry: Registry;
    private readonly definitions;
    constructor({ definitions, registry, collectProcessMetrics, }: {
        definitions: TMetrics;
        /** Whether to collect Node.js and process metrics. */
        collectProcessMetrics?: boolean;
        registry?: Registry;
    });
    get<K extends keyof TMetrics>(key: K): TMetrics[K];
    getMetrics(): Promise<string>;
}
//# sourceMappingURL=prometheusMetrics.d.ts.map