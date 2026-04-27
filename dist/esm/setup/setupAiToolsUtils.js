import os from "os";
export const getPlatform = () => {
    switch (os.platform()) {
        case "win32":
            return "windows";
        case "darwin":
            return "mac";
        case "linux":
            return "linux";
        default:
            return null;
    }
};
export const formatError = (error) => (error instanceof Error ? error.message : String(error));
//# sourceMappingURL=setupAiToolsUtils.js.map