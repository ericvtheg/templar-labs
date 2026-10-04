import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { Effect } from "effect";
import { getAuth, getBindings } from "./auth.server.ts";
import { createDemo } from "./demo.ts";
import { utcDate } from "./model.ts";
import { makeRepository, readInvite } from "./repository.ts";
import { challengeInput, inviteInput, profileInput, usageInput } from "./validation.ts";

// Expected failures are returned as data; do not leak provider errors or session details.
async function mutation(run: () => Promise<void>) {
  try {
    await run();
    return { ok: true as const, error: "" };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "";
    const safe = ["Choose a date", "This invitation", "This circle", "You have reached"].some(
      (prefix) => message.startsWith(prefix),
    );
    return {
      ok: false as const,
      error: safe ? message : "We couldn’t save that. Please sign in and try again.",
    };
  }
}

async function authenticatedRepository() {
  const request = getRequest();
  const origin = request.headers.get("origin");
  if (request.method === "POST" && origin !== new URL(request.url).origin) {
    throw new Error("Invalid request origin.");
  }
  const app = await getAuth(request);
  const user = await Effect.runPromise(app.auth.requireUser(request));
  const bindings = await getBindings();
  return makeRepository(bindings.DB, { id: user.id, name: user.name }, utcDate());
}

export const loadDashboard = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const app = await getAuth(request);
  const session = await app.api.getSession({ headers: request.headers });
  if (!session) {
    return createDemo();
  }
  const bindings = await getBindings();
  return makeRepository(bindings.DB, session.user, utcDate()).dashboard();
});

export const saveUsage = createServerFn({ method: "POST" })
  .inputValidator(usageInput)
  .handler(({ data }) => mutation(async () => (await authenticatedRepository()).log(data)));

export const createChallenge = createServerFn({ method: "POST" })
  .inputValidator(challengeInput)
  .handler(({ data }) => mutation(async () => (await authenticatedRepository()).create(data)));

export const saveProfile = createServerFn({ method: "POST" })
  .inputValidator(profileInput)
  .handler(({ data }) =>
    mutation(async () => (await authenticatedRepository()).updateProfile(data)),
  );

export const loadInvite = createServerFn({ method: "GET" })
  .inputValidator(inviteInput)
  .handler(async ({ data }) => {
    const request = getRequest();
    const bindings = await getBindings();
    const session = await (await getAuth(request)).api.getSession({ headers: request.headers });
    return {
      invite: await readInvite(bindings.DB, data.token),
      signedIn: session !== null,
      today: utcDate(),
    };
  });

export const joinChallenge = createServerFn({ method: "POST" })
  .inputValidator(inviteInput)
  .handler(({ data }) => mutation(async () => (await authenticatedRepository()).join(data.token)));
