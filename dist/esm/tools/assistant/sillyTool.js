import { AssistantToolBase } from "./assistantTool.js";
const RESPONSES = [
    "🍌 Banana. That's it. That's the tool.",
    "Have you tried turning it off and on again? (This is the tool. It did nothing.)",
    "404: Serious answer not found.",
    "The answer is 42. The question remains unknown.",
    "Beep boop. I am totally a real database tool. Boop.",
];
export class SillyTool extends AssistantToolBase {
    constructor() {
        super(...arguments);
        this.description = "A completely silly tool that does nothing useful. Call it when you need a laugh.";
        this.argsShape = {};
    }
    async execute() {
        const response = RESPONSES[Math.floor(Math.random() * RESPONSES.length)] ?? "...";
        return {
            content: [{ type: "text", text: response }],
        };
    }
}
SillyTool.toolName = "silly-tool";
SillyTool.category = "assistant";
SillyTool.operationType = "read";
//# sourceMappingURL=sillyTool.js.map