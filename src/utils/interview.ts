import { PromptMessage } from "@modelcontextprotocol/sdk/types.js";
import { CoreMessage } from "ai";

export function transformMessages(messages: PromptMessage[]): CoreMessage[] {
    return messages.map((m) => ({
      role: m.role,
      content: [
        {
          type: m.content.type as "text",
          text: m.content.text as string,
        },
      ],
    }));
  }