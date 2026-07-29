import { Effect } from "effect";
import { makeExaWebSearch } from "../src/index.ts";

// biome-ignore lint/style/noProcessEnv: This opt-in CLI entry point owns environment configuration.
const environment = process.env as NodeJS.ProcessEnv & { readonly EXA_API_KEY?: string };
const apiKey = environment.EXA_API_KEY;
if (apiKey === undefined) {
  throw new Error("Set EXA_API_KEY before running the live smoke test.");
}

const service = makeExaWebSearch({ apiKey });
const result = await Effect.runPromise(
  service.search({
    query: "official Exa API documentation",
    numResults: 2,
    mode: "auto",
    contents: { highlights: true },
  }),
);

console.log(
  JSON.stringify(
    { requestId: result.requestId, costUsd: result.costUsd, results: result.results },
    null,
    2,
  ),
);
