"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StdioRunner = void 0;
const stdio_js_1 = require("@modelcontextprotocol/sdk/server/stdio.js");
const index_js_1 = require("../common/logging/index.js");
const base_js_1 = require("./base.js");
class StdioRunner extends base_js_1.TransportRunnerBase {
    constructor(config) {
        super(config);
    }
    async start({ serverOptions, sessionOptions, } = {}) {
        try {
            this.server = await this.createServer({ serverOptions, sessionOptions });
            const transport = new stdio_js_1.StdioServerTransport();
            await this.server.connect(transport);
        }
        catch (error) {
            this.logger.emergency({
                id: index_js_1.LogId.serverStartFailure,
                context: "server",
                message: `Fatal error running server: ${error}`,
            });
            process.exit(1);
        }
    }
    async closeTransport() {
        await this.server?.close();
    }
}
exports.StdioRunner = StdioRunner;
//# sourceMappingURL=stdio.js.map