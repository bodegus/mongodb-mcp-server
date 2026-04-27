import type { LoggerBase } from "./logging/index.js";
import type { Metrics } from "./metrics/metricsTypes.js";
import type { DefaultMetrics } from "./metrics/metricDefinitions.js";
/**
 * Minimal interface for a transport that can be stored in a SessionStore.
 * The transport must have a close method for cleanup.
 */
export type CloseableTransport = {
    close(): Promise<void>;
};
export type SessionCloseReason = "idle_timeout" | "transport_closed" | "server_stop" | "unknown";
/**
 * Interface for managing MCP transport sessions.
 *
 * Implement this interface to provide custom session storage and lifecycle
 * management (e.g. database-based session storage).
 */
export interface ISessionStore<T extends CloseableTransport = CloseableTransport> {
    getSession(sessionId: string): Promise<T | undefined>;
    addSession(params: {
        sessionId: string;
        transport: T;
        logger: LoggerBase;
    }): Promise<void>;
    closeSession(params: {
        sessionId: string;
        reason?: SessionCloseReason;
    }): Promise<void>;
    closeAllSessions(): Promise<void>;
}
export declare class SessionStore<T extends CloseableTransport = CloseableTransport> implements ISessionStore<T> {
    private sessions;
    private readonly idleTimeoutMS;
    private readonly notificationTimeoutMS;
    private readonly logger;
    private readonly metrics;
    constructor(params: {
        options: {
            idleTimeoutMS: number;
            notificationTimeoutMS: number;
        };
        logger: LoggerBase;
        metrics: Metrics<DefaultMetrics>;
    });
    getSession(sessionId: string): Promise<T | undefined>;
    private resetTimeout;
    private sendNotification;
    addSession(params: {
        sessionId: string;
        transport: T;
        logger: LoggerBase;
    }): Promise<void>;
    closeSession({ sessionId, reason, }: {
        sessionId: string;
        reason?: SessionCloseReason;
    }): Promise<void>;
    closeAllSessions(): Promise<void>;
}
/**
 * Constructor arguments for creating a SessionStore instance.
 */
export type SessionStoreConstructorArgs<TMetrics extends DefaultMetrics = DefaultMetrics> = {
    options: {
        idleTimeoutMS: number;
        notificationTimeoutMS: number;
    };
    logger: LoggerBase;
    metrics: Metrics<TMetrics>;
};
/**
 * A function to create a custom SessionStore instance.
 * When provided, the runner will use this function instead of the default SessionStore constructor.
 */
export type CreateSessionStoreFn<TTransport extends CloseableTransport = CloseableTransport, TMetrics extends DefaultMetrics = DefaultMetrics> = (args: SessionStoreConstructorArgs<TMetrics>) => ISessionStore<TTransport>;
/**
 * Creates a default SessionStore instance from the provided constructor arguments.
 */
export declare function createDefaultSessionStore<TTransport extends CloseableTransport = CloseableTransport, TMetrics extends DefaultMetrics = DefaultMetrics>(params: SessionStoreConstructorArgs<TMetrics>): SessionStore<TTransport>;
//# sourceMappingURL=sessionStore.d.ts.map