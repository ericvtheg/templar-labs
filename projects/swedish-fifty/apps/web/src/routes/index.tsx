import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Alert, AlertDescription, AlertTitle } from "@templar/ui/components/alert";
import { Badge } from "@templar/ui/components/badge";
import { Button } from "@templar/ui/components/button";
import { Input } from "@templar/ui/components/input";
import { Label } from "@templar/ui/components/label";
import { Progress } from "@templar/ui/components/progress";
import { Textarea } from "@templar/ui/components/textarea";
import {
  CalendarDaysIcon,
  CheckCircle2Icon,
  HeadphonesIcon,
  LockIcon,
  LogOutIcon,
  MicIcon,
  PlayIcon,
  SendIcon,
  SparklesIcon,
  Volume2Icon,
} from "lucide-react";
import {
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { authClient } from "../lib/auth-client.ts";
import {
  type AttemptView,
  type DashboardView,
  evaluateAnswer,
  generateSpeechAudio,
  loadDashboard,
  type MissionView,
  sendRoleplayTurn,
  transcribeLearnerSpeech,
} from "../lib/mission-server-functions.ts";
import type { MissionPrompt } from "../lib/swedish-fifty.ts";

export const Route = createFileRoute("/")({
  component: Home,
});

type AuthMode = "sign-in" | "sign-up";
type ListeningState = {
  readonly promptId: string;
  readonly mode: "browser" | "upload";
} | null;

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  addEventListener: (
    type: "result" | "error" | "end",
    listener: (event: SpeechRecognitionEventLike) => void,
  ) => void;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  readonly results: ArrayLike<{
    readonly isFinal: boolean;
    readonly 0: {
      readonly transcript: string;
    };
  }>;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function Home() {
  const session = authClient.useSession();
  const currentUser = session.data?.user ?? null;
  const [authMode, setAuthMode] = useState<AuthMode>("sign-in");
  const [authName, setAuthName] = useState("Eric");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthPending, startAuthTransition] = useTransition();

  const handleAuthSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError(null);
    startAuthTransition(async () => {
      try {
        const result =
          authMode === "sign-up"
            ? await authClient.signUp.email({
                name: authName,
                email: authEmail,
                password: authPassword,
              })
            : await authClient.signIn.email({
                email: authEmail,
                password: authPassword,
              });

        if (result.error !== null) {
          setAuthError(result.error.message ?? "Authentication failed.");
          return;
        }

        await session.refetch();
      } catch {
        setAuthError("Authentication failed.");
      }
    });
  };

  const handleSignOut = () => {
    startAuthTransition(async () => {
      await authClient.signOut();
      await session.refetch();
    });
  };

  if (session.isPending) {
    return (
      <main className="swedish-shell">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4">
          <div className="status-panel">Checking session...</div>
        </div>
      </main>
    );
  }

  if (currentUser === null) {
    return (
      <AuthScreen
        authEmail={authEmail}
        authError={authError}
        authMode={authMode}
        authName={authName}
        authPassword={authPassword}
        isPending={isAuthPending}
        onAuthEmailChange={setAuthEmail}
        onAuthModeChange={setAuthMode}
        onAuthNameChange={setAuthName}
        onAuthPasswordChange={setAuthPassword}
        onSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <Dashboard
      isSigningOut={isAuthPending}
      onSignOut={handleSignOut}
      sessionName={currentUser.name}
    />
  );
}

