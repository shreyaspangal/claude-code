import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import type { LSPClient } from "../lsp_client";
import type { LSPToolInput } from "../types";

// LSP positions count from 0; columns are UTF-16 code units.
interface Position {
    line: number;
    character: number;
}

// One place in one file (LSP `Location`). Definition returns one; references return an array.
interface Location {
    uri: string;
    range: { start: Position; end: Position };
}

// LSP names documents by absolute, percent-encoded file URIs.
// Relative paths resolve against the agent's working directory, like the other tools.
function toUri(filePath: string): string {
    return pathToFileURL(path.resolve(filePath)).href;
}

// The reverse, for results: a path relative to the working directory, ready for `read`.
function toRelativePath(uri: string): string {
    return path.relative(process.cwd(), fileURLToPath(uri));
}

// The server remembers opened documents for the whole connection
// and rejects a second didOpen, so track which URIs it already has.
const openedUris = new Set<string>();

async function ensureOpen(client: LSPClient, filePath: string, uri: string): Promise<void> {
    if (openedUris.has(uri)) return;
    const languageId = client.extensionToLanguage[path.extname(filePath)];
    if (!languageId) throw new Error(`no language configured for ${filePath}`);
    await client.notify("textDocument/didOpen", {
        textDocument: { uri, languageId, version: 1, text: fs.readFileSync(filePath, "utf-8") },
    });
    openedUris.add(uri); // only after notify succeeded: a failed didOpen doesn't count as open
}

// Shared by every operation: make sure the server has the file, then turn the
// model's 1-based position into the params every textDocument/* request starts with.
async function prepare(client: LSPClient, input: LSPToolInput) {
    const { filePath, line, character } = input;
    if (!filePath) throw new Error("no filePath in function call arguments");
    const uri = toUri(filePath);
    await ensureOpen(client, filePath, uri); // must finish before the request
    return {
        textDocument: { uri },
        position: { line: line - 1, character: character - 1 },
    };
}

export async function goToDefinition(client: LSPClient, input: LSPToolInput): Promise<string> {
    const params = await prepare(client, input);
    const location = (await client.request("textDocument/definition", params)) as Location;
    const { start } = location.range;
    return `Defined in ${toRelativePath(location.uri)}:${start.line + 1}:${start.character + 1}`;
}

export async function findReferences(client: LSPClient, input: LSPToolInput): Promise<string> {
    const params = await prepare(client, input);
    // includeDeclaration: also list the definition itself, not only its uses.
    const locations = ((await client.request("textDocument/references", {
        ...params,
        context: { includeDeclaration: true },
    })) ?? []) as Location[]; // the spec allows null as well as []
    if (locations.length === 0) return "No references found";

    // Group by file, keeping the server's order. A Map remembers insertion order,
    // and two hits on the same line stay as two separate entries.
    const byFile = new Map<string, string[]>();
    for (const { uri, range } of locations) {
        const file = toRelativePath(uri);
        const lines = byFile.get(file) ?? [];
        lines.push(`  Line ${range.start.line + 1}:${range.start.character + 1}`);
        byFile.set(file, lines);
    }

    const sections = [...byFile].map(([file, lines]) => `${file}:\n${lines.join("\n")}`);
    return `Found ${locations.length} references across ${byFile.size} files:\n\n${sections.join("\n\n")}`;
}
