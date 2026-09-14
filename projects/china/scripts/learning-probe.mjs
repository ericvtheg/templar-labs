// Explicit opt-in production smoke test. Uses only a generated hello clip, never a user's recording.
export async function probeLearning({ origin, session, profileReady, deleteScene }) {
  const checks = {};
  const phrase = new URLSearchParams({ text: "你好。", speed: "normal" });
  const getAudio = (query, cookie = session) =>
    fetch(`${origin}/api/trip/speech?${query}`, {
      headers: { cookie },
      redirect: "manual",
      signal: AbortSignal.timeout(40_000),
    });
  const normal = await getAudio(phrase);
  const bytes = await normal.arrayBuffer();
  checks.normalAudioStatus = normal.status;
  checks.normalAudioBytes = bytes.byteLength;
  if (
    normal.status !== 200 ||
    !normal.headers.get("content-type")?.includes("audio/mpeg") ||
    bytes.byteLength < 100
  ) {
    throw new Error(`Production audio failed: HTTP ${normal.status}`);
  }
  const replay = await getAudio(phrase);
  checks.replayCache = replay.headers.get("x-china-audio-cache");
  await replay.body?.cancel();
  if (replay.status !== 200 || checks.replayCache !== "HIT") {
    throw new Error("Production speech did not use its cache.");
  }
  const range = await fetch(`${origin}/api/trip/speech?${phrase}`, {
    headers: { cookie: session, range: "bytes=0-1" },
    signal: AbortSignal.timeout(20_000),
  });
  checks.rangeStatus = range.status;
  if (range.status !== 206 || (await range.arrayBuffer()).byteLength !== 2) {
    throw new Error("Production audio byte ranges failed.");
  }
  phrase.set("speed", "slow");
  const slow = await getAudio(phrase);
  checks.slowAudioStatus = slow.status;
  await slow.body?.cancel();
  if (slow.status !== 200) {
    throw new Error(`Slow speech failed: HTTP ${slow.status}`);
  }
  const guest = await getAudio(phrase, "");
  checks.signedOutAudioStatus = guest.status;
  await guest.body?.cancel();
  if (guest.status !== 401) {
    throw new Error("Cached audio was accessible without sign-in.");
  }
  if (!profileReady) {
    throw new Error(
      "Owner has no crew profile; cannot test coach/transcription without changing their data.",
    );
  }
  async function post(path, body) {
    const response = await fetch(`${origin}/api/trip/${path}`, {
      method: "POST",
      headers: { cookie: session, origin, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`Production ${path} failed: HTTP ${response.status}`);
    }
    return response.json();
  }
  const transcript = await post("transcribe", {
    missionId: "basics",
    contentType: "audio/mpeg",
    audioBase64: Buffer.from(bytes).toString("base64"),
  });
  checks.chineseTranscriptRecognized =
    typeof transcript.text === "string" && transcript.text.includes("你好");
  if (!checks.chineseTranscriptRecognized) {
    throw new Error("Production transcription did not recognize the generated hello clip.");
  }
  const scene = await post("coach", { action: "start", missionId: "basics", focus: 0 });
  try {
    checks.sceneSource = scene.source;
    if (scene.source !== "ai" || !scene.id) {
      throw new Error("Production coach fell back instead of reaching the LLM.");
    }
    const feedback = await post("coach", {
      action: "answer",
      missionId: "basics",
      sceneId: scene.id,
      answer: "ni hao",
    });
    checks.feedbackSource = feedback.source;
    checks.correctAnswerAccepted = feedback.correct === true;
    if (feedback.source !== "ai" || feedback.correct !== true) {
      throw new Error("Production AI feedback did not accept hello.");
    }
  } finally {
    if (scene.id) {
      await deleteScene(scene.id);
    }
  }
  console.log(JSON.stringify({ learningProbe: checks }));
}
