import { read_file } from "./read_file";
import { write_file } from "./write_file";
import { bash } from "./bash";

const tools = [
    {
        "type": "function",
        "function": {
            "name": "read",
            "description": "Read and return the contents of a file",
            "parameters": {
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "The path to the file to read"
                    }
                },
                "required": ["file_path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write",
            "description": "Write content to a file",
            "parameters": {
                "type": "object",
                "required": ["file_path", "content"],
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "The path of the file to write to"
                    },
                    "content": {
                        "type": "string",
                        "description": "The content to write to the file"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "bash",
            "description": "Execute a shell command",
            "parameters": {
                "type": "object",
                "required": ["command"],
                "properties": {
                    "command": {
                        "type": "string",
                        "description": "The command to execute"
                    }
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "Skill",
            "description": "Load a skill's instructions into the conversation",
            "parameters": {
                "type": "object",
                "required": ["name"],
                "properties": {
                    "name": { "type": "string", "description": "The name of the skill to use" },
                    "args": { "type": "string", "description": "Optional arguments for the skill" }
                }
            }
        }
    }
]

// Advertised only when the LSP client connects (see main.ts), so it is kept out of `tools`.
const lspTool = {
    "type": "function",
    "function": {
        "name": "LSP",
        "description": "Code intelligence from a language server. goToDefinition returns the file, line, and character where a symbol is defined. findReferences returns every location that uses the symbol, including its declaration and aliased imports, so you can see which callers a change would affect. Point at the symbol's position, not its name; line and character both count from 1, as in an editor.",
        "parameters": {
            "type": "object",
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": ["goToDefinition", "findReferences"],
                    "description": "goToDefinition: where the symbol is defined. findReferences: everywhere the symbol is used, including its declaration."
                },
                "filePath": {
                    "type": "string",
                    "description": "Absolute path, or a path relative to the agent's current working directory."
                },
                "line": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "1-based line number of the symbol."
                },
                "character": {
                    "type": "integer",
                    "minimum": 1,
                    "description": "1-based character offset in UTF-16 code units (same as character count for ASCII)."
                }
            },
            "required": ["operation", "filePath", "line", "character"]
        }
    }
}

export { tools, lspTool, read_file, write_file, bash };