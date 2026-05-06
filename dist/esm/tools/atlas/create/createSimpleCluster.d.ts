import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type ToolArgs, type OperationType } from "../../tool.js";
import { AtlasToolBase } from "../atlasTool.js";
import { z } from "zod";
export declare class CreateSimpleClusterTool extends AtlasToolBase {
    static toolName: string;
    static operationType: OperationType;
    description: string;
    argsShape: {
        projectId: z.ZodString;
        clusterName: z.ZodString;
        clusterProfile: z.ZodEnum<{
            NONPROD: "NONPROD";
            PROD: "PROD";
        }>;
        provider: z.ZodEnum<{
            AWS: "AWS";
            AZURE: "AZURE";
            GCP: "GCP";
        }>;
        regions: z.ZodArray<z.ZodString>;
    };
    protected execute({ projectId, clusterName, clusterProfile, provider, regions, }: ToolArgs<typeof this.argsShape>): Promise<CallToolResult>;
}
//# sourceMappingURL=createSimpleCluster.d.ts.map