import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { LogId } from "../common/logging/index.js";
import { TransportRunnerBase } from "./base.js";
export class StdioRunner extends TransportRunnerBase {
    constructor(config) {
        super(config);
    }
    async start({ serverOptions, sessionOptions, } = {}) {
        try {
            this.server = await this.createServer({ serverOptions, sessionOptions });
            const transport = new StdioServerTransport();
            await this.server.connect(transport);
        }
        catch (error) {
            this.logger.emergency({
                id: LogId.serverStartFailure,
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
//# sourceMappingURL=stdio.js.map