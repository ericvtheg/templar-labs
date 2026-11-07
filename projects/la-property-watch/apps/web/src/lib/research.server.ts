import { canAccessResearch, sameOrigin } from "./access.ts";
import { type Bindings, getAuth } from "./auth.server.ts";
import {
  createPropertyAssessment,
  DecisionConflictError,
  DecisionValidationError,
  type FeedbackInput,
  recheckSelectedProperty,
  updateQualificationOverride,
  updateRankingProfile,
  upsertPropertyFeedback,
} from "./decision-support.server.ts";
import { enqueueRefresh } from "./jobs.ts";
import {
  addPropertyNote,
  addValueAssumption,
  type BuyBoxInput,
  loadDealBrief,
  loadPartnerWorkspace,
  markAlertsRead,
  PartnerConflictError,
  PartnerValidationError,
  type PipelinePatch,
  selectedEvidenceCsv,
  updateAlertPreferences,
  updatePipelineProperty,
  upsertBuyBox,
} from "./partner.server.ts";
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
          buyBoxId: url.searchParams.get("buyBoxId"),
          fit: (url.searchParams.get("fit") ?? "all") as never,
          qualification: (url.searchParams.get("qualification") ?? "all") as never,
          sort: (url.searchParams.get("sort") ?? "distress") as never,
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
    if (request.method === "GET" && pathname === "/api/research/workspace") {
      const url = new URL(request.url);
      return json(
        await loadPartnerWorkspace(env.DB, session.user.email, new Date(), {
          activityPage: queryInteger(url, "activityPage", 1),
          activityPageSize: queryInteger(url, "activityPageSize", 200),
          alertPage: queryInteger(url, "alertPage", 1),
          alertPageSize: queryInteger(url, "alertPageSize", 200),
        }),
      );
    }
    if (request.method === "GET" && pathname.startsWith("/api/research/deal-briefs/")) {
      const key = decodeURIComponent(pathname.slice("/api/research/deal-briefs/".length));
      const buyBoxId = new URL(request.url).searchParams.get("buyBoxId");
      const brief = await loadDealBrief(
        env.DB,
        key,
        buyBoxId,
        queryInteger(new URL(request.url), "evidencePage", 1),
        queryInteger(new URL(request.url), "evidencePageSize", 200),
      );
      return brief ? json(brief) : json({ error: "Property not found." }, 404);
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
    if (request.method === "POST" && pathname.startsWith("/api/research/pipeline/")) {
      const key = decodeURIComponent(pathname.slice("/api/research/pipeline/".length));
      const body = await jsonBody(request);
      exactKeys(body, ["expectedVersion", "patch"]);
      if (!Number.isInteger(body["expectedVersion"]) || !isObject(body["patch"])) {
        throw new PartnerValidationError("Pipeline request is invalid.");
      }
      return json(
        await updatePipelineProperty(
          env.DB,
          session.user.email,
          key,
          body["expectedVersion"] as number,
          body["patch"] as PipelinePatch,
        ),
      );
    }
    if (request.method === "POST" && pathname.startsWith("/api/research/assessments/")) {
      const key = decodeURIComponent(pathname.slice("/api/research/assessments/".length));
      const body = await jsonBody(request);
      exactKeys(body, []);
      return json(await createPropertyAssessment(env.DB, session.user.email, key), 201);
    }
    if (request.method === "POST" && pathname.startsWith("/api/research/rechecks/")) {
      const key = decodeURIComponent(pathname.slice("/api/research/rechecks/".length));
      const body = await jsonBody(request);
      exactKeys(body, []);
      return json(await recheckSelectedProperty(env.DB, session.user.email, key));
    }
    if (
      request.method === "POST" &&
      pathname.startsWith("/api/research/qualification-overrides/")
    ) {
      const key = decodeURIComponent(
        pathname.slice("/api/research/qualification-overrides/".length),
      );
      const body = await jsonBody(request);
      exactKeys(body, ["expectedVersion", "action", "reason"]);
      if (
        !Number.isInteger(body["expectedVersion"]) ||
        typeof body["action"] !== "string" ||
        typeof body["reason"] !== "string"
      ) {
        throw new DecisionValidationError("Qualification override request is invalid.");
      }
      return json(
        await updateQualificationOverride(env.DB, session.user.email, key, {
          expectedVersion: body["expectedVersion"] as number,
          action: body["action"] as never,
          reason: body["reason"],
        }),
      );
    }
    if (request.method === "POST" && pathname.startsWith("/api/research/feedback/")) {
      const key = decodeURIComponent(pathname.slice("/api/research/feedback/".length));
      const body = await jsonBody(request);
      exactKeys(body, [
        "expectedVersion",
        "usefulness",
        "verification",
        "interest",
        "outcome",
        "researchMinutes",
        "reason",
      ]);
      if (
        !Number.isInteger(body["expectedVersion"]) ||
        typeof body["usefulness"] !== "string" ||
        typeof body["verification"] !== "string" ||
        typeof body["interest"] !== "string" ||
        typeof body["outcome"] !== "string" ||
        (body["researchMinutes"] !== null && !Number.isInteger(body["researchMinutes"])) ||
        typeof body["reason"] !== "string"
      ) {
        throw new DecisionValidationError("Feedback request is invalid.");
      }
      return json(
        await upsertPropertyFeedback(env.DB, session.user.email, key, body as FeedbackInput),
      );
    }
    if (request.method === "POST" && pathname === "/api/research/ranking-profile") {
      const body = await jsonBody(request);
      exactKeys(body, [
        "expectedVersion",
        "enabled",
        "minimumSamples",
        "maximumAdjustment",
        "reason",
      ]);
      if (
        !Number.isInteger(body["expectedVersion"]) ||
        typeof body["enabled"] !== "boolean" ||
        !Number.isInteger(body["minimumSamples"]) ||
        !Number.isInteger(body["maximumAdjustment"]) ||
        typeof body["reason"] !== "string"
      ) {
        throw new DecisionValidationError("Ranking profile request is invalid.");
      }
      return json(
        await updateRankingProfile(env.DB, session.user.email, {
          expectedVersion: body["expectedVersion"] as number,
          enabled: body["enabled"],
          minimumSamples: body["minimumSamples"] as number,
          maximumAdjustment: body["maximumAdjustment"] as number,
          reason: body["reason"],
        }),
      );
    }
    if (request.method === "POST" && pathname.startsWith("/api/research/notes/")) {
      const key = decodeURIComponent(pathname.slice("/api/research/notes/".length));
      const body = await jsonBody(request);
      exactKeys(body, ["body"]);
      if (typeof body["body"] !== "string") {
        throw new PartnerValidationError("Note body must be text.");
      }
      return json(await addPropertyNote(env.DB, session.user.email, key, body["body"]), 201);
    }
    if (request.method === "POST" && pathname.startsWith("/api/research/value-assumptions/")) {
      const key = decodeURIComponent(pathname.slice("/api/research/value-assumptions/".length));
      const body = await jsonBody(request);
      exactKeys(body, ["label", "valueCents", "asOfDate"]);
      if (
        typeof body["label"] !== "string" ||
        typeof body["asOfDate"] !== "string" ||
        !Number.isSafeInteger(body["valueCents"])
      ) {
        throw new PartnerValidationError("Value assumption request is invalid.");
      }
      return json(
        await addValueAssumption(
          env.DB,
          session.user.email,
          key,
          body as { label: string; valueCents: number; asOfDate: string },
        ),
        201,
      );
    }
    if (request.method === "POST" && pathname === "/api/research/buy-boxes") {
      const body = await jsonBody(request);
      const parsed = parseBuyBox(body);
      return json(await upsertBuyBox(env.DB, session.user.email, parsed), parsed.id ? 200 : 201);
    }
    if (request.method === "POST" && pathname === "/api/research/alert-preferences") {
      const body = await jsonBody(request);
      exactKeys(body, ["newActivity", "worseningActivity", "dueFollowUps"], ["expectedVersion"]);
      if (
        [body["newActivity"], body["worseningActivity"], body["dueFollowUps"]].some(
          (value) => typeof value !== "boolean",
        )
      ) {
        throw new PartnerValidationError("Alert preferences must be booleans.");
      }
      if (
        body["expectedVersion"] !== undefined &&
        (!Number.isInteger(body["expectedVersion"]) || Number(body["expectedVersion"]) < 0)
      ) {
        throw new PartnerValidationError("Alert preference version is invalid.");
      }
      return json(
        await updateAlertPreferences(
          env.DB,
          session.user.email,
          body as {
            newActivity: boolean;
            worseningActivity: boolean;
            dueFollowUps: boolean;
            expectedVersion?: number;
          },
        ),
      );
    }
    if (request.method === "POST" && pathname === "/api/research/alerts/read") {
      const body = await jsonBody(request);
      exactKeys(body, ["ids"]);
      if (!Array.isArray(body["ids"]) || body["ids"].some((id) => typeof id !== "string")) {
        throw new PartnerValidationError("Alert IDs must be a list of text values.");
      }
      await markAlertsRead(env.DB, session.user.email, body["ids"] as string[]);
      return json({ ok: true });
    }
    if (request.method === "POST" && pathname === "/api/research/export-selected.csv") {
      const body = await jsonBody(request);
      exactKeys(body, ["propertyKeys"]);
      if (
        !Array.isArray(body["propertyKeys"]) ||
        body["propertyKeys"].some((key) => typeof key !== "string")
      ) {
        throw new PartnerValidationError("Property keys must be a list of text values.");
      }
      return new Response(await selectedEvidenceCsv(env.DB, body["propertyKeys"] as string[]), {
        headers: {
          ...privateHeaders,
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="property-watch-selected-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }
    return json({ error: "Not found." }, 404);
  } catch (cause) {
    if (cause instanceof DashboardQueryError) {
      return json({ error: cause.message }, 400);
    }
    if (cause instanceof PartnerValidationError) {
      return json({ error: cause.message }, 400);
    }
    if (cause instanceof PartnerConflictError) {
      return json({ error: cause.message, code: "version_conflict" }, 409);
    }
    if (cause instanceof DecisionValidationError) {
      return json({ error: cause.message }, 400);
    }
    if (cause instanceof DecisionConflictError) {
      return json({ error: cause.message, code: "version_conflict" }, 409);
    }
    console.error(
      "LA Property Watch request failed",
      cause instanceof Error ? cause.message : "Unknown failure",
    );
    return json({ error: "The research service could not complete this request." }, 500);
  }
}

async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type") ?? "";
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new PartnerValidationError("This action requires a JSON body.");
  }
  if (!Number.isFinite(declaredLength) || declaredLength > 100_000) {
    throw new PartnerValidationError("Request body is too large.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > 100_000) {
    throw new PartnerValidationError("Request body is too large.");
  }
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new PartnerValidationError("Request body is not valid JSON.");
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  optional: readonly string[] = [],
) {
  const actual = Object.keys(value).toSorted();
  const allowed = new Set([...expected, ...optional]);
  if (expected.some((key) => !(key in value)) || actual.some((key) => !allowed.has(key))) {
    throw new PartnerValidationError("Request body fields are invalid.");
  }
}

function queryInteger(url: URL, name: string, fallback: number) {
  const raw = url.searchParams.get(name);
  if (raw === null) {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    throw new PartnerValidationError(`${name} must be a positive integer.`);
  }
  return Number(raw);
}

function parseBuyBox(body: Record<string, unknown>): BuyBoxInput {
  exactKeys(body, [
    "id",
    "expectedVersion",
    "name",
    "propertyTypes",
    "jurisdictions",
    "neighborhoods",
    "zips",
    "sizeBasis",
    "minSizeValue",
    "maxSizeValue",
    "minValueCents",
    "maxValueCents",
    "valueBasis",
    "valueAssumptionLabel",
    "distressPhases",
  ]);
  const stringArrays = [
    body["propertyTypes"],
    body["jurisdictions"],
    body["neighborhoods"],
    body["zips"],
    body["distressPhases"],
  ];
  if (
    typeof body["name"] !== "string" ||
    !Number.isInteger(body["expectedVersion"]) ||
    stringArrays.some(
      (value) => !Array.isArray(value) || value.some((entry) => typeof entry !== "string"),
    )
  ) {
    throw new PartnerValidationError("Buy box request is invalid.");
  }
  if (body["id"] !== null && typeof body["id"] !== "string") {
    throw new PartnerValidationError("Buy box ID is invalid.");
  }
  if (typeof body["sizeBasis"] !== "string" || typeof body["valueBasis"] !== "string") {
    throw new PartnerValidationError("Buy box basis is invalid.");
  }
  if (body["valueAssumptionLabel"] !== null && typeof body["valueAssumptionLabel"] !== "string") {
    throw new PartnerValidationError("Assumption label is invalid.");
  }
  for (const field of ["minSizeValue", "maxSizeValue", "minValueCents", "maxValueCents"] as const) {
    if (body[field] !== null && !Number.isSafeInteger(body[field])) {
      throw new PartnerValidationError("Buy box ranges must be whole numbers or null.");
    }
  }
  return body as unknown as BuyBoxInput;
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: privateHeaders });
}
