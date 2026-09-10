import fs from "fs";

export function read_file(file_path: string): string {
    return fs.readFileSync(file_path, "utf-8");
}