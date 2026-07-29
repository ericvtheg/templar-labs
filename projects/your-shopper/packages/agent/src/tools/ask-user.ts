import { type AgentTool, suspendAgent } from "@templar/agent";
import { Effect } from "effect";
import { z } from "zod";

export const askUserToolSchema = z.object({
  question: z.string(),
  reason: z.string().optional(),
});

export function makeAskUserTool(): AgentTool {
  return {
    name: "ask_user",
    description:
      "Pause and ask one focused question only when the answer can materially change the research or recommendation.",
    schema: askUserToolSchema,
    execute: (rawInput) => {
      const input = rawInput as z.output<typeof askUserToolSchema>;
      return Effect.succeed(
        suspendAgent({
          question: input.question,
          ...(input.reason === undefined ? {} : { reason: input.reason }),
        }),
      );
    },
  };
}
