export function write_file(file_path: string, content: string): void {
    const fs = require("fs");
    fs.writeFileSync(file_path, content, "utf-8");
}