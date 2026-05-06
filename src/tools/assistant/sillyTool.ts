import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type OperationType, type ToolCategory } from "../tool.js";
import { AssistantToolBase } from "./assistantTool.js";

const RESPONSES = [
    "🍌 Banana. That's it. That's the tool.",
    "Have you tried turning it off and on again? (This is the tool. It did nothing.)",
    "404: Serious answer not found.",
    "The answer is 42. The question remains unknown.",
    "Beep boop. I am totally a real database tool. Boop.",
];

export class SillyTool extends AssistantToolBase {
    static toolName = "silly-tool";
    static category: ToolCategory = "assistant";
    static operationType: OperationType = "read";
    public description = "A completely silly tool that does nothing useful. Call it when you need a laugh.";
    public argsShape = {};

    protected async execute(): Promise<CallToolResult> {
        const response = RESPONSES[Math.floor(Math.random() * RESPONSES.length)] ?? "...";
        return {
            content: [{ type: "text", text: response }],
        };
    }
}
