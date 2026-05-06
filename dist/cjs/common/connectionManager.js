"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultCreateConnectionManager = exports.MCPConnectionManager = exports.ConnectionManager = exports.ConnectionStateConnected = exports.defaultDriverOptions = void 0;
const events_1 = require("events");
const mongodb_1 = require("mongodb");
const service_provider_node_driver_1 = require("@mongosh/service-provider-node-driver");
const arg_parser_1 = require("@mongosh/arg-parser");
const errors_js_1 = require("./errors.js");
const index_js_1 = require("./logging/index.js");
const packageInfo_js_1 = require("./packageInfo.js");
const connectionOptions_js_1 = require("../helpers/connectionOptions.js");
const connectionInfo_js_1 = require("./connectionInfo.js");
const SEARCH_PROBE_COLLECTION_NAME = "test";
/** See https://github.com/mongodb/mongo/blob/master/src/mongo/base/error_codes.yml (SearchNotEnabled). */
const MONGODB_SEARCH_NOT_ENABLED_ERROR_CODE = 31082;
exports.defaultDriverOptions = {
    readConcern: {
        level: "local",
    },
    readPreference: "secondaryPreferred",
    writeConcern: {
        w: "majority",
    },
    timeoutMS: 30000,
    proxy: { useEnvironmentVariableProxies: true },
    applyProxyToOIDC: true,
};
class ConnectionStateConnected {
    constructor(serviceProvider, connectionStringInfo, connectedAtlasCluster) {
        this.serviceProvider = serviceProvider;
        this.connectionStringInfo = connectionStringInfo;
        this.connectedAtlasCluster = connectedAtlasCluster;
        this.tag = "connected";
    }
    async isSearchSupported(logger) {
        if (this._isSearchSupported === undefined) {
            this._isSearchSupported = await this.probeSearchCapability(logger);
        }
        return this._isSearchSupported;
    }
    async probeSearchCapability(logger) {
        const databases = await this.buildSearchProbeDatabaseCandidates(logger);
        for (const databaseName of databases) {
            try {
                await this.serviceProvider.getSearchIndexes(databaseName, SEARCH_PROBE_COLLECTION_NAME);
                logger.debug({
                    id: index_js_1.LogId.searchCapabilityProbe,
                    context: "ConnectionStateConnected",
                    message: "Atlas Search capability probe succeeded",
                });
                return true;
            }
            catch (probeError) {
                if (probeError instanceof mongodb_1.MongoServerError &&
                    (probeError.code === MONGODB_SEARCH_NOT_ENABLED_ERROR_CODE ||
                        probeError.codeName === "SearchNotEnabled")) {
                    logger.debug({
                        id: index_js_1.LogId.searchCapabilityProbe,
                        context: "ConnectionStateConnected",
                        message: "Atlas Search capability probe: search not enabled on cluster",
                    });
                    return false;
                }
                logger.debug({
                    id: index_js_1.LogId.searchCapabilityProbe,
                    context: "ConnectionStateConnected",
                    message: "Atlas Search capability probe: inconclusive error for database candidate, trying next",
                });
            }
        }
        logger.debug({
            id: index_js_1.LogId.searchCapabilityProbe,
            context: "ConnectionStateConnected",
            message: "Atlas Search capability probe: no success and no SearchNotEnabled; assuming search is supported",
        });
        return true;
    }
    /**
     * Build an ordered list of database names to try for the search index probe.
     * Prefers the driver's initial database from the connection string (when not
     * a system DB), then other non-system databases from listDatabases, then the
     * fallback #mongodb-mcp database.
     */
    async buildSearchProbeDatabaseCandidates(logger) {
        let listedNames = [];
        try {
            const raw = (await this.serviceProvider.listDatabases(""));
            const rows = raw.databases;
            if (Array.isArray(rows)) {
                listedNames = rows
                    .map((row) => row.name)
                    .filter((name) => typeof name === "string" && name.length > 0);
            }
        }
        catch {
            logger.debug({
                id: index_js_1.LogId.searchCapabilityProbe,
                context: "ConnectionStateConnected",
                message: "listDatabases failed while building Atlas Search probe candidates",
            });
        }
        // System databases that should be skipped when searching for accessible databases
        const SYSTEM_DATABASES = new Set(["admin", "local", "config"]);
        const nonSystem = listedNames
            .filter((name) => !SYSTEM_DATABASES.has(name))
            .slice(0, 10)
            .sort((a, b) => a.localeCompare(b));
        const result = new Set();
        const initialDb = this.serviceProvider.initialDb;
        if (initialDb.length > 0 && !SYSTEM_DATABASES.has(initialDb)) {
            result.add(initialDb);
        }
        for (const name of nonSystem) {
            result.add(name);
        }
        result.add("#mongodb-mcp");
        return [...result];
    }
}
exports.ConnectionStateConnected = ConnectionStateConnected;
class ConnectionManager {
    constructor() {
        this.clientName = "unknown";
        this.events = this._events = new events_1.EventEmitter();
        this.state = { tag: "disconnected" };
    }
    get currentConnectionState() {
        return this.state;
    }
    changeState(event, newState) {
        this.state = newState;
        // TypeScript doesn't seem to be happy with the spread operator and generics
        // eslint-disable-next-line
        this._events.emit(event, ...[newState]);
        return newState;
    }
    setClientName(clientName) {
        this.clientName = clientName;
    }
}
exports.ConnectionManager = ConnectionManager;
class MCPConnectionManager extends ConnectionManager {
    constructor(userConfig, logger, deviceId, bus) {
        super();
        this.userConfig = userConfig;
        this.logger = logger;
        this.bus = bus ?? new events_1.EventEmitter();
        this.bus.on("mongodb-oidc-plugin:auth-failed", this.onOidcAuthFailed.bind(this));
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        this.bus.on("mongodb-oidc-plugin:auth-succeeded", this.onOidcAuthSucceeded.bind(this));
        this.deviceId = deviceId;
    }
    async connect(settings) {
        var _a, _b, _c, _d;
        this._events.emit("connection-request", this.currentConnectionState);
        if (this.currentConnectionState.tag === "connected" || this.currentConnectionState.tag === "connecting") {
            await this.disconnect();
        }
        let serviceProvider;
        let connectionStringInfo = { authType: "scram", hostType: "unknown" };
        try {
            settings = { ...settings };
            const appNameComponents = {
                appName: `${packageInfo_js_1.packageInfo.mcpServerName} ${packageInfo_js_1.packageInfo.version}`,
                deviceId: this.deviceId.get(),
                clientName: this.clientName,
            };
            settings.connectionString = await (0, connectionOptions_js_1.setAppNameParamIfMissing)({
                connectionString: settings.connectionString,
                components: appNameComponents,
            });
            const connectionInfo = settings.driverOptions
                ? {
                    connectionString: settings.connectionString,
                    driverOptions: settings.driverOptions,
                }
                : (0, arg_parser_1.generateConnectionInfoFromCliArgs)({
                    ...exports.defaultDriverOptions,
                    connectionSpecifier: settings.connectionString,
                });
            if (connectionInfo.driverOptions.oidc) {
                (_a = connectionInfo.driverOptions.oidc).allowedFlows ?? (_a.allowedFlows = ["auth-code"]);
                (_b = connectionInfo.driverOptions.oidc).notifyDeviceFlow ?? (_b.notifyDeviceFlow = this.onOidcNotifyDeviceFlow.bind(this));
            }
            (_c = connectionInfo.driverOptions).proxy ?? (_c.proxy = { useEnvironmentVariableProxies: true });
            (_d = connectionInfo.driverOptions).applyProxyToOIDC ?? (_d.applyProxyToOIDC = true);
            connectionStringInfo = (0, connectionInfo_js_1.getConnectionStringInfo)(connectionInfo.connectionString, this.userConfig, settings.atlas);
            serviceProvider = service_provider_node_driver_1.NodeDriverServiceProvider.connect(connectionInfo.connectionString, {
                productDocsLink: "https://github.com/mongodb-js/mongodb-mcp-server/",
                productName: "MongoDB MCP",
                ...connectionInfo.driverOptions,
            }, undefined, this.bus);
        }
        catch (error) {
            const errorReason = error instanceof Error ? error.message : `${error}`;
            this.changeState("connection-error", {
                tag: "errored",
                errorReason,
                connectionStringInfo,
                connectedAtlasCluster: settings.atlas,
            });
            throw new errors_js_1.MongoDBError(errors_js_1.ErrorCodes.MisconfiguredConnectionString, errorReason);
        }
        try {
            if (connectionStringInfo.authType.startsWith("oidc")) {
                return this.changeState("connection-request", {
                    tag: "connecting",
                    serviceProvider,
                    connectedAtlasCluster: settings.atlas,
                    connectionStringInfo,
                    oidcConnectionType: connectionStringInfo.authType,
                });
            }
            return this.changeState("connection-success", new ConnectionStateConnected(await serviceProvider, connectionStringInfo, settings.atlas));
        }
        catch (error) {
            const errorReason = error instanceof Error ? error.message : `${error}`;
            this.changeState("connection-error", {
                tag: "errored",
                errorReason,
                connectionStringInfo,
                connectedAtlasCluster: settings.atlas,
            });
            throw new errors_js_1.MongoDBError(errors_js_1.ErrorCodes.NotConnectedToMongoDB, errorReason);
        }
    }
    async disconnect() {
        if (this.currentConnectionState.tag === "disconnected" || this.currentConnectionState.tag === "errored") {
            return this.currentConnectionState;
        }
        if (this.currentConnectionState.tag === "connected" || this.currentConnectionState.tag === "connecting") {
            try {
                if (this.currentConnectionState.tag === "connected") {
                    await this.currentConnectionState.serviceProvider?.close();
                }
                if (this.currentConnectionState.tag === "connecting") {
                    const serviceProvider = await this.currentConnectionState.serviceProvider;
                    await serviceProvider.close();
                }
            }
            finally {
                this.changeState("connection-close", {
                    tag: "disconnected",
                });
            }
        }
        return { tag: "disconnected" };
    }
    async close() {
        try {
            await this.disconnect();
        }
        catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.logger.error({
                id: index_js_1.LogId.mongodbDisconnectFailure,
                context: "ConnectionManager",
                message: `Error when closing ConnectionManager: ${error.message}`,
            });
        }
        finally {
            this._events.emit("close", this.currentConnectionState);
        }
    }
    onOidcAuthFailed(error) {
        if (this.currentConnectionState.tag === "connecting" &&
            this.currentConnectionState.connectionStringInfo?.authType?.startsWith("oidc")) {
            void this.disconnectOnOidcError(error);
        }
    }
    async onOidcAuthSucceeded() {
        if (this.currentConnectionState.tag === "connecting" &&
            this.currentConnectionState.connectionStringInfo?.authType?.startsWith("oidc")) {
            this.changeState("connection-success", new ConnectionStateConnected(await this.currentConnectionState.serviceProvider, this.currentConnectionState.connectionStringInfo, this.currentConnectionState.connectedAtlasCluster));
        }
        this.logger.info({
            id: index_js_1.LogId.oidcFlow,
            context: "mongodb-oidc-plugin:auth-succeeded",
            message: "Authenticated successfully.",
        });
    }
    onOidcNotifyDeviceFlow(flowInfo) {
        if (this.currentConnectionState.tag === "connecting" &&
            this.currentConnectionState.connectionStringInfo?.authType?.startsWith("oidc")) {
            this.changeState("connection-request", {
                ...this.currentConnectionState,
                tag: "connecting",
                connectionStringInfo: {
                    ...this.currentConnectionState.connectionStringInfo,
                    authType: "oidc-device-flow",
                },
                oidcLoginUrl: flowInfo.verificationUrl,
                oidcUserCode: flowInfo.userCode,
            });
        }
        this.logger.info({
            id: index_js_1.LogId.oidcFlow,
            context: "mongodb-oidc-plugin:notify-device-flow",
            message: "OIDC Flow changed automatically to device flow.",
        });
    }
    async disconnectOnOidcError(error) {
        try {
            await this.disconnect();
        }
        catch (error) {
            this.logger.warning({
                id: index_js_1.LogId.oidcFlow,
                context: "disconnectOnOidcError",
                message: String(error),
            });
        }
        finally {
            this.changeState("connection-error", { tag: "errored", errorReason: String(error) });
        }
    }
}
exports.MCPConnectionManager = MCPConnectionManager;
const defaultCreateConnectionManager = ({ logger, deviceId, userConfig }) => {
    return Promise.resolve(new MCPConnectionManager(userConfig, logger, deviceId));
};
exports.defaultCreateConnectionManager = defaultCreateConnectionManager;
//# sourceMappingURL=connectionManager.js.map