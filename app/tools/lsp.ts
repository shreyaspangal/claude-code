import fs from "fs";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import type { LSPClient } from "../lsp_client";
import type { LSPToolInput } from "../types";

// What textDocument/definition returns for a single match (LSP `Location`).
interface Location {
    uri: string;
    range: { start: { line: number; character: number }; end: { line: number; character: number } };
}

// Step 1: LSP names documents by absolute, percent-encoded file URIs.
// Relative paths resolve against the agent's working directory, like the other tools.
function toUri(filePath: string): string {
    return pathToFileURL(path.resolve(filePath)).href;
}

// Step 2: the server remembers opened documents for the whole connection
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

export async function goToDefinition(client: LSPClient, input: LSPToolInput): Promise<string> {
    const { filePath, line, character } = input;
    if (!filePath) throw new Error("no filePath in function call arguments");
    const uri = toUri(filePath);
    await ensureOpen(client, filePath, uri); // must finish before the request

    // Step 3: the model counts from 1, LSP counts from 0 (both in UTF-16 code units).
    const location = (await client.request("textDocument/definition", {
        textDocument: { uri },
        position: { line: line - 1, character: character - 1 },
    })) as Location;

    // Step 4: back to the model's view: a relative path and 1-based start position.
    const defPath = path.relative(process.cwd(), fileURLToPath(location.uri));
    const { start } = location.range;
    return `Defined in ${defPath}:${start.line + 1}:${start.character + 1}`;
}
