"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Telemetry = exports.MAX_BACKOFF_MS = exports.INITIAL_BACKOFF_MS = exports.SEND_INTERVAL_MS = exports.BATCH_SIZE = void 0;
exports.nextBackoffMs = nextBackoffMs;
const index_js_1 = require("../common/logging/index.js");
const apiClientError_js_1 = require("../common/atlas/apiClientError.js");
const constants_js_1 = require("./constants.js");
const eventCache_js_1 = require("./eventCache.js");
const container_js_1 = require("../helpers/container.js");
const events_1 = require("events");
const mongodb_redact_1 = require("mongodb-redact");
const timer_js_1 = require("./timer.js");
/** The timeout for individual send requests in milliseconds. */
const SEND_TIMEOUT_MS = 5000;
/** How long close() waits for a final flush before giving up. */
const CLOSE_TIMEOUT_MS = 5000;
/** Maximum number of events sent per batch. */
exports.BATCH_SIZE = 32;
/** Delay between send attempts under normal conditions. */
exports.SEND_INTERVAL_MS = 30000;
/** Initial backoff delay after a 429 response. */
exports.INITIAL_BACKOFF_MS = 60000;
/** Maximum backoff delay (1 hour). */
exports.MAX_BACKOFF_MS = 3600000;
/**
 * Calculates the next backoff duration, doubling the current value up to MAX_BACKOFF_MS.
 */
