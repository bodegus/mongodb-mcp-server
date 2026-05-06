"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateSimpleClusterTool = void 0;
const atlasTool_js_1 = require("../atlasTool.js");
const accessListUtils_js_1 = require("../../../common/atlas/accessListUtils.js");
const args_js_1 = require("../../args.js");
const zod_1 = require("zod");
const PROFILES = {
    NONPROD: {
        instanceSize: "M10",
        diskSizeGB: 10,
        autoscaling: true,
        minInstanceSize: "M10",
        maxInstanceSize: "M30",
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
};
// NONPROD: odd region count → all 1s (sum is odd); even → first gets 2, rest 1 (sum is odd)
function nonprodNodeCounts(regionCount) {
    if (regionCount % 2 === 1) {
        return Array(regionCount).fill(1);
    }
    return [2, ...Array(regionCount - 1).fill(1)];
}
// PROD: 1 region → [3]; N regions → 2 in every region except last which gets 1
function prodNodeCounts(regionCount) {
    if (regionCount === 1)
        return [3];
    return [...Array(regionCount - 1).fill(2), 1];
}
class CreateSimpleClusterTool extends atlasTool_js_1.AtlasToolBase {
    constructor() {
        super(...arguments);
        this.description = "Create a simple MongoDB Atlas replica set cluster using a NONPROD or PROD profile. " +
            "NONPROD: M10, autoscaling M10→M30, no backup. PROD: M30, autoscaling M30→M60, backup + PIT enabled, termination protection.";
        this.argsShape = {
            projectId: args_js_1.AtlasArgs.projectId().describe("Atlas project ID to create the cluster in"),
            clusterName: args_js_1.AtlasArgs.clusterName().describe("Name of the cluster"),
            clusterProfile: zod_1.z
                .enum(["NONPROD", "PROD"])
                .describe("NONPROD: M10, no backup, autoscaling M10→M30. PROD: M30, backup, PIT recovery, autoscaling M30→M60, termination protection."),
            provider: zod_1.z.enum(["AWS", "AZURE", "GCP"]).describe("Cloud provider"),
            regions: zod_1.z
                .array(args_js_1.AtlasArgs.region())
                .min(1)
                .max(7)
                .describe("Cloud provider regions in priority order — first entry is the primary region. " +
                "E.g. [\"US_EAST_1\"] for AWS, [\"US_EAST\"] for Azure, [\"EASTERN_US\"] for GCP."),
        };
    }
    async execute({ projectId, clusterName, clusterProfile, provider, regions, }) {
        const profile = PROFILES[clusterProfile];
        const nodeCounts = clusterProfile === "NONPROD" ? nonprodNodeCounts(regions.length) : prodNodeCounts(regions.length);
        const regionConfigs = regions.map((regionName, i) => {
            const config = {
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
        };
        await (0, accessListUtils_js_1.ensureCurrentIpInAccessList)(this.apiClient, projectId);
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
exports.CreateSimpleClusterTool = CreateSimpleClusterTool;
CreateSimpleClusterTool.toolName = "atlas-create-simple-cluster";
CreateSimpleClusterTool.operationType = "create";
//# sourceMappingURL=createSimpleCluster.js.map