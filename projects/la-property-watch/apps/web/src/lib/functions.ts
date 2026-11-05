import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { canAccessResearch } from "./access.ts";
import { getAuth, getBindings } from "./auth.server.ts";
import type { LoaderData } from "./model.ts";
import { loadDashboard } from "./repository.ts";

export const loadApp = createServerFn({ method: "GET" }).handler(async (): Promise<LoaderData> => {
  const request = getRequest();
  const bindings = await getBindings();
  const session = await getAuth(request, bindings).api.getSession({ headers: request.headers });
  if (!session) {
    return { mode: "signed_out" };
  }
  if (!canAccessResearch(session.user)) {
    return { mode: "forbidden", email: session.user.email };
  }
  return {
    mode: "ready",
    viewerName: session.user.name,
    ...(await loadDashboard(bindings.DB)),
  };
});
