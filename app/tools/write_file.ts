import fs from "fs";

export function write_file(file_path: string, content: string): void {
    return fs.writeFileSync(file_path, content, "utf-8");
}