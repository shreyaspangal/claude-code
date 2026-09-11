import { execSync } from "child_process";

export function bash(command: string): string {
    try {
        const output = execSync(command, { encoding: "utf-8", stdio: ['ignore', 'pipe', 'pipe'] });
        return output;
    } catch (error) {
        let errorMessage = "Error executing command";

        if (error instanceof Error && 'stderr' in error) {
            errorMessage += `\n\nSTDERR: ${error.stderr}`;
        }
        if (error instanceof Error && 'stdout' in error) {
            errorMessage += `\n\nSTDOUT: ${error.stdout}`;
        }
        if ((error instanceof Error && !('stderr' in error) && !('stdout' in error)) || !(error instanceof Error)) {
            errorMessage += `: ${error}`;
        }

        return errorMessage;
    }
}