function AuthScreen(props: {
  readonly authMode: AuthMode;
  readonly authName: string;
  readonly authEmail: string;
  readonly authPassword: string;
  readonly authError: string | null;
  readonly isPending: boolean;
  readonly onAuthModeChange: (mode: AuthMode) => void;
  readonly onAuthNameChange: (value: string) => void;
  readonly onAuthEmailChange: (value: string) => void;
  readonly onAuthPasswordChange: (value: string) => void;
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}) {
  const nameId = useId();
  const emailId = useId();
  const passwordId = useId();

  return (
    <main className="swedish-shell">
      <section className="mx-auto grid min-h-screen w-full max-w-5xl content-center gap-6 px-4 py-8 md:grid-cols-[1fr_24rem] md:px-6">
        <div className="space-y-5 self-center">
          <Badge className="w-fit bg-[#f2c94c] text-[#17202a] hover:bg-[#f2c94c]">
            Stockholm prep
          </Badge>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-normal text-[#17202a] sm:text-5xl">
              Swedish Fifty
            </h1>
            <p className="max-w-xl text-base leading-7 text-[#4d5d66]">
              One short daily speaking mission for Eric's July 23-30 Sweden trip.
            </p>
          </div>
          <div className="grid max-w-xl grid-cols-2 gap-3 text-sm text-[#33444d]">
            <Signal icon={<HeadphonesIcon className="size-4" />} label="Listen first" />
            <Signal icon={<MicIcon className="size-4" />} label="Push to talk" />
            <Signal icon={<SparklesIcon className="size-4" />} label="Adaptive memory" />
            <Signal icon={<CalendarDaysIcon className="size-4" />} label="50-day arc" />
          </div>
        </div>

        <form className="auth-panel" onSubmit={props.onSubmit}>
          <div className="grid grid-cols-2 gap-2">
            <Button
              onClick={() => props.onAuthModeChange("sign-in")}
              type="button"
              variant={props.authMode === "sign-in" ? "default" : "outline"}
            >
              Sign in
            </Button>
            <Button
              onClick={() => props.onAuthModeChange("sign-up")}
              type="button"
              variant={props.authMode === "sign-up" ? "default" : "outline"}
            >
              Sign up
            </Button>
          </div>

          {props.authMode === "sign-up" ? (
            <div className="grid gap-2">
              <Label htmlFor={nameId}>Name</Label>
              <Input
                autoComplete="name"
                id={nameId}
                onChange={(event) => props.onAuthNameChange(event.currentTarget.value)}
                value={props.authName}
              />
            </div>
          ) : null}

          <div className="grid gap-2">
            <Label htmlFor={emailId}>Email</Label>
            <Input
              autoComplete="email"
              id={emailId}
              onChange={(event) => props.onAuthEmailChange(event.currentTarget.value)}
              type="email"
              value={props.authEmail}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor={passwordId}>Password</Label>
            <Input
              autoComplete={props.authMode === "sign-in" ? "current-password" : "new-password"}
              id={passwordId}
              onChange={(event) => props.onAuthPasswordChange(event.currentTarget.value)}
              type="password"
              value={props.authPassword}
            />
          </div>

          {props.authError === null ? null : (
            <Alert variant="destructive">
              <AlertTitle>Authentication failed</AlertTitle>
              <AlertDescription>{props.authError}</AlertDescription>
            </Alert>
          )}

          <Button disabled={props.isPending} size="lg" type="submit">
            {props.isPending
              ? "Working..."
              : props.authMode === "sign-in"
                ? "Sign in"
                : "Create account"}
          </Button>
        </form>
      </section>
    </main>
  );
}

function Dashboard(props: {
  readonly sessionName: string;
  readonly isSigningOut: boolean;
  readonly onSignOut: () => void;
}) {
  const loadDashboardFn = useServerFn(loadDashboard);
  const evaluateAnswerFn = useServerFn(evaluateAnswer);
  const sendRoleplayTurnFn = useServerFn(sendRoleplayTurn);
  const generateSpeechAudioFn = useServerFn(generateSpeechAudio);
  const transcribeLearnerSpeechFn = useServerFn(transcribeLearnerSpeech);
  const [dashboard, setDashboard] = useState<DashboardView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Record<string, string>>({});
  const [roleplayMessage, setRoleplayMessage] = useState("");
  const [listening, setListening] = useState<ListeningState>(null);
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isAudioPending, startAudioTransition] = useTransition();
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaChunksRef = useRef<Blob[]>([]);

  const refresh = useCallback(async () => {
    const result = await loadDashboardFn();
    setDashboard(result);
  }, [loadDashboardFn]);

  useEffect(() => {
    setLoadError(null);
    startTransition(async () => {
      try {
        await refresh();
      } catch {
        setLoadError("Could not load today's Swedish mission.");
      }
    });
  }, [refresh]);

  const mission = dashboard?.mission ?? null;
  const latestAttemptByPrompt = useMemo(() => {
    const attempts = new Map<string, AttemptView>();

    for (const attempt of dashboard?.attempts ?? []) {
      if (!attempts.has(attempt.promptId)) {
        attempts.set(attempt.promptId, attempt);
      }
    }

    return attempts;
  }, [dashboard?.attempts]);

  const playText = (text: string, route: "quality" | "fast" | "balanced") => {
    setAudioError(null);
    startAudioTransition(async () => {
      try {
        const result = await generateSpeechAudioFn({
          data: {
            text,
            route,
          },
        });
        const audio = new Audio(`data:${result.contentType};base64,${result.audioBase64}`);
        await audio.play();
      } catch {
        setAudioError("Audio is unavailable. Check the ElevenLabs configuration.");
      }
    });
  };

  const playMissionDialogue = (slow: boolean) => {
    if (mission === null) {
      return;
    }

    const text = mission.dialogue.map((line) => line.swedish).join(slow ? ". ... " : ". ");

    playText(text, "quality");
  };

  const setTranscript = (promptId: string, value: string) => {
    setTranscripts((current) => ({
      ...current,
      [promptId]: value,
    }));
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    setListening(null);
  };

  const startListening = (prompt: MissionPrompt) => {
    if (listening !== null) {
      stopListening();
      return;
    }

    const SpeechRecognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (SpeechRecognition !== undefined) {
      const recognition = new SpeechRecognition();
      recognition.lang = "sv-SE";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.addEventListener("result", (event) => {
        const transcript = Array.from(event.results)
          .map((result) => result[0].transcript)
          .join(" ")
          .trim();

        setTranscript(prompt.id, transcript);
      });
      recognition.addEventListener("error", () => {
        setAudioError("Browser speech recognition stopped.");
        setListening(null);
      });
      recognition.addEventListener("end", () => {
        setListening(null);
      });
      recognitionRef.current = recognition;
      setListening({
        promptId: prompt.id,
        mode: "browser",
      });
      recognition.start();
      return;
    }

    if (
      dashboard?.access.premium &&
      navigator.mediaDevices !== undefined &&
      window.MediaRecorder !== undefined
    ) {
      startTransition(async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const recorder = new MediaRecorder(stream);
          mediaChunksRef.current = [];
          recorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              mediaChunksRef.current.push(event.data);
            }
          };
          recorder.onstop = () => {
            stream.getTracks().forEach((track) => {
              track.stop();
            });
            const blob = new Blob(mediaChunksRef.current, {
              type: recorder.mimeType || "audio/webm",
            });
            startTransition(async () => {
              try {
                const result = await transcribeLearnerSpeechFn({
                  data: {
                    missionId: mission?.id ?? "",
                    audioBase64: await blobToBase64(blob),
                    contentType: blob.type || "audio/webm",
                  },
                });
                setTranscript(prompt.id, result.text);
              } catch {
                setAudioError("Could not transcribe that recording.");
              }
            });
          };
          mediaRecorderRef.current = recorder;
          setListening({
            promptId: prompt.id,
            mode: "upload",
          });
          recorder.start();
        } catch {
          setAudioError("Microphone access was not available.");
        }
      });
      return;
    }

    setAudioError("Speech input is unavailable in this browser. Type the answer instead.");
  };

  const submitAnswer = (prompt: MissionPrompt) => {
    if (mission === null) {
      return;
    }

    const transcript = (transcripts[prompt.id] ?? "").trim();

    if (transcript.length === 0) {
      setAudioError("Add a spoken transcript before checking.");
      return;
    }

    setActivePromptId(prompt.id);
    startTransition(async () => {
      try {
        const result = await evaluateAnswerFn({
          data: {
            missionId: mission.id,
            promptId: prompt.id,
            transcript,
            voiceMetadata: {
              provider: listening?.mode ?? "typed",
            },
          },
        });

        setDashboard((current) =>
          current === null
            ? current
            : {
                ...current,
                access: result.freeMissionCompleted
                  ? {
                      ...current.access,
                      freeMissionAvailable: false,
                      freeMissionUsed: true,
                      gateReason: "free-used",
                    }
                  : current.access,
                attempts: result.attempts,
                memories: result.memories,
                readiness: result.readiness,
              },
        );
      } catch {
        setAudioError("Could not evaluate that answer.");
      } finally {
        setActivePromptId(null);
      }
    });
  };

  const sendRoleplay = () => {
    if (mission === null || roleplayMessage.trim().length === 0) {
      return;
    }

    startTransition(async () => {
      try {
        const result = await sendRoleplayTurnFn({
          data: {
            missionId: mission.id,
            learnerMessage: roleplayMessage.trim(),
          },
        });

        setRoleplayMessage("");
        setDashboard((current) =>
          current === null
            ? current
            : {
                ...current,
                roleplayTurns: result.roleplayTurns,
              },
        );
      } catch {
        setAudioError("Could not send the roleplay turn.");
      }
    });
  };

  if (dashboard === null) {
    return (
      <main className="swedish-shell">
        <div className="mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4">
          <div className="status-panel">
            {loadError === null ? "Loading today's mission..." : loadError}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="swedish-shell">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 px-3 py-4 sm:px-5 lg:px-7">
        <header className="topbar">
          <div>
            <p className="text-sm font-medium text-[#4d5d66]">Swedish Fifty</p>
            <h1 className="text-xl font-semibold tracking-normal text-[#17202a]">
              Day {dashboard.today.dayNumber} of 50
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={dashboard.access.premium ? "default" : "outline"}>
              {dashboard.access.premium
                ? "Premium"
                : dashboard.access.freeMissionUsed
                  ? "Free used"
                  : "Free mission"}
            </Badge>
            <Button
              aria-label="Sign out"
              disabled={props.isSigningOut}
              onClick={props.onSignOut}
              size="icon"
              type="button"
              variant="ghost"
            >
              <LogOutIcon className="size-4" />
            </Button>
          </div>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_21rem]">
          <div className="space-y-4">
            <TripStrip
              daysUntilTrip={dashboard.today.daysUntilTrip}
              premium={dashboard.access.premium}
              sessionName={props.sessionName}
            />

            {mission === null ? (
              <PremiumGate />
            ) : (
              <MissionPanel
                activePromptId={activePromptId}
                attempts={latestAttemptByPrompt}
                isAudioPending={isAudioPending}
                isPending={isPending}
                listening={listening}
                mission={mission}
                onPlayDialogue={playMissionDialogue}
                onPlayText={playText}
                onStartListening={startListening}
                onStopListening={stopListening}
                onSubmitAnswer={submitAnswer}
                onTranscriptChange={setTranscript}
                transcripts={transcripts}
              />
            )}

            {mission === null ? null : (
              <RoleplayPanel
                isPending={isPending}
                message={roleplayMessage}
                mission={mission}
                onMessageChange={setRoleplayMessage}
                onPlayText={playText}
                onSend={sendRoleplay}
                turns={dashboard.roleplayTurns}
              />
            )}

            {audioError === null ? null : (
              <Alert>
                <AlertTitle>Heads up</AlertTitle>
                <AlertDescription>{audioError}</AlertDescription>
              </Alert>
            )}
          </div>

          <aside className="space-y-4">
            <BillingPanel premium={dashboard.access.premium} />
            <ReadinessPanel readiness={dashboard.readiness} />
            <MemoryPanel memories={dashboard.memories} premium={dashboard.access.premium} />
            <CalendarPanel calendar={dashboard.calendar} />
          </aside>
        </div>
      </div>
    </main>
  );
}

