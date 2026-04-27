"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.defaultCreateConnectionManager = exports.MCPConnectionManager = exports.ConnectionManager = exports.ConnectionStateConnected = exports.defaultDriverOptions = void 0;
const events_1 = require("events");
const service_provider_node_driver_1 = require("@mongosh/service-provider-node-driver");
const arg_parser_1 = require("@mongosh/arg-parser");
const errors_js_1 = require("./errors.js");
const index_js_1 = require("./logging/index.js");
const packageInfo_js_1 = require("./packageInfo.js");
const connectionOptions_js_1 = require("../helpers/connectionOptions.js");
const connectionInfo_js_1 = require("./connectionInfo.js");
const MCP_TEST_DATABASE = "#mongodb-mcp";
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
    async isSearchSupported() {
        if (this._isSearchSupported === undefined) {
            try {
                // If a cluster supports search indexes, the call below will succeed
                // with a cursor otherwise will throw an Error.
                // the Search Index Management Service might not be ready yet, but
                // we assume that the agent can retry in that situation.
                await this.serviceProvider.getSearchIndexes(MCP_TEST_DATABASE, "test");
                this._isSearchSupported = true;
            }
            catch {
                this._isSearchSupported = false;
            }
        }
        return this._isSearchSupported;
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