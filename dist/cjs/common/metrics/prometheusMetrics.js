"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrometheusMetrics = void 0;
const prom_client_1 = require("prom-client");
class PrometheusMetrics {
    constructor({ definitions, registry, collectProcessMetrics = false, }) {
        this.registry = registry ?? new prom_client_1.Registry();
        if (collectProcessMetrics) {
            (0, prom_client_1.collectDefaultMetrics)({ register: this.registry });
        }
        this.definitions = definitions;
        for (const key in this.definitions) {
            const metric = this.definitions[key];
            this.registry.registerMetric(metric);
        }
    }
    get(key) {
        return this.definitions[key];
    }
    async getMetrics() {
        return this.registry.metrics();
    }
}
exports.PrometheusMetrics = PrometheusMetrics;
//# sourceMappingURL=prometheusMetrics.js.map