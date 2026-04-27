"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreateReplicaSetClusterTool = void 0;
const zod_1 = require("zod");
const atlasTool_js_1 = require("../atlasTool.js");
const accessListUtils_js_1 = require("../../../common/atlas/accessListUtils.js");
const args_js_1 = require("../../args.js");
class CreateReplicaSetClusterTool extends atlasTool_js_1.AtlasToolBase {
    constructor() {
        super(...arguments);
        this.description = "Create a dedicated MongoDB Atlas replica set cluster (M10+).";
        this.argsShape = {
            projectId: args_js_1.AtlasArgs.projectId().describe("Atlas project ID to create the cluster in"),
            name: args_js_1.AtlasArgs.clusterName().describe("Name of the cluster"),
            region: args_js_1.AtlasArgs.region().describe("AWS region of the cluster").default("US_EAST_1"),
            instanceSize: zod_1.z.enum(["M10", "M20", "M30", "M40"]).describe("Dedicated instance size").default("M10"),
        };
    }
    async execute({ projectId, name, region, instanceSize, }) {
        const input = {
            groupId: projectId,
            name,
            clusterType: "REPLICASET",
            replicationSpecs: [
                {
                    zoneName: "Zone 1",
                    regionConfigs: [
                        {
                            providerName: "AWS",
                            regionName: region,
                            priority: 7,
                            electableSpecs: {
                                instanceSize,
                                nodeCount: 3,
                            },
                        },
                    ],
                },
            ],
            terminationProtectionEnabled: false,
        };
        await (0, accessListUtils_js_1.ensureCurrentIpInAccessList)(this.apiClient, projectId);
        await this.apiClient.createCluster({
            params: {
                path: {
                    groupId: projectId,
                },
            },
            body: input,
        });
        return {
            content: [
                {
                    type: "text",
                    text: `Replica set cluster "${name}" (${instanceSize}) has been requested in region "${region}".`,
                },
                { type: "text", text: `Double check your access lists to enable your current IP.` },
            ],
        };
    }
}
exports.CreateReplicaSetClusterTool = CreateReplicaSetClusterTool;
CreateReplicaSetClusterTool.toolName = "atlas-create-replica-set-cluster";
CreateReplicaSetClusterTool.operationType = "create";
//# sourceMappingURL=createReplicaSetCluster.js.map