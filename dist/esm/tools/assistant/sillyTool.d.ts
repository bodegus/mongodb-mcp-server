import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type OperationType, type ToolCategory } from "../tool.js";
import { AssistantToolBase } from "./assistantTool.js";
export declare class SillyTool extends AssistantToolBase {
    static toolName: string;
    static category: ToolCategory;
    static operationType: OperationType;
    description: string;
    argsShape: {};
    protected execute(): Promise<CallToolResult>;
}
//# sourceMappingURL=sillyTool.d.ts.map