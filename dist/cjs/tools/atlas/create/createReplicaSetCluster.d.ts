import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { type ToolArgs, type OperationType } from "../../tool.js";
import { AtlasToolBase } from "../atlasTool.js";
export declare class CreateReplicaSetClusterTool extends AtlasToolBase {
    static toolName: string;
    description: string;
    static operationType: OperationType;
    argsShape: {
        projectId: z.ZodString;
        name: z.ZodString;
        region: z.ZodDefault<z.ZodString>;
        instanceSize: z.ZodDefault<z.ZodEnum<{
            M10: "M10";
            M20: "M20";
            M30: "M30";
            M40: "M40";
        }>>;
    };
    protected execute({ projectId, name, region, instanceSize, }: ToolArgs<typeof this.argsShape>): Promise<CallToolResult>;
}
//# sourceMappingURL=createReplicaSetCluster.d.ts.map