import { useCallback, useEffect, useId, useState } from "react";
import type { Mission } from "../lib/curriculum.ts";
import type { AnswerResult, TripData } from "../lib/types.ts";
import { ChinaFlag } from "./ChinaFlag.tsx";
import { HelloPrimer } from "./HelloPrimer.tsx";
import { MissionExperience } from "./MissionExperience.tsx";
import { VoicePractice } from "./VoicePractice.tsx";

type Tab = "missions" | "review" | "crew" | "field";
class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/trip/${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new ApiError(data.error ?? "Something went wrong. Try again.", response.status);
  }
  return data;
}
function Skyline() {
  return (
    <svg className="skyline" viewBox="0 0 600 330" fill="none" aria-hidden="true">
      <circle cx="426" cy="114" r="83" fill="#edb987" />
      <path
        d="M0 260 92 171 143 209 241 120 330 196 390 163 494 229 600 174V330H0Z"
        fill="#d77c62"
      />
      <path d="m0 302 93-60 71 29 104-80 66 46 86-39 180 101v31H0Z" fill="#b34a3e" />
      <path
        d="M61 304v-25l46-15 30 10 55-34 15 15 56-37 28 25 41-18 22 20 43-16 58 41 43-2 64 33"
        stroke="#f9e7c7"
        strokeWidth="12"
      />
      <path
        d="M61 293v-25m46 9v-24m29 37v-27m57-14v-24m17 43v-28m51-12v-24m28 48v-24m44 10v-27m23 39v-24m42 9v-24m58 65v-26m44 26v-24m61 53v-24"
        stroke="#f9e7c7"
        strokeWidth="7"
      />
      <path
        d="M437 330V214h24v116m-38-116h52l-11-10h-30Zm17-17h19v-63h-19Zm-7-63h33l-16-45Zm84 196V183h39v147m-19-147v-47m-39 194V246h-28v84m95 0V223h29v107"
        fill="#762d2a"
      />
      <path d="M537 223v-30" stroke="#762d2a" strokeWidth="4" />
      <text x="34" y="68" fill="#762d2a" fontSize="18" letterSpacing="6">
        北京 → 上海
      </text>
    </svg>
  );
}
export function China() {
  const [data, setData] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [access, setAccess] = useState(false);
  const [authFailed, setAuthFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("missions");
  const [selected, setSelected] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    try {
      const next = await api<TripData>("state");
      setData(next);
      setAccess(false);
      setError("");
    } catch (cause) {
      if (cause instanceof ApiError && [401, 403].includes(cause.status)) {
        setData(null);
        setAccess(true);
      }
      setError(cause instanceof Error ? cause.message : "Could not load the clubhouse.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    setAuthFailed(new URLSearchParams(window.location.search).has("error"));
    void refresh();
  }, [refresh]);
  const authenticated = data !== null;
  useEffect(() => {
    if (!authenticated) {
      return;
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    }, 30_000);
    return () => clearInterval(timer);
  }, [authenticated, refresh]);
  const due = data?.mastery.filter((item) => item.due <= Date.now()) ?? [];
  if (!data) {
    return (
      <main className="landing">
        <div className="landing-copy">
          <a className="wordmark" href="/">
            <ChinaFlag />{" "}
            <span>
              CHINA<span className="brand-sub">THE BOYS GO EAST</span>
            </span>
          </a>
          <span className="eyebrow">PRIVATE TRIP CLUBHOUSE · 北京 / 上海</span>
          <h1>
            Big trip.
            <br />
            Zero Mandarin.
            <br />
            <em>Let’s fix that.</em>
          </h1>
          <p>
            A little over a week in China. Enough useful Mandarin to order dinner, find the
            bathroom, and give the best man a goddamn break.
          </p>
          <div className="button-row">
            {loading ? (
              <p role="status">Checking the guest list…</p>
            ) : access ? (
              <a className="button primary" href="/api/auth/sign-in?returnTo=/">
                Continue with Google ↗
              </a>
            ) : (
              <button className="primary" type="button" onClick={() => void refresh()}>
                Try again
              </button>
            )}
          </div>
          {!loading && (
            <p className="fine-print">
              {access
                ? "Invite-only. Use the Google email you gave the groom. No shared passwords."
                : error}
            </p>
          )}
          {access && error.includes("crew list") && (
            <p role="status" className="notice">
              {error}
            </p>
          )}
          {authFailed && (
            <p role="alert" className="notice">
              Sign-in didn’t finish. Your account may not be invited yet. Ask the groom to check
              your email, then try again.
            </p>
          )}
        </div>
        <div className="landing-art">
          <Skyline />
          <span className="travel-stamp">
            北京
            <br />
            <small>BEIJING</small>
          </span>
          <p>
            LEARN A LITTLE. LIVE A LOT.
            <br />
            TRY NOT TO BECOME A CONSULAR INCIDENT.
          </p>
        </div>
      </main>
    );
  }
  const active = data.missions.find((mission) => mission.id === selected);
  return (
    <div className={`app-shell${active ? " in-session" : ""}`}>
      <aside className="sidebar">
        <a className="wordmark" href="/">
          <ChinaFlag />{" "}
          <span>
            CHINA<span className="brand-sub">THE BOYS GO EAST</span>
          </span>
        </a>
        <p className="sidebar-label">THE PRE-DEPARTURE PLAN</p>
        <nav aria-label="Main navigation">
          {(
            [
              ["missions", "↗", "The missions"],
              ["review", "↻", "Keep it fresh"],
              ["crew", "♧", "The boys"],
              ["field", "▤", "Pocket guide"],
            ] as const
          ).map(([key, icon, label]) => (
            <button
              type="button"
              key={key}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => {
                setTab(key);
                setSelected(null);
              }}
            >
              <span>{icon}</span>
              {label}
              {key === "review" && due.length > 0 && <b className="count">{due.length}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="trip-tag">
            <span>✈</span>
            <div>
              BEIJING → SHANGHAI
              <small>A bachelor trip, not a language degree.</small>
            </div>
          </div>
          <div className="user-line">
            <span className="avatar">{data.user.name.slice(0, 1) || "?"}</span>
            <div>
              <strong>{data.user.name || "Name yourself"}</strong>
              <small>Invited crew member</small>
            </div>
          </div>
          <form action="/api/auth/sign-out?returnTo=/" method="post">
            <button type="submit" className="text-button">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <span>
            CHINA /{" "}
            <strong>
              {active
                ? "IN SESSION"
                : tab === "missions"
                  ? "THE MISSIONS"
                  : tab === "review"
                    ? "KEEP IT FRESH"
                    : tab === "crew"
                      ? "THE BOYS"
                      : "POCKET GUIDE"}
            </strong>
          </span>
          <div className="topbar-actions">
            {active && (
              <button
                type="button"
                className="text-button"
                onClick={() => {
                  setTab("field");
                  setSelected(null);
                }}
              >
                Emergency guide
              </button>
            )}
            <span className="private-badge">
              <ChinaFlag /> 中国 · CREW ONLY
            </span>
            <form className="mobile-sign-out" action="/api/auth/sign-out?returnTo=/" method="post">
              <button className="text-button" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </header>
        {error && (
          <div role="alert" className="notice">
            {error}{" "}
            <button type="button" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        )}
        {!data.user.name ? (
          <Profile data={data} onSaved={refresh} />
        ) : active ? (
          <MissionExperience
            key={active.id}
            mission={active}
            mastery={data.mastery}
            completed={data.completed.includes(active.id)}
            completedCount={data.completed.length}
            onBack={() => setSelected(null)}
            onRefresh={refresh}
          />
        ) : tab === "missions" ? (
          <Missions
            data={data}
            due={due.length}
            onSelect={setSelected}
            onReview={() => setTab("review")}
          />
        ) : tab === "review" ? (
          <Review data={data} onRefresh={refresh} />
        ) : tab === "crew" ? (
          <Crew data={data} onRefresh={refresh} />
        ) : (
          <FieldGuide data={data} />
        )}
        <footer>
          Built for the boys. Every last one of you.{" "}
          <span>Respect the locals. Roast each other.</span>
        </footer>
      </main>
    </div>
  );
}
function Profile({ data, onSaved }: { data: TripData; onSaved: () => Promise<void> }) {
  const nameInput = useId();
  const [name, setName] = useState(data.user.name);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <section className="panel onboarding">
      <span className="eyebrow">YOU’RE ON THE LIST</span>
      <h1>Who’s this menace?</h1>
      <p>
        Pick your name or enter your own. Your Google account owns your progress; this is just what
        the boys see.
      </p>
      <div className="name-grid">
        {data.crew.map((person) => (
          <button
            className={name === person ? "selected" : ""}
            type="button"
            key={person}
            onClick={() => setName(person)}
          >
            {person}
            {person === data.groom ? " · Groom" : ""}
          </button>
        ))}
      </div>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api("profile", { name });
            await onSaved();
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor={nameInput}>Crew name (pick yours above or enter it here)</label>
        <input
          id={nameInput}
          value={name}
          maxLength={32}
          required
          onChange={(event) => setName(event.target.value)}
        />
        <button className="primary" type="submit" disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Let’s get into it →"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function Missions({
  data,
  due,
  onSelect,
  onReview,
}: {
  data: TripData;
  due: number;
  onSelect: (id: string) => void;
  onReview: () => void;
}) {
  const next =
    data.missions.find((mission) => !data.completed.includes(mission.id)) ?? data.missions[0];
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">{data.groom}’s bachelor trip · THE BOYS GO EAST</span>
          <h1>
            Less “uhhh.”
            <br />
            More <em>你好.</em>
          </h1>
          <p>
            One short chapter at a time. We’ll show you something useful, help you try it, and put
            the boys in a situation where you can use it.
          </p>
          <button className="primary" type="button" onClick={() => next && onSelect(next.id)}>
            {data.completed.length ? "Pick up where you left off" : "Start from absolute zero"} ↗
          </button>
          <small>Up next: {next?.title}. Your saved progress comes with you.</small>
        </div>
        <div className="hero-art">
          <div className="hero-china" lang="zh-CN">
            中国
          </div>
          <Skyline />
          <span className="hero-seal">
            走吧<small>LET’S GO</small>
          </span>
        </div>
      </section>
      <details className="trip-route">
        <summary>
          Your route & progress · {data.completed.length} / {data.missions.length} chapters
        </summary>
        <section className="stats-strip" aria-label="Your progress">
          <div>
            <strong>
              {String(data.completed.length).padStart(2, "0")}
              <small> / {data.missions.length}</small>
            </strong>
            <span>MISSIONS IN THE BAG</span>
          </div>
          <div>
            <strong>
              {
                data.mastery.filter(
                  (item) =>
                    item.level > 0 &&
                    item.task <
                      (data.missions.find((mission) => mission.id === item.mission_id)?.phrases
                        .length ?? 0),
                ).length
              }
            </strong>
            <span>PHRASES RECOGNIZED</span>
          </div>
          <button type="button" onClick={onReview}>
            <strong>
              {due}
              <small> ↻</small>
            </strong>
            <span>READY FOR A REFRESH</span>
          </button>
        </section>
        <div className="section-heading">
          <div>
            <span className="eyebrow">YOUR LEARNING ITINERARY</span>
            <h2>From “hello” to “get us home.”</h2>
          </div>
          <span className="muted">Easiest → hardest</span>
        </div>
        <p className="section-intro">
          Follow the numbers, not the travel dates. First listen and match. Then say it without
          looking. Review tomorrow—recognizing it once isn’t knowing it.
        </p>
        <div className="mission-grid">
          {data.missions.map((mission, index) => {
            const done = data.completed.includes(mission.id);
            return (
              <button
                type="button"
                key={mission.id}
                className={`mission-card ${next?.id === mission.id ? "next" : ""}`}
                onClick={() => onSelect(mission.id)}
              >
                <div className="card-meta">
                  <span>MISSION {String(index + 1).padStart(2, "0")}</span>
                  <span>
                    {done
                      ? "✓ PASSED"
                      : index < 3
                        ? "FIRST WORDS"
                        : index < 7
                          ? "BUILD IT UP"
                          : "REAL SITUATIONS"}
                  </span>
                </div>
                <div className="mission-symbol" aria-hidden="true">
                  {mission.icon}
                </div>
                <span className="eyebrow">{mission.label}</span>
                <h3>{mission.title}</h3>
                <div className="card-bottom">
                  <span>
                    {mission.city} · {mission.phrases.length} phrases
                  </span>
                  <span className="round-arrow">↗</span>
                </div>
              </button>
            );
          })}
        </div>
        <section className="buddy-note">
          <span className="note-icon">↔</span>
          <div>
            <h3>The best man is a friend, not a translation subscription.</h3>
            <p>
              After each mission: pair up. One plays the staff member, one plays the confused
              American. Swap roles. Ask your Chinese-speaking best man to check your tones when he’s
              up for it.
            </p>
          </div>
        </section>
      </details>
    </>
  );
}
function Primer() {
  return <HelloPrimer />;
}
function Study({
  mission,
  beginner,
  onBack,
  onRefresh,
  reviewTask,
}: {
  mission: Mission;
  beginner: boolean;
  onBack: () => void;
  onRefresh: () => Promise<void>;
  reviewTask?: number;
}) {
  const [phase, setPhase] = useState<"learn" | "quiz" | "done">(
    reviewTask === undefined ? "learn" : "quiz",
  );
  const [index, setIndex] = useState(reviewTask ?? 0);
  const recallInput = useId();
  const [typed, setTyped] = useState(false);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState(false);
  const [hide, setHide] = useState(false);
  const phrase = mission.phrases[index];
  const listening = phase === "quiz" && index % 2 === 1 && Boolean(phrase) && !typed;
  async function submit(value: string) {
    if (busy) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const next = await api<AnswerResult>("answer", {
        missionId: mission.id,
        task: index,
        answer: value,
      });
      setResult(next);
      await onRefresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Couldn’t save your answer.");
    } finally {
      setBusy(false);
    }
  }
  function advance() {
    if (reviewTask !== undefined) {
      onBack();
      return;
    }
    if (index === mission.phrases.length) {
      if (result?.completed) {
        setPhase("done");
      } else {
        setError(
          "An earlier exercise still needs a correct answer. Go back to all missions and revisit this one to earn the stamp.",
        );
      }
      return;
    }
    setIndex(index + 1);
    setResult(null);
    setAnswer("");
    setHint(false);
  }
  return (
    <section className="study">
      <button type="button" className="text-button" onClick={onBack}>
        ← {reviewTask === undefined ? "All missions" : "Back to review"}
      </button>
      <div className="study-heading">
        <span className="eyebrow">
          {mission.label} · {mission.city}
        </span>
        <h1>{mission.title}</h1>
        <p>{mission.story}</p>
      </div>
      {phase === "done" ? (
        <div className="panel completion">
          <span className="completion-seal">过</span>
          <h2>Less helpless. More dangerous.</h2>
          <p>
            Mission passed. You recognized the phrases and handled the sign drill. That’s a
            start—not proof of fluency.
          </p>
          <div className="notice">
            Real-world check: put the phone down. Say one request aloud from memory. Can your buddy
            tell what you want?
          </div>
          <p>
            These phrases come back for review tomorrow, then in 3, 7, 14, and 30 days as you
            remember them.
          </p>
          <button type="button" className="primary" onClick={onBack}>
            Back to the plan ↗
          </button>
        </div>
      ) : (
        <>
          {mission.id === "basics" && phase === "learn" && index === 0 && <Primer />}
          <div className="study-progress">
            <span>
              {phase === "learn" ? "01 · LISTEN, UNDERSTAND, SAY IT" : "02 · TRY WITHOUT PEEKING"}
            </span>
            <span>
              {index + 1} / {mission.phrases.length + (phase === "quiz" ? 1 : 0)}
            </span>
          </div>
          <progress max={mission.phrases.length + (phase === "quiz" ? 1 : 0)} value={index + 1} />
          <div className="panel phrase-panel">
            {phase === "learn" && phrase ? (
              <>
                <span className="eyebrow">SAY THIS</span>
                <h2>{phrase.english}</h2>
                <button
                  type="button"
                  className="text-button hide-toggle"
                  onClick={() => setHide(!hide)}
                >
                  {hide ? "Show the phrase" : "Hide it & try from memory"}
                </button>
                <div className={`phrase-text ${hide ? "concealed" : ""}`} aria-hidden={hide}>
                  <p className="hanzi" lang="zh-CN">
                    {phrase.hanzi}
                  </p>
                  <p className="pinyin" lang="zh-Latn-pinyin">
                    {phrase.pinyin}
                  </p>
                </div>
                <VoicePractice key={`learn-${index}`} text={phrase.hanzi} />
                <div className="phrase-tip">
                  <strong>MAKE IT STICK</strong>
                  <p>{phrase.tip}</p>
                </div>
                {index === mission.phrases.length - 1 && (
                  <div className="phrase-tip">
                    <strong>BEFORE THE SIGN CHECK</strong>
                    <p>{mission.explanation}</p>
                    <p>
                      Look at these once, then try recognizing them without the English. No surprise
                      vocabulary.
                    </p>
                  </div>
                )}
                <div className="button-row spread">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => {
                      setIndex(index - 1);
                      setHide(false);
                    }}
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      setHide(false);
                      if (index === mission.phrases.length - 1) {
                        setPhase("quiz");
                        setIndex(0);
                      } else {
                        setIndex(index + 1);
                      }
                    }}
                  >
                    {index === mission.phrases.length - 1
                      ? "Try the mission check →"
                      : "I’ve said it. Next →"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <span className="eyebrow">
                  {!phrase
                    ? "READ THE SITUATION"
                    : typed
                      ? "STRETCH GOAL · TEXT RECALL"
                      : listening
                        ? "LISTENING CHECK"
                        : "RECOGNITION CHECK"}
                </span>
                <h2>
                  {!phrase
                    ? mission.question
                    : listening
                      ? "Listen. What does this mean?"
                      : `How do you say “${phrase.english}”`}
                </h2>
                {listening && phrase && <VoicePractice key={`quiz-${index}`} text={phrase.hanzi} />}
                {phrase && (
                  <div className="button-row">
                    <button
                      type="button"
                      className="text-button"
                      disabled={busy || result?.correct}
                      onClick={() => {
                        setTyped(!typed);
                        setResult(null);
                        setAnswer("");
                        setHint(false);
                      }}
                    >
                      {typed ? "Back to beginner choices" : "Harder: type pinyin or Chinese"}
                    </button>
                    <button type="button" className="text-button" onClick={() => setHint(!hint)}>
                      {hint ? "Hide hint" : listening ? "No audio? Show text hint" : "Need a hint?"}
                    </button>
                  </div>
                )}
                {hint && phrase && (
                  <div className="notice">
                    <span lang="zh-CN">{phrase.hanzi}</span>
                    <br />
                    <span lang="zh-Latn-pinyin">{phrase.pinyin}</span>
                    <p>{phrase.tip}</p>
                  </div>
                )}
                {!phrase ? (
                  <div className="answers">
                    {mission.options.map((option, optionIndex) => (
                      <button
                        type="button"
                        key={option}
                        disabled={busy || result?.correct}
                        onClick={() => void submit(String(optionIndex))}
                      >
                        <span>{String.fromCharCode(65 + optionIndex)}</span>
                        {option}
                      </button>
                    ))}
                  </div>
                ) : typed ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submit(answer);
                    }}
                  >
                    <label htmlFor={recallInput}>
                      Pinyin or Chinese (tone marks and spaces optional)
                    </label>
                    <input
                      id={recallInput}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      value={answer}
                      onChange={(event) => setAnswer(event.target.value)}
                      maxLength={500}
                    />
                    <p className="fine-print">
                      This checks word recall, not tones. For ü, type ü or v. Beginners: choices are
                      a perfectly good place to start.
                    </p>
                    <button
                      type="submit"
                      className="primary"
                      disabled={busy || result?.correct || !answer.trim()}
                    >
                      Check my answer
                    </button>
                  </form>
                ) : (
                  <div className="answers">
                    {mission.phrases
                      .toSorted((a, b) => a.hanzi.localeCompare(b.hanzi, "zh"))
                      .map((choice, choiceIndex) => (
                        <button
                          type="button"
                          key={choice.hanzi}
                          disabled={busy || result?.correct}
                          onClick={() => void submit(choice.hanzi)}
                        >
                          <span>{String.fromCharCode(65 + choiceIndex)}</span>
                          <div>
                            {listening ? (
                              choice.english
                            ) : (
                              <>
                                <strong lang="zh-CN">{choice.hanzi}</strong>
                                {(beginner || hint) && (
                                  <small lang="zh-Latn-pinyin">{choice.pinyin}</small>
                                )}
                              </>
                            )}
                          </div>
                        </button>
                      ))}
                  </div>
                )}
                {busy && <p role="status">Checking…</p>}
                {error && (
                  <p className="notice" role="alert">
                    {error}
                  </p>
                )}
                {result && (
                  <div
                    className={`feedback ${result.correct ? "correct" : "incorrect"}`}
                    role="status"
                  >
                    <strong>
                      {result.correct
                        ? "That’s the one. 好!"
                        : "Not quite. No lives lost. Try again."}
                    </strong>
                    <p>
                      {phrase
                        ? result.correct
                          ? `${phrase.pinyin} — ${phrase.english}`
                          : "Use the hint, listen again, and have another go. A mistake brings this back for review sooner."
                        : mission.explanation}
                    </p>
                    {result.correct && (
                      <button className="primary" type="button" onClick={advance}>
                        {reviewTask !== undefined
                          ? "Back to review →"
                          : index === mission.phrases.length
                            ? "Finish mission →"
                            : "Next check →"}
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
function Review({ data, onRefresh }: { data: TripData; onRefresh: () => Promise<void> }) {
  const due = data.mastery.filter((item) => item.due <= Date.now());
  const [active, setActive] = useState<{
    mission: Mission;
    task: number;
  } | null>(null);
  if (active) {
    return (
      <Study
        key={`${active.mission.id}-${active.task}`}
        mission={active.mission}
        beginner={false}
        reviewTask={active.task}
        onBack={() => setActive(null)}
        onRefresh={onRefresh}
      />
    );
  }
  const next = data.mastery
    .filter((item) => item.due > Date.now())
    .toSorted((a, b) => a.due - b.due)[0];
  return (
    <section>
      <div className="page-heading">
        <span className="eyebrow">THE PART THAT MAKES IT STICK</span>
        <h1>Your brain has a checkout time.</h1>
        <p>
          Five minutes today beats relearning everything in a taxi. Correct answers return in 1, 3,
          7, 14, then 30 days. Miss one? We’ll try it again in five minutes.
        </p>
      </div>
      {due.length ? (
        <div className="review-list">
          {due.map((item) => {
            const mission = data.missions.find((entry) => entry.id === item.mission_id);
            if (!mission) {
              return null;
            }
            return (
              <button
                type="button"
                key={`${item.mission_id}-${item.task}`}
                onClick={() => setActive({ mission, task: item.task })}
              >
                <span className="mission-symbol">{mission.icon}</span>
                <div>
                  <span className="eyebrow">
                    {mission.label} · {item.level === 0 ? "NEEDS ANOTHER GO" : "DUE NOW"}
                  </span>
                  <h3>{mission.phrases[item.task]?.english ?? "Signs & situations"}</h3>
                </div>
                <span>↗</span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="panel empty-state">
          <span>↻</span>
          <h2>
            {data.mastery.length ? "Fresh enough for now." : "Give your brain something to forget."}
          </h2>
          <p>
            {next
              ? `Next review: ${new Date(next.due).toLocaleString()}. You can still revisit any mission for extra practice.`
              : "Start the first mission. Your personalized review queue will appear here."}
          </p>
        </div>
      )}
    </section>
  );
}
function Crew({ data, onRefresh }: { data: TripData; onRefresh: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editName, setEditName] = useState(false);
  return (
    <section>
      <div className="page-heading">
        <span className="eyebrow">SHARED CHAOS. INDIVIDUAL HOMEWORK.</span>
        <h1>
          The boys. <em>The receipts.</em>
        </h1>
        <p>
          Real progress only. No fake activity, no made-up rivals. One stamp per mission. Learning
          it twice is good; farming points isn’t a personality.
        </p>
        <button type="button" className="text-button" onClick={() => setEditName(!editName)}>
          {editName ? "Cancel name change" : "Change my crew name"}
        </button>
      </div>
      {editName && (
        <Profile
          data={data}
          onSaved={async () => {
            await onRefresh();
            setEditName(false);
          }}
        />
      )}
      <div className="crew-columns">
        <div className="panel">
          <span className="eyebrow">THE MANIFEST</span>
          <h2>Who can order dinner?</h2>
          {data.board.map((member, index) => (
            <div className="leader-row" key={member.id}>
              <span className="rank">{String(index + 1).padStart(2, "0")}</span>
              <span className="avatar">{member.name.slice(0, 1)}</span>
              <div>
                <strong>
                  {member.name}
                  {member.id === data.user.id ? " (you)" : ""}
                </strong>
                <small>
                  {member.completed === 0
                    ? "Still relying on pointing"
                    : member.completed < 4
                      ? "Less helpless than yesterday"
                      : member.completed < 8
                        ? "Can probably feed the group"
                        : "Best man’s workload reduced"}
                </small>
              </div>
              <b>
                {member.completed}
                <small> / {data.missions.length}</small>
              </b>
            </div>
          ))}
          <p className="fine-print">
            Names are self-selected; Google accounts own the progress. Mission stamps measure
            practice, not fluency.
          </p>
          <details>
            <summary>The full roll call</summary>
            <p>{data.crew.join(" · ")}</p>
            <p>
              {data.groom} is the groom. The reason we’re all here—and absolutely not exempt from
              the homework.
            </p>
          </details>
        </div>
        <div className="panel">
          <span className="eyebrow">RECENT FIELD REPORTS</span>
          <h2>Proof of effort.</h2>
          {data.activity.length === 0 ? (
            <p className="muted">
              Quiet in here. Pass the first mission and give the boys something to react to.
            </p>
          ) : (
            data.activity.map((item) => (
              <article className="activity" key={`${item.user_id}-${item.mission_id}`}>
                <p>
                  <strong>{item.name}</strong> passed{" "}
                  <strong>
                    {data.missions.find((mission) => mission.id === item.mission_id)?.title}
                  </strong>
                </p>
                <time dateTime={new Date(item.created_at).toISOString()}>
                  {new Date(item.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </time>
                <button
                  type="button"
                  disabled={busy || Boolean(item.cheered) || item.user_id === data.user.id}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await api("cheer", {
                        targetId: item.user_id,
                        missionId: item.mission_id,
                      });
                      await onRefresh();
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : "Could not cheer.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {item.cheered ? "✓ Legend" : "↗ Legend"} · {item.cheers}
                </button>
              </article>
            ))
          )}
          {error && (
            <p role="alert" className="notice">
              {error}
            </p>
          )}
          <p className="fine-print">Updates every 30 seconds while this tab is visible.</p>
        </div>
      </div>
    </section>
  );
}
function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ??
      character,
  );
}
function downloadGuide(data: TripData, address: string) {
  const rows = [...data.missions.flatMap((mission) => mission.phrases), ...data.fieldNotes];
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>China · Offline pocket guide</title><style>body{font:18px/1.6 system-ui;max-width:800px;margin:auto;padding:24px;background:#faf5e9;color:#25221f}article{border-bottom:1px solid #ccc;padding:16px 0;break-inside:avoid}h2{font-size:28px;margin:0}p{margin:5px 0}small{color:#555}header{border:2px solid #a32b26;padding:18px;white-space:pre-wrap}</style><h1>China · Pocket guide</h1><header>MAINLAND CHINA EMERGENCIES\nAmbulance 120 · Police 110 · Fire 119\nHotel / meeting point:\n${escapeHtml(address || "Add your hotel’s Chinese address before departure.")}</header><p>Saved from your private crew app. Keep this file on your device; anyone you share it with can read it. Text only—audio and sign-in need your device/network.</p>${rows.map((row) => `<article><h2 lang="zh-CN">${escapeHtml(row.hanzi)}</h2><p lang="zh-Latn-pinyin">${escapeHtml(row.pinyin)}</p><p>${escapeHtml(row.english)}</p>${"tip" in row && typeof row.tip === "string" ? `<small>${escapeHtml(row.tip)}</small>` : ""}</article>`).join("")}<p>For allergies, carry a professionally translated allergy card. For medical or legal emergencies, seek qualified help. An app is not a doctor, interpreter, or lawyer.</p></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "china-pocket-guide.html";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function FieldGuide({ data }: { data: TripData }) {
  const hotelInput = useId();
  const searchInput = useId();
  const [search, setSearch] = useState("");
  const [address, setAddress] = useState("");
  const [show, setShow] = useState<{
    hanzi: string;
    pinyin: string;
    english: string;
  } | null>(null);
  const rows = [...data.missions.flatMap((mission) => mission.phrases), ...data.fieldNotes].filter(
    (row) =>
      `${row.hanzi} ${row.pinyin} ${row.english}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <section>
      <div className="page-heading">
        <span className="eyebrow">FOR WHEN YOUR BRAIN HAS LEFT THE GROUP CHAT</span>
        <h1>
          Less panic. <em>More pointing.</em>
        </h1>
        <p>
          Search, listen, or show someone a big Chinese phrase. Every phrase is available now—no
          lesson locks on getting home safely.
        </p>
      </div>
      <div className="emergency-strip">
        <strong>REAL EMERGENCY? NO BITS.</strong>
        <a href="tel:120">
          120 <span>Ambulance</span>
        </a>
        <a href="tel:110">
          110 <span>Police</span>
        </a>
        <a href="tel:119">
          119 <span>Fire</span>
        </a>
        <small>Mainland China · give your location</small>
      </div>
      <details className="panel prep">
        <summary>Before you fly: five things language lessons won’t fix</summary>
        <ol>
          <li>
            Save hotel addresses in Chinese, booking details, and your meeting point on your phone.
            Keep a backup separate from your phone.
          </li>
          <li>
            Set up and test payment apps before leaving. Carry backup payment methods and some RMB.{" "}
            <a
              href="https://english.www.gov.cn/news/202404/11/content_WS6617c858c6d0868f4e8e5f4d.html"
              target="_blank"
              rel="noreferrer"
            >
              Official payment guide ↗
            </a>
          </li>
          <li>
            Check entry rules and current travel advice for U.S. passports; save consular contacts.{" "}
            <a
              href="https://travel.state.gov/en/international-travel/travel-advisories/china.html"
              target="_blank"
              rel="noreferrer"
            >
              U.S. State Department ↗
            </a>
          </li>
          <li>
            Book the Forbidden City through official channels and bring the ID used for booking.
            Check current rules, not an old blog.{" "}
            <a href="https://intl.dpm.org.cn/" target="_blank" rel="noreferrer">
              Palace Museum ↗
            </a>
          </li>
          <li>
            Plan for internet restrictions: Google sign-in may not work on mainland networks. Sign
            in and download this guide before departure. Test your connectivity and Mandarin speech
            voice; don’t rely on live translation as your only backup.
          </li>
        </ol>
        <p className="fine-print">
          Use the app before the trip. The downloaded HTML guide works without sign-in or internet;
          the full app is not offline-enabled.
        </p>
      </details>
      <details className="panel prep">
        <summary>Save a text-only offline guide</summary>
        <label htmlFor={hotelInput}>
          Hotel / meeting point in Chinese (included only in your download)
        </label>
        <textarea
          id={hotelInput}
          rows={3}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Paste the Chinese name, address, and an emergency meeting point…"
        />
        <p className="fine-print">
          Not uploaded or saved to your account. The downloaded file includes this address and the
          phrasebook, not the crew roster or stories. Keep the file private.
        </p>
        <button type="button" className="primary" onClick={() => downloadGuide(data, address)}>
          ↓ Download offline pocket guide
        </button>
      </details>
      <label className="search-label" htmlFor={searchInput}>
        Find a phrase, menu word, or sign
      </label>
      <input
        type="search"
        id={searchInput}
        placeholder="Try water, toilet, beer, allergy, left…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {show && (
        <div className="panel show-card">
          <button type="button" className="text-button" onClick={() => setShow(null)}>
            Close phrase ×
          </button>
          <p className="hanzi" lang="zh-CN">
            {show.hanzi}
          </p>
          <p className="pinyin" lang="zh-Latn-pinyin">
            {show.pinyin}
          </p>
          <h2>{show.english}</h2>
          <VoicePractice key={show.hanzi} text={show.hanzi} />
        </div>
      )}
      <div className="field-list">
        {rows.length ? (
          rows.map((row) => (
            <button
              type="button"
              key={`${row.hanzi}-${row.english}-${"tip" in row ? row.tip : ""}`}
              onClick={() => {
                setShow(row);
                setTimeout(
                  () =>
                    document
                      .querySelector(".show-card")
                      ?.scrollIntoView({ behavior: "smooth", block: "center" }),
                  0,
                );
              }}
            >
              <strong lang="zh-CN">{row.hanzi}</strong>
              <span lang="zh-Latn-pinyin">{row.pinyin}</span>
              <p>{row.english}</p>
              <small>SHOW & LISTEN ↗</small>
            </button>
          ))
        ) : (
          <p className="notice">
            No matching phrase. Try a simpler English word. This is a curated phrasebook, not a
            general translator.
          </p>
        )}
      </div>
    </section>
  );
}
