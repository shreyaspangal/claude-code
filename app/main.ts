import OpenAI from "openai";
import { tools, read_file, write_file, bash } from "./tools";
import type { BashToolInput, ClientLoopParams, ReadToolInput, WriteToolInput } from "./types";
import { expandPrompt, initializeSkills } from "./utils/skills";

async function main() {
  const { client, prompt } = await createClient();
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

  const modelId = process.env.MODEL_ID ?? 'anthropic/claude-haiku-4.5';

  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: await initializeSkills() },
    ...userMessages,
  ];

  while (true) {
    const response = await client.chat.completions.create({
      model: modelId,
      messages: messages,
      tools: tools as OpenAI.ChatCompletionTool[],
    });

    if (!response.choices || response.choices.length === 0) {
      throw new Error("no choices in response");
    }

    const { message } = response.choices[0];

    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log(message.content);
      break;
    }

    for (const tool_call of message.tool_calls) {
      const toolResponse = await executeTool(tool_call);
      messages.push({
        role: "tool",
        tool_call_id: tool_call.id,
        content: toolResponse,
      } as OpenAI.ChatCompletionToolMessageParam);
    }
  }
}

async function executeTool(toolCall: OpenAI.ChatCompletionMessageToolCall) {
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
      if (!content) throw new Error("no content in function call arguments");
      write_file(file_path, content);
      return "File written successfully";
    }
    case "bash": {
      const { command } = args as BashToolInput;
      if (!command) throw new Error("no command in function call arguments");
      return bash(command);
    }
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

main();
