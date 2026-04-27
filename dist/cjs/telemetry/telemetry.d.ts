import type { Session } from "../common/session.js";
import type { BaseEvent, CommonProperties } from "./types.js";
import type { UserConfig } from "../common/config/userConfig.js";
import { EventCache } from "./eventCache.js";
import type { DeviceId } from "../helpers/deviceId.js";
import { EventEmitter } from "events";
export interface TelemetryEvents {
    "events-emitted": [];
    "events-send-failed": [];
    "events-skipped": [];
}
/** Maximum number of events sent per batch. */
export declare const BATCH_SIZE = 32;
/** Delay between send attempts under normal conditions. */
export declare const SEND_INTERVAL_MS = 30000;
/** Initial backoff delay after a 429 response. */
export declare const INITIAL_BACKOFF_MS = 60000;
/** Maximum backoff delay (1 hour). */
export declare const MAX_BACKOFF_MS = 3600000;
/**
 * Calculates the next backoff duration, doubling the current value up to MAX_BACKOFF_MS.
 */
export declare function nextBackoffMs(currentMs: number): number;
export declare class Telemetry {
    private readonly session;
    private readonly userConfig;
    private readonly commonProperties;
    private isBufferingEvents;
    /** Resolves when the setup is complete or a timeout occurs */
    setupPromise: Promise<[string, boolean]> | undefined;
    readonly events: EventEmitter<TelemetryEvents>;
    private eventCache;
    private deviceId;
    private backoffMs;
    private readonly timer;
    private constructor();
    static create(session: Session, userConfig: UserConfig, deviceId: DeviceId, { commonProperties, eventCache, }?: {
        commonProperties?: Partial<CommonProperties>;
        eventCache?: EventCache;
    }): Telemetry;
    private setup;
    close(): Promise<void>;
    /**
     * Caches events for sending via the background timer.
     */
    emitEvents(events: BaseEvent[]): void;
    /**
     * Gets the common properties for events
     */
    getCommonProperties(): CommonProperties;
    /**
     * Checks if telemetry is currently enabled.
     * This is a method rather than a constant to capture runtime config changes.
     *
     * Follows the Console Do Not Track standard (https://consoledonottrack.com/)
     * by respecting the DO_NOT_TRACK environment variable.
     */
    isTelemetryEnabled(): boolean;
    /**
     * Schedules the next send attempt. Replaces any previously scheduled send.
     */
    private scheduleSend;
    /**
     * Sends a batch and reschedules the next attempt based on the result.
     */
    private sendBatchAndReschedule;
    /**
     * Determines the next send delay based on the result of the last batch.
     * On rate-limit: uses and advances exponential backoff.
     * On success: resets backoff and returns the normal interval.
     * On error/empty: returns the normal interval without changing backoff state.
     */
    private getNextDelay;
    /**
     * Sends up to BATCH_SIZE oldest events from the cache.
     * On success the sent events are removed; on failure they stay in the cache.
     * Does not reschedule — the caller decides what to do next.
     */
    private sendBatch;
    /**
     * Sends events through the API client after redacting sensitive data.
     */
    private sendEvents;
}
//# sourceMappingURL=telemetry.d.ts.map