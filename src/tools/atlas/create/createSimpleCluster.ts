import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { type ToolArgs, type OperationType } from "../../tool.js";
import { AtlasToolBase } from "../atlasTool.js";
import type { ClusterDescription20240805 } from "../../../common/atlas/openapi.js";
import { ensureCurrentIpInAccessList } from "../../../common/atlas/accessListUtils.js";
import { AtlasArgs } from "../../args.js";
import { z } from "zod";

const PROFILES = {
    NONPROD: {
        instanceSize: "M10",
        diskSizeGB: 10,
        autoscaling: false,
        minInstanceSize: null as string | null,
        maxInstanceSize: null as string | null,
        backupEnabled: false,
        pitEnabled: false,
        terminationProtectionEnabled: false,
    },
    PROD: {
        instanceSize: "M30",
        diskSizeGB: 100,
        autoscaling: true,
        minInstanceSize: "M30",
        maxInstanceSize: "M60",
        backupEnabled: true,
        pitEnabled: true,
        terminationProtectionEnabled: true,
    },
} as const;

// NONPROD: odd region count → all 1s (sum is odd); even → first gets 2, rest 1 (sum is odd)
function nonprodNodeCounts(regionCount: number): number[] {
    if (regionCount % 2 === 1) {
        return Array<number>(regionCount).fill(1);
    }
    return [2, ...Array<number>(regionCount - 1).fill(1)];
}

// PROD: 1 region → [3]; N regions → 2 in every region except last which gets 1
function prodNodeCounts(regionCount: number): number[] {
    if (regionCount === 1) return [3];
    return [...Array<number>(regionCount - 1).fill(2), 1];
}

export class CreateSimpleClusterTool extends AtlasToolBase {
    static toolName = "atlas-create-simple-cluster";
    static operationType: OperationType = "create";

    public description =
        "Create a simple MongoDB Atlas replica set cluster using a NONPROD or PROD profile. " +
        "NONPROD: M10, no backup, no autoscaling. PROD: M30, backup + PIT enabled, compute and disk autoscaling.";

    public argsShape = {
        projectId: AtlasArgs.projectId().describe("Atlas project ID to create the cluster in"),
        clusterName: AtlasArgs.clusterName().describe("Name of the cluster"),
        clusterProfile: z
            .enum(["NONPROD", "PROD"])
            .describe(
                "NONPROD: M10, no backup, no autoscaling. PROD: M30, backup, PIT recovery, autoscaling M30→M60, termination protection."
            ),
        provider: z.enum(["AWS", "AZURE", "GCP"]).describe("Cloud provider"),
        regions: z
            .array(AtlasArgs.region())
            .min(1)
            .max(7)
            .describe(
                "Cloud provider regions in priority order — first entry is the primary region. " +
                    "E.g. [\"US_EAST_1\"] for AWS, [\"US_EAST\"] for Azure, [\"EASTERN_US\"] for GCP."
            ),
    };

    protected async execute({
        projectId,
        clusterName,
        clusterProfile,
        provider,
        regions,
    }: ToolArgs<typeof this.argsShape>): Promise<CallToolResult> {
        const profile = PROFILES[clusterProfile];
        const nodeCounts =
            clusterProfile === "NONPROD" ? nonprodNodeCounts(regions.length) : prodNodeCounts(regions.length);

        const regionConfigs = regions.map((regionName, i) => {
            const config: Record<string, unknown> = {
                providerName: provider,
                regionName,
                // Priorities must be unique and descending: 7 for primary, 6, 5, 4... for others.
                priority: 7 - i,
                electableSpecs: {
                    instanceSize: profile.instanceSize,
                    nodeCount: nodeCounts[i],
                    diskSizeGB: profile.diskSizeGB,
                },
            };

            if (profile.autoscaling) {
                config.autoScaling = {
                    compute: {
                        enabled: true,
                        scaleDownEnabled: true,
                        minInstanceSize: profile.minInstanceSize,
                        maxInstanceSize: profile.maxInstanceSize,
                    },
                    diskGB: { enabled: true },
                };
            }

            return config;
        });

        const body = {
            name: clusterName,
            clusterType: "REPLICASET",
            replicationSpecs: [{ zoneName: "Zone 1", regionConfigs }],
            backupEnabled: profile.backupEnabled,
            pitEnabled: profile.pitEnabled,
            terminationProtectionEnabled: profile.terminationProtectionEnabled,
            versionReleaseSystem: "CONTINUOUS",
        } as unknown as ClusterDescription20240805;

        await ensureCurrentIpInAccessList(this.apiClient, projectId);
        await this.apiClient.createCluster({
            params: { path: { groupId: projectId } },
            body,
        });

        const nodesSummary = regions.map((r, i) => {
            const n = nodeCounts[i] ?? 1;
            return `${r} (${n} node${n > 1 ? "s" : ""})`;
        }).join(", ");

        return {
            content: [
                {
                    type: "text",
                    text: `Cluster "${clusterName}" is being created.\n\nProfile: ${clusterProfile} | Provider: ${provider} | Regions: ${nodesSummary}\nInstance: ${profile.instanceSize} | Disk: ${profile.diskSizeGB}GB | Backup: ${profile.backupEnabled} | Autoscaling: ${profile.autoscaling} | Termination protection: ${profile.terminationProtectionEnabled}`,
                },
            ],
        };
    }
}
