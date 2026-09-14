export async function takePracticeBudget(
  db: D1Database,
  userId: string,
  kind: "coach" | "transcribe",
  limit: number,
): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 3_600_000);
  await db
    .prepare("DELETE FROM ai_usage WHERE bucket < ?")
    .bind(bucket - 2)
    .run();
  const row = await db
    .prepare(
      "INSERT INTO ai_usage (user_id, kind, bucket, count) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, kind, bucket) DO UPDATE SET count = ai_usage.count + 1 WHERE ai_usage.count < ? RETURNING count",
    )
    .bind(userId, kind, bucket, limit)
    .first();
  return row !== null;
}
