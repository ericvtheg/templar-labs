import { canAccessChina, sameOrigin } from "./access.ts";
import { type Bindings, getAuth } from "./auth.server.ts";
import { handleCoach } from "./coach.server.ts";
import { crew, fieldNotes, groom, missions } from "./curriculum.ts";
import { grade, gradeMatching, nextReview } from "./learning.ts";
import { transcribePractice } from "./transcribe.server.ts";
import type { TripBody } from "./trip-body.ts";
import type { Activity, BoardMember, Mastery, TripData } from "./types.ts";
import { serveSpeech } from "./voice.server.ts";

const privateHeaders = {
  "cache-control": "private, no-store",
  vary: "Cookie",
  "x-content-type-options": "nosniff",
};
export function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: privateHeaders });
}
// Every private request rechecks the allowlist, including existing sessions after a revocation.
export async function handleTrip(request: Request, env: Bindings): Promise<Response> {
  const auth = getAuth(request, env);
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    return json({ error: "Sign in with an invited Google account." }, 401);
  }
  if (!canAccessChina(session.user, env.CREW_EMAILS ?? "")) {
    return json(
      { error: "This Google account is not on the crew list. Ask the groom to add it." },
      403,
    );
  }
  if (request.method !== "GET" && !sameOrigin(request)) {
    return json({ error: "Cross-origin request rejected." }, 403);
  }
  const id = session.user.id;
  const path = new URL(request.url).pathname;
  const db = env.DB;
  if (request.method === "GET" && path === "/api/trip/speech") {
    return serveSpeech(request, env);
  }
  if (request.method === "GET" && path === "/api/trip/state") {
    const profile = await db
      .prepare("SELECT name FROM members WHERE id = ?")
      .bind(id)
      .first<{ name: string }>();
    const [mastery, completed, board, activity] = await Promise.all([
      db
        .prepare("SELECT mission_id, task, level, due FROM mastery WHERE user_id = ?")
        .bind(id)
        .all<Mastery>(),
      db
        .prepare("SELECT mission_id FROM completions WHERE user_id = ?")
        .bind(id)
        .all<{ mission_id: string }>(),
      db
        .prepare(
          "SELECT m.id, m.name, COUNT(c.mission_id) AS completed FROM members m LEFT JOIN completions c ON c.user_id = m.id GROUP BY m.id ORDER BY completed DESC, m.name ASC",
        )
        .all<BoardMember>(),
      db
        .prepare(
          "SELECT c.user_id, m.name, c.mission_id, c.created_at, (SELECT COUNT(*) FROM cheers h WHERE h.target_id = c.user_id AND h.mission_id = c.mission_id) AS cheers, (SELECT COUNT(*) FROM cheers h WHERE h.target_id = c.user_id AND h.mission_id = c.mission_id AND h.user_id = ?) AS cheered FROM completions c JOIN members m ON m.id = c.user_id ORDER BY c.created_at DESC LIMIT 30",
        )
        .bind(id)
        .all<Activity>(),
    ]);
    return json({
      user: { id, name: profile?.name ?? "" },
      groom,
      crew,
      missions,
      fieldNotes,
      mastery: mastery.results,
      completed: completed.results.map((row) => row.mission_id),
      board: board.results,
      activity: activity.results,
    } satisfies TripData);
  }
  if (request.method !== "POST") {
    return json({ error: "Not found." }, 404);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return json({ error: "JSON required." }, 415);
  }
  // Bound the body even when Content-Length is missing or false.
  const reader = request.body?.getReader();
  if (!reader) {
    return json({ error: "Missing body." }, 400);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > (path === "/api/trip/transcribe" ? 850_000 : 4096)) {
      await reader.cancel();
      return json({ error: "Request too large." }, 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let body: TripBody;
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "Invalid request." }, 400);
    }
    body = parsed as TripBody;
  } catch {
    return json({ error: "Invalid JSON." }, 400);
  }

  if (path === "/api/trip/profile") {
    if (
      typeof body.name !== "string" ||
      body.name.trim().length < 1 ||
      body.name.trim().length > 32
    ) {
      return json({ error: "Use a name between 1 and 32 characters." }, 400);
    }
    await db
      .prepare(
        "INSERT INTO members (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name",
      )
      .bind(id, body.name.trim())
      .run();
    return json({ saved: true });
  }
  const member = await db.prepare("SELECT id FROM members WHERE id = ?").bind(id).first();
  if (!member) {
    return json({ error: "Choose your crew name first." }, 400);
  }
  if (path === "/api/trip/coach") {
    return handleCoach(body, env, id);
  }
  if (path === "/api/trip/transcribe") {
    return transcribePractice(body, env, id);
  }
  if (path === "/api/trip/match") {
    body.task = missions.find((item) => item.id === body.missionId)?.phrases.length;
    body.answer = "";
  }
  if (path === "/api/trip/answer" || path === "/api/trip/match") {
    const mission = missions.find((item) => item.id === body.missionId);
    if (
      !mission ||
      typeof body.task !== "number" ||
      !Number.isInteger(body.task) ||
      body.task < 0 ||
      body.task > mission.phrases.length ||
      typeof body.answer !== "string" ||
      body.answer.length > 500
    ) {
      return json({ error: "Invalid exercise." }, 400);
    }
    const correct =
      path === "/api/trip/match"
        ? gradeMatching(mission.id, body.pairs)
        : grade(mission.id, body.task, body.answer);
    const now = Date.now();
    const old = await db
      .prepare("SELECT level, due FROM mastery WHERE user_id = ? AND mission_id = ? AND task = ?")
      .bind(id, mission.id, body.task)
      .first<{ level: number; due: number }>();
    const review = nextReview(old?.level ?? 0, correct, now);
    // Repeats before a review is due cannot farm mastery. A mistake always schedules a retry.
    await db
      .prepare(
        "INSERT INTO mastery (user_id, mission_id, task, level, due) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, mission_id, task) DO UPDATE SET level = excluded.level, due = excluded.due WHERE mastery.due <= ? OR mastery.level = 0 OR ? = 0",
      )
      .bind(id, mission.id, body.task, review.level, review.due, now, correct ? 1 : 0)
      .run();
    // A single conditional INSERT makes first completion idempotent, even across tabs.
    await db
      .prepare(
        "INSERT OR IGNORE INTO completions (user_id, mission_id, created_at) SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM mastery WHERE user_id = ? AND mission_id = ? AND level > 0) = ?",
      )
      .bind(id, mission.id, now, id, mission.id, mission.phrases.length + 1)
      .run();
    const completed = await db
      .prepare("SELECT 1 FROM completions WHERE user_id = ? AND mission_id = ?")
      .bind(id, mission.id)
      .first();
    return json({ correct, completed: completed !== null });
  }
  if (path === "/api/trip/cheer") {
    if (
      typeof body.targetId !== "string" ||
      typeof body.missionId !== "string" ||
      body.targetId === id
    ) {
      return json({ error: "Cheer for someone else, you menace." }, 400);
    }
    await db
      .prepare(
        "INSERT OR IGNORE INTO cheers (user_id, target_id, mission_id) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM completions WHERE user_id = ? AND mission_id = ?)",
      )
      .bind(id, body.targetId, body.missionId, body.targetId, body.missionId)
      .run();
    return json({ saved: true });
  }
  return json({ error: "Not found." }, 404);
}
