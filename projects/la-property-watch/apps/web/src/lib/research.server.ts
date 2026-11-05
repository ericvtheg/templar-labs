import { canAccessResearch, sameOrigin } from "./access.ts";
import { type Bindings, getAuth } from "./auth.server.ts";
import { enqueueRefresh } from "./jobs.ts";
import { dashboardCsv, loadDashboard } from "./repository.ts";

const privateHeaders = {
  "cache-control": "private, no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  vary: "Cookie",
  "x-content-type-options": "nosniff",
};

export async function handleResearch(request: Request, env: Bindings): Promise<Response> {
  const session = await getAuth(request, env).api.getSession({ headers: request.headers });
  if (!session) {
    return json({ error: "Authentication required." }, 401);
  }
  if (!canAccessResearch(session.user)) {
    return json({ error: "Account not authorized." }, 403);
  }
  if (request.method !== "GET" && !sameOrigin(request)) {
    return json({ error: "Cross-origin request rejected." }, 403);
  }
  const pathname = new URL(request.url).pathname;
  try {
    if (request.method === "GET" && pathname === "/api/research/data") {
      return json(await loadDashboard(env.DB));
    }
    if (request.method === "GET" && pathname === "/api/research/export.csv") {
      return new Response(dashboardCsv(await loadDashboard(env.DB)), {
        headers: {
          ...privateHeaders,
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="la-property-watch-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }
    if (request.method === "POST" && pathname === "/api/research/refresh") {
      const contentLength = Number(request.headers.get("content-length") ?? "0");
      if (
        !Number.isFinite(contentLength) ||
        contentLength > 0 ||
        request.headers.has("content-type")
      ) {
        return json({ error: "This action does not accept a request body." }, 400);
      }
      const requested = await enqueueRefresh(env, "manual");
      return json({ job: requested.job, queued: requested.created }, requested.created ? 202 : 200);
    }
    return json({ error: "Not found." }, 404);
  } catch (cause) {
    console.error(
      "LA Property Watch request failed",
      cause instanceof Error ? cause.message : "Unknown failure",
    );
    return json({ error: "The research service could not complete this request." }, 500);
  }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}
