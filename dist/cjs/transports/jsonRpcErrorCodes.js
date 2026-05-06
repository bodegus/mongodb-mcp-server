"use strict";
/**
 * JSON-RPC error codes for the MCP HTTP server.
 * These are defined in a separate module to avoid circular dependencies
 * between streamableHttp.ts and mcpHttpServer.ts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSON_RPC_ERROR_CODE_DISALLOWED_EXTERNAL_SESSION = exports.JSON_RPC_ERROR_CODE_INVALID_REQUEST = exports.JSON_RPC_ERROR_CODE_SESSION_NOT_FOUND = exports.JSON_RPC_ERROR_CODE_SESSION_ID_INVALID = exports.JSON_RPC_ERROR_CODE_SESSION_ID_REQUIRED = exports.JSON_RPC_ERROR_CODE_PROCESSING_REQUEST_FAILED = void 0;
exports.JSON_RPC_ERROR_CODE_PROCESSING_REQUEST_FAILED = -32000;
exports.JSON_RPC_ERROR_CODE_SESSION_ID_REQUIRED = -32001;
exports.JSON_RPC_ERROR_CODE_SESSION_ID_INVALID = -32002;
exports.JSON_RPC_ERROR_CODE_SESSION_NOT_FOUND = -32003;
exports.JSON_RPC_ERROR_CODE_INVALID_REQUEST = -32004;
exports.JSON_RPC_ERROR_CODE_DISALLOWED_EXTERNAL_SESSION = -32005;
//# sourceMappingURL=jsonRpcErrorCodes.js.map