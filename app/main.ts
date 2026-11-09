import OpenAI from "openai";
import { tools, read_file, write_file, bash } from "./tools";
import type { BashToolInput, ClientLoopParams, ReadToolInput, WriteToolInput } from "./types";

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
  const messages: OpenAI.ChatCompletionMessageParam[] = [{ role: "user", content: prompt }];

  while (true) {
    const response = await client.chat.completions.create({
      model: "anthropic/claude-haiku-4.5",
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
  if (toolCall.type === "function") {
    const { function: functionCall } = toolCall;
    switch (functionCall.name) {
      case "read":
        const read_args = JSON.parse(functionCall.arguments) as ReadToolInput;
        if (!read_args.file_path) {
          throw new Error("no file_path in function call arguments");
        }
        const file_contents = read_file(read_args.file_path);
        return file_contents;
      case "write":
        const write_args = JSON.parse(toolCall.function.arguments) as WriteToolInput;
        const { file_path, content } = write_args;

        if (!file_path) {
          throw new Error("no file_path in function call arguments");
        }
        if (!content) {
          throw new Error("no content in function call arguments");
        }

        write_file(file_path, content);

        return "File written successfully";
      case "bash":
        const bash_args = JSON.parse(toolCall.function.arguments) as BashToolInput;
        const command = bash_args.command;
        if (!command) {
          throw new Error("no command in function call arguments");
        }
        const bash_output = bash(command);
        return bash_output;
      default:
        throw new Error("whoops what tool call");
    }
  }
}

main();