function TripStrip(props: {
  readonly sessionName: string;
  readonly daysUntilTrip: number;
  readonly premium: boolean;
}) {
  return (
    <section className="mission-strip">
      <div>
        <p className="text-sm text-[#4d5d66]">Hej {props.sessionName}</p>
        <p className="text-lg font-semibold text-[#17202a]">
          {props.daysUntilTrip} days until Stockholm
        </p>
      </div>
      <div className="text-right text-sm text-[#4d5d66]">
        <p>July 23-30</p>
        <p>{props.premium ? "Adaptive coach active" : "One free mission included"}</p>
      </div>
    </section>
  );
}

function MissionPanel(props: {
  readonly mission: MissionView;
  readonly attempts: Map<string, AttemptView>;
  readonly transcripts: Record<string, string>;
  readonly listening: ListeningState;
  readonly activePromptId: string | null;
  readonly isPending: boolean;
  readonly isAudioPending: boolean;
  readonly onPlayDialogue: (slow: boolean) => void;
  readonly onPlayText: (text: string, route: "quality" | "fast" | "balanced") => void;
  readonly onStartListening: (prompt: MissionPrompt) => void;
  readonly onStopListening: () => void;
  readonly onSubmitAnswer: (prompt: MissionPrompt) => void;
  readonly onTranscriptChange: (promptId: string, value: string) => void;
}) {
  return (
    <section className="work-panel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Badge variant="secondary">{props.mission.phase}</Badge>
          <h2 className="text-2xl font-semibold tracking-normal text-[#17202a]">
            {props.mission.title}
          </h2>
          <p className="max-w-2xl text-sm leading-6 text-[#4d5d66]">{props.mission.context}</p>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={props.isAudioPending}
            onClick={() => props.onPlayDialogue(false)}
            size="sm"
            type="button"
          >
            <PlayIcon className="size-4" />
            Listen
          </Button>
          <Button
            disabled={props.isAudioPending}
            onClick={() => props.onPlayDialogue(true)}
            size="sm"
            type="button"
            variant="outline"
          >
            <Volume2Icon className="size-4" />
            Slow
          </Button>
        </div>
      </div>

      <div className="dialogue-list">
        {props.mission.dialogue.map((line) => (
          <div className="dialogue-row" key={`${line.speaker}-${line.swedish}`}>
            <div className="dialogue-speaker">{line.speaker}</div>
            <div>
              <p className="font-medium text-[#17202a]">{line.swedish}</p>
              <p className="text-sm text-[#62717a]">{line.english}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="prompt-list">
        {props.mission.prompts.map((prompt) => {
          const attempt = props.attempts.get(prompt.id);
          const isListening = props.listening?.promptId === prompt.id;
          const transcript = props.transcripts[prompt.id] ?? "";

          return (
            <div className="prompt-panel" key={prompt.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[#17202a]">{prompt.promptEnglish}</p>
                  <p className="mt-1 text-sm text-[#62717a]">{prompt.expectedSwedish}</p>
                </div>
                <Button
                  aria-label="Play prompt"
                  onClick={() => props.onPlayText(prompt.expectedSwedish, "quality")}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <HeadphonesIcon className="size-4" />
                </Button>
              </div>

              <Textarea
                className="min-h-20 resize-none"
                onChange={(event) => props.onTranscriptChange(prompt.id, event.currentTarget.value)}
                placeholder="Transcript appears here"
                value={transcript}
              />

              <div className="grid grid-cols-[1fr_1fr] gap-2">
                <Button
                  onClick={() =>
                    isListening ? props.onStopListening() : props.onStartListening(prompt)
                  }
                  type="button"
                  variant={isListening ? "default" : "outline"}
                >
                  <MicIcon className="size-4" />
                  {isListening ? "Stop" : "Talk"}
                </Button>
                <Button
                  disabled={props.isPending || props.activePromptId === prompt.id}
                  onClick={() => props.onSubmitAnswer(prompt)}
                  type="button"
                >
                  <CheckCircle2Icon className="size-4" />
                  Check
                </Button>
              </div>

              {attempt === undefined ? null : (
                <div className="feedback-panel">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-[#17202a]">
                      {attempt.evaluation.understandable ? "Understandable" : "Practice again"}
                    </p>
                    <span className="text-sm tabular-nums text-[#4d5d66]">
                      {attempt.intelligibilityScore}%
                    </span>
                  </div>
                  <Progress value={attempt.intelligibilityScore} />
                  <p className="text-sm leading-6 text-[#4d5d66]">{attempt.evaluation.feedback}</p>
                  <p className="text-sm text-[#17202a]">{attempt.evaluation.moreNaturalSwedish}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RoleplayPanel(props: {
  readonly mission: MissionView;
  readonly turns: DashboardView["roleplayTurns"];
  readonly message: string;
  readonly isPending: boolean;
  readonly onMessageChange: (value: string) => void;
  readonly onSend: () => void;
  readonly onPlayText: (text: string, route: "quality" | "fast" | "balanced") => void;
}) {
  const latestRoleplay = props.turns.toReversed().find((turn) => turn.speaker === "roleplay");

  return (
    <section className="work-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge variant="secondary">Roleplay</Badge>
          <h2 className="mt-2 text-xl font-semibold tracking-normal text-[#17202a]">
            Realistic exchange
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#4d5d66]">{props.mission.roleplaySetup}</p>
        </div>
        {latestRoleplay === undefined ? null : (
          <Button
            aria-label="Play latest roleplay reply"
            onClick={() => props.onPlayText(latestRoleplay.content, "balanced")}
            size="icon"
            type="button"
            variant="outline"
          >
            <Volume2Icon className="size-4" />
          </Button>
        )}
      </div>

      <div className="roleplay-log">
        {props.turns.length === 0 ? (
          <p className="text-sm text-[#62717a]">Start with a short Swedish answer.</p>
        ) : (
          props.turns.map((turn) => (
            <div className="roleplay-turn" data-speaker={turn.speaker} key={turn.id}>
              <p>{turn.content}</p>
              {turn.englishSummary === null ? null : <span>{turn.englishSummary}</span>}
            </div>
          ))
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <Input
          onChange={(event) => props.onMessageChange(event.currentTarget.value)}
          placeholder="Skriv eller klistra in ditt svar"
          value={props.message}
        />
        <Button disabled={props.isPending} onClick={props.onSend} type="button">
          <SendIcon className="size-4" />
          Send
        </Button>
      </div>
    </section>
  );
}

function BillingPanel(props: { readonly premium: boolean }) {
  return (
    <section className="side-panel">
      <div className="flex items-center gap-2">
        <LockIcon className="size-4 text-[#1f6f8b]" />
        <h2 className="font-semibold text-[#17202a]">Premium</h2>
      </div>
      <p className="text-sm leading-6 text-[#4d5d66]">
        {props.premium
          ? "Daily adaptive missions, memory updates, and voice practice are active."
          : "Upgrade after the free mission for daily generated lessons, voice roleplay, and durable memory."}
      </p>
      {props.premium ? (
        <form action="/api/payments/portal" method="post">
          <Button className="w-full" type="submit" variant="outline">
            Billing portal
          </Button>
        </form>
      ) : (
        <form action="/api/payments/checkout" method="post">
          <input name="offering" type="hidden" value="subscription" />
          <Button className="w-full" type="submit">
            Upgrade
          </Button>
        </form>
      )}
    </section>
  );
}

function PremiumGate() {
  return (
    <section className="work-panel">
      <Badge variant="outline">Premium needed</Badge>
      <h2 className="mt-3 text-2xl font-semibold tracking-normal text-[#17202a]">
        Your free mission is complete.
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[#4d5d66]">
        Premium unlocks the next daily generated mission, voice roleplay, ElevenLabs transcription,
        adaptive debriefs, and permanent memory updates.
      </p>
    </section>
  );
}

function ReadinessPanel(props: { readonly readiness: DashboardView["readiness"] }) {
  return (
    <section className="side-panel">
      <h2 className="font-semibold text-[#17202a]">Scenario readiness</h2>
      <div className="space-y-3">
        {props.readiness.map((item) => (
          <div className="space-y-1.5" key={item.scenarioKey}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-[#17202a]">{item.shortLabel}</span>
              <span className="tabular-nums text-[#62717a]">{item.score}%</span>
            </div>
            <Progress value={item.score} />
            <p className="text-xs leading-5 text-[#62717a]">{item.confidenceLabel}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function MemoryPanel(props: {
  readonly premium: boolean;
  readonly memories: DashboardView["memories"];
}) {
  return (
    <section className="side-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-[#17202a]">Memory</h2>
        {props.premium ? (
          <Badge variant="secondary">Active</Badge>
        ) : (
          <Badge variant="outline">Locked</Badge>
        )}
      </div>
      {props.memories.length === 0 ? (
        <p className="text-sm leading-6 text-[#62717a]">
          {props.premium
            ? "Memory appears after checked answers."
            : "Permanent learning memory starts with Premium."}
        </p>
      ) : (
        <div className="space-y-3">
          {props.memories.map((memory) => (
            <div className="memory-item" key={memory.id}>
              <p className="text-sm font-medium text-[#17202a]">{memory.pattern}</p>
              <p className="text-xs leading-5 text-[#62717a]">{memory.nextPractice}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CalendarPanel(props: { readonly calendar: DashboardView["calendar"] }) {
  return (
    <section className="side-panel">
      <h2 className="font-semibold text-[#17202a]">50-day calendar</h2>
      <div className="calendar-grid">
        {props.calendar.map((day) => (
          <div
            className="calendar-day"
            data-generated={day.isGenerated}
            data-today={day.isToday}
            key={day.dayNumber}
            title={`${day.label}: ${day.phase}`}
          >
            {day.dayNumber}
          </div>
        ))}
      </div>
    </section>
  );
}

function Signal(props: { readonly icon: ReactNode; readonly label: string }) {
  return (
    <div className="signal-pill">
      {props.icon}
      <span>{props.label}</span>
    </div>
  );
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary);
}
