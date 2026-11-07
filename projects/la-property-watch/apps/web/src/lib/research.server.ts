import { canAccessResearch, sameOrigin } from "./access.ts";
import { type Bindings, getAuth } from "./auth.server.ts";
import { enqueueRefresh } from "./jobs.ts";
import {
  currentEvidenceCsv,
  DashboardQueryError,
  loadDashboard,
  loadPropertyDetail,
} from "./repository.ts";

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
      const url = new URL(request.url);
      const signal = url.searchParams.get("signal");
      return json(
        await loadDashboard(env.DB, {
          page: Number(url.searchParams.get("page") ?? "1"),
          pageSize: Number(url.searchParams.get("pageSize") ?? "50"),
          query: url.searchParams.get("query") ?? "",
          jurisdiction: url.searchParams.get("jurisdiction") ?? "all",
          signalType: signal && signal !== "all" ? (signal as never) : "all",
        }),
      );
    }
    if (request.method === "GET" && pathname.startsWith("/api/research/properties/")) {
      const key = decodeURIComponent(pathname.slice("/api/research/properties/".length));
      if (!key || key.length > 300) {
        return json({ error: "Invalid property key." }, 400);
      }
      const url = new URL(request.url);
      const detail = await loadPropertyDetail(
        env.DB,
        key,
        Number(url.searchParams.get("evidencePage") ?? "1"),
        Number(url.searchParams.get("evidencePageSize") ?? "200"),
      );
      return detail ? json(detail) : json({ error: "Property not found." }, 404);
    }
    if (request.method === "GET" && pathname === "/api/research/export.csv") {
      return new Response(await currentEvidenceCsv(env.DB), {
        headers: {
          ...privateHeaders,
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="property-watch-current-${new Date().toISOString().slice(0, 10)}.csv"`,
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
    if (cause instanceof DashboardQueryError) {
      return json({ error: cause.message }, 400);
    }
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
