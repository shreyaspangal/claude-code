import OpenAI from "openai";
import { tools, read_file, write_file, bash } from "./tools";

async function main() {
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

    messages.push({
      role: "assistant",
      content: response.choices[0].message.content ?? '',
      tool_calls: response.choices[0].message?.tool_calls ?? []
    });

    const toolCalls = response.choices[0].message?.tool_calls;

    if (!toolCalls || toolCalls.length === 0) {
      console.log(response.choices[0].message.content);
      break;
    }

    for (const toolCall of toolCalls) {
      if (toolCall.type === "function" && toolCall.function.name === "read") {
        const args = JSON.parse(toolCall.function.arguments) as {
          file_path?: string;
        };
        const file_path = args.file_path;
        if (!file_path) {
          throw new Error("no file_path in function call arguments");
        }
        const file_contents = read_file(file_path);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: file_contents
        });
      }

      if (toolCall.type === "function" && toolCall.function.name === "write") {
        const args = JSON.parse(toolCall.function.arguments) as {
          file_path?: string;
          content?: string;
        };
        const { file_path, content } = args;

        if (!file_path) {
          throw new Error("no file_path in function call arguments");
        }
        if (!content) {
          throw new Error("no content in function call arguments");
        }

        write_file(file_path, content);

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: "File written successfully"
        });
      }

      if (toolCall.type === "function" && toolCall.function.name === "bash") {
        const args = JSON.parse(toolCall.function.arguments) as {
          command?: string;
        };
        const command = args.command;
        if (!command) {
          throw new Error("no command in function call arguments");
        }
        const bash_output = bash(command);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: bash_output
        });
      }
    }
  }
}

main();
