import OpenAI from "openai";
import { read_file } from "./tools/read_file";

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

  const response = await client.chat.completions.create({
    model: "anthropic/claude-haiku-4.5",
    messages: [{ role: "user", content: prompt }],
    tools: [
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
      }
    ]
  });

  if (!response.choices || response.choices.length === 0) {
    throw new Error("no choices in response");
  }

  const toolCalls = response.choices[0].message?.tool_calls;
  if (toolCalls && toolCalls.length > 0) {
    for (const toolCall of toolCalls) {
      if (toolCall.function.name === "read") {
        const file_path = toolCall.function.arguments?.file_path;
        if (!file_path) {
          throw new Error("no file_path in function call arguments");
        }
        const file_contents = read_file(file_path);
        console.log(`File contents: ${file_contents}`);
      }
    }
  } else {
    console.log(response.choices[0].message.content);
  }

  // You can use print statements as follows for debugging, they'll be visible when running tests.
  // console.error("Logs from your program will appear here!");

  // TODO: Uncomment the lines below to pass the first stage
  // console.log(response.choices[0].message.content);
}

main();
