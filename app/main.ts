import OpenAI from "openai";
import { tools, lspTool, read_file, write_file, bash } from "./tools";
import type { BashToolInput, ClientLoopParams, LSPToolInput, ReadToolInput, SkillToolInput, WriteToolInput } from "./types";
import { expandPrompt, initializeSkills, loadSkill } from "./utils/skills";
import { LSPClient } from "./lsp_client";
import { goToDefinition } from "./tools/lsp";

// Set once in main() before the first model request; null when CODECRAFTERS_LSP_URL is unset.
// Kept for the whole run so the LSP tool handler can reach the server.
let lspClient: LSPClient | null = null;

async function main() {
  const { client, prompt } = await createClient();
  lspClient = await LSPClient.fromEnvironment();
  if (lspClient) console.error("LSP client connected"); // stderr: stdout is only the model's answer
  await clientLoop({ client, prompt });
}

async function createClient(): Promise<ClientLoopParams> {
  const [, , flag, prompt] = process.argv;
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseURL =
    process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  if (flag !== "-p" || !prompt) {
    throw new Error("error: -p flag is required");
  }

  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
  });

  return { client, prompt };
}

async function clientLoop({ client, prompt }: ClientLoopParams) {
  const userMessages = (await expandPrompt(prompt))
    .map((content) => ({ role: "user" as const, content }));

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: await initializeSkills() },
    ...userMessages,
  ];

  console.log(await runAgent(client, messages));
}

// The agent loop: ask the model, run any tools it calls, repeat until it answers without tools.
// Returns that final answer. Used for the main conversation and, later, for subagents.
async function runAgent(client: OpenAI, messages: OpenAI.ChatCompletionMessageParam[]): Promise<string> {
  const modelId = process.env.MODEL_ID ?? 'anthropic/claude-haiku-4.5';
  const activeTools = lspClient ? [...tools, lspTool] : tools;

  while (true) {
    const response = await client.chat.completions.create({
      model: modelId,
      messages: messages,
      tools: activeTools as OpenAI.ChatCompletionTool[],
    });

    if (!response.choices || response.choices.length === 0) {
      throw new Error("no choices in response");
    }

    const { message } = response.choices[0];

    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      return message.content ?? "";
    }

    for (const tool_call of message.tool_calls) {
      // A failing tool (e.g. reading a directory) goes back to the model as text instead of crashing.
      let toolResponse;
      try {
        toolResponse = await executeTool(client, tool_call);
      } catch (e) {
        toolResponse = `Error: ${(e as Error).message}`;
      }
      messages.push({
        role: "tool",
        tool_call_id: tool_call.id,
        content: toolResponse,
      } as OpenAI.ChatCompletionToolMessageParam);
    }
  }
}

async function executeTool(client: OpenAI, toolCall: OpenAI.ChatCompletionMessageToolCall) {
  if (toolCall.type !== "function") return;

  const { name, arguments: rawArgs } = toolCall.function;
  const args = JSON.parse(rawArgs); // parsed once; each case picks its own fields

  switch (name) {
    case "read": {
      const { file_path } = args as ReadToolInput;
      if (!file_path) throw new Error("no file_path in function call arguments");
      return read_file(file_path);
    }
    case "write": {
      const { file_path, content } = args as WriteToolInput;
      if (!file_path) throw new Error("no file_path in function call arguments");
      if (content === undefined) throw new Error("no content in function call arguments"); // "" is a valid (empty) file
      write_file(file_path, content);
      return "File written successfully";
    }
    case "bash": {
      const { command } = args as BashToolInput;
      if (!command) throw new Error("no command in function call arguments");
      return bash(command);
    }
    case "Skill": {
      const { name: skillName, args: skillArgs } = args as SkillToolInput;
      if (!skillName) throw new Error("no name in function call arguments");
      const skill = await loadSkill(skillName, skillArgs);
      if (!skill) throw new Error(`unknown skill: ${skillName}`);
      if (!skill.fork) return skill.text;
      // context: fork — a subagent: the same loop over a fresh conversation holding only the skill.
      const answer = await runAgent(client, [{ role: "user", content: skill.text }]);
      return `Skill ${skillName} ran in a separate context and returned: ${answer}`;
    }
    case "LSP": {
      if (!lspClient) throw new Error("LSP is not configured");
      const input = args as LSPToolInput;
      if (input.operation !== "goToDefinition") throw new Error(`unsupported LSP operation: ${input.operation}`);
      return goToDefinition(lspClient, input);
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

main();