function nextBackoffMs(currentMs) {
    return Math.min(currentMs * 2, exports.MAX_BACKOFF_MS);
}
class Telemetry {
    constructor(session, userConfig, commonProperties, { eventCache, deviceId }) {
        this.session = session;
        this.userConfig = userConfig;
        this.commonProperties = commonProperties;
        this.isBufferingEvents = true;
        this.events = new events_1.EventEmitter();
        this.backoffMs = exports.INITIAL_BACKOFF_MS;
        this.timer = new timer_js_1.Timer();
        this.eventCache = eventCache;
        this.deviceId = deviceId;
    }
    static create(session, userConfig, deviceId, { commonProperties = {}, eventCache = eventCache_js_1.EventCache.getInstance(), } = {}) {
        const mergedProperties = {
            ...constants_js_1.MACHINE_METADATA,
            ...commonProperties,
        };
        const instance = new Telemetry(session, userConfig, mergedProperties, {
            eventCache,
            deviceId,
        });
        void instance.setup();
        return instance;
    }
    async setup() {
        if (!this.isTelemetryEnabled()) {
            this.session.logger.info({
                id: index_js_1.LogId.telemetryEmitFailure,
                context: "telemetry",
                message: "Telemetry is disabled.",
                noRedaction: true,
            });
            return;
        }
        this.setupPromise = Promise.all([this.deviceId.get(), (0, container_js_1.detectContainerEnv)()]);
        const [deviceIdValue, containerEnv] = await this.setupPromise;
        this.commonProperties.device_id = deviceIdValue;
        this.commonProperties.is_container_env = containerEnv ? "true" : "false";
        this.isBufferingEvents = false;
        this.scheduleSend();
    }
    async close() {
        this.timer.cancel();
        this.session.logger.debug({
            id: index_js_1.LogId.telemetryClose,
            message: `Closing telemetry, attempting to flush up to ${exports.BATCH_SIZE} of ${this.eventCache.size} remaining events`,
            context: "telemetry",
        });
        // Best-effort: send one final batch before closing, bounded by CLOSE_TIMEOUT_MS
        await this.sendBatch({ signal: AbortSignal.timeout(CLOSE_TIMEOUT_MS) });
    }
    /**
     * Caches events for sending via the background timer.
     */
    emitEvents(events) {
        if (!this.isTelemetryEnabled()) {
            this.events.emit("events-skipped");
            return;
        }
        this.eventCache.appendEvents(events);
    }
    /**
     * Gets the common properties for events
     */
    getCommonProperties() {
        return {
            ...this.commonProperties,
            transport: this.userConfig.transport,
            mcp_client_version: this.session.mcpClient?.version,
            mcp_client_name: this.session.mcpClient?.name,
            session_id: this.session.sessionId,
            config_atlas_auth: this.session.apiClient?.isAuthConfigured() ? "true" : "false",
            config_connection_string: this.userConfig.connectionString ? "true" : "false",
        };
    }
    /**
     * Checks if telemetry is currently enabled.
     * This is a method rather than a constant to capture runtime config changes.
     *
     * Follows the Console Do Not Track standard (https://consoledonottrack.com/)
     * by respecting the DO_NOT_TRACK environment variable.
     */
    isTelemetryEnabled() {
        if (this.userConfig.telemetry === "disabled") {
            return false;
        }
        const doNotTrack = "DO_NOT_TRACK" in process.env;
        return !doNotTrack;
    }
    /**
     * Schedules the next send attempt. Replaces any previously scheduled send.
     */
    scheduleSend(delayMs = exports.SEND_INTERVAL_MS) {
        this.timer.schedule(() => {
            void this.sendBatchAndReschedule();
        }, delayMs);
    }
    /**
     * Sends a batch and reschedules the next attempt based on the result.
     */
    async sendBatchAndReschedule() {
        const result = await this.sendBatch();
        const delay = this.getNextDelay(result);
        this.scheduleSend(delay);
    }
    /**
     * Determines the next send delay based on the result of the last batch.
     * On rate-limit: uses and advances exponential backoff.
     * On success: resets backoff and returns the normal interval.
     * On error/empty: returns the normal interval without changing backoff state.
     */
    getNextDelay(result) {
        if (result.status === "rate-limited") {
            const delay = this.backoffMs;
            this.backoffMs = nextBackoffMs(this.backoffMs);
            this.session.logger.debug({
                id: index_js_1.LogId.telemetryRateLimited,
                context: "telemetry",
                message: `Rate limited. Backing off for ${delay}ms, next backoff will be ${this.backoffMs}ms`,
                noRedaction: true,
            });
            return delay;
        }
        if (result.status === "success") {
            this.backoffMs = exports.INITIAL_BACKOFF_MS;
        }
        return exports.SEND_INTERVAL_MS;
    }
    /**
     * Sends up to BATCH_SIZE oldest events from the cache.
     * On success the sent events are removed; on failure they stay in the cache.
     * Does not reschedule — the caller decides what to do next.
     */
    async sendBatch({ signal } = {}) {
        if (!this.session.apiClient || this.eventCache.size === 0)
            return { status: "empty" };
        const apiClient = this.session.apiClient;
        const result = await this.eventCache.processOldestBatch(exports.BATCH_SIZE, async (events) => {
            this.session.logger.debug({
                id: index_js_1.LogId.telemetryEmitStart,
                context: "telemetry",
                message: `Attempting to send ${events.length} events`,
            });
            const sendResult = await this.sendEvents(apiClient, events, signal);
            if (sendResult.status !== "success") {
                if (sendResult.status !== "rate-limited") {
                    this.session.logger.debug({
                        id: index_js_1.LogId.telemetryEmitFailure,
                        context: "telemetry",
                        message: `Error sending telemetry: ${sendResult.error?.message ?? "unknown error"}`,
                        noRedaction: true,
                    });
                }
                this.events.emit("events-send-failed");
                return { removeProcessed: false, result: sendResult };
            }
            this.session.logger.debug({
                id: index_js_1.LogId.telemetryEmitSuccess,
                context: "telemetry",
                message: `Sent ${events.length} events successfully`,
            });
            this.events.emit("events-emitted");
            return { removeProcessed: true, result: sendResult };
        });
        return result ?? { status: "empty" };
    }
    /**
     * Sends events through the API client after redacting sensitive data.
     */
    async sendEvents(client, events, signal) {
        try {
            const effectiveSignal = signal ?? AbortSignal.timeout(SEND_TIMEOUT_MS);
            await client.sendEvents(events.map((event) => ({
                ...event,
                properties: {
                    ...(0, mongodb_redact_1.redact)(this.getCommonProperties(), this.session.keychain.allSecrets),
                    ...(0, mongodb_redact_1.redact)(event.properties, this.session.keychain.allSecrets),
                },
            })), { signal: effectiveSignal });
            return { status: "success" };
        }
        catch (error) {
            if (error instanceof apiClientError_js_1.ApiClientError && error.response.status === 429) {
                return { status: "rate-limited", error };
            }
            return {
                status: "error",
                error: error instanceof Error ? error : new Error(String(error)),
            };
        }
    }
}
exports.Telemetry = Telemetry;
//# sourceMappingURL=telemetry.js.map