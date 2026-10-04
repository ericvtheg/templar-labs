import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Gift,
  LayoutGrid,
  Leaf,
  Plus,
  Settings2,
  ShieldCheck,
  Sun,
  Target,
  Users,
  X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  ChallengesSection,
  FriendsView,
  LeaderboardPanel,
  OfflineWins,
  RewardsView,
  Stats,
  TimeChart,
} from "../components/dashboard.tsx";
import {
  BreakDialog,
  ChallengeDialog,
  CreateDialog,
  GuideDialog,
  InviteDialog,
  LogDialog,
  SettingsDialog,
  UpdatesDialog,
} from "../components/dialogs.tsx";
import { OfflineIllustration } from "../components/illustration.tsx";
import { Avatar, Brand } from "../components/primitives.tsx";
import { demoStorageKey, restoreDemo } from "../lib/demo.ts";
import { createChallenge, loadDashboard, saveProfile, saveUsage } from "../lib/functions.ts";
import { addDays, type Challenge, type Dashboard } from "../lib/model.ts";
import type { ChallengeInput, ProfileInput, UsageInput } from "../lib/validation.ts";

export const Route = createFileRoute("/")({ loader: () => loadDashboard(), component: Offscroll });

type View = "overview" | "challenges" | "friends" | "rewards";
type Dialog =
  | "log"
  | "create"
  | "settings"
  | "guide"
  | "break"
  | "updates"
  | { type: "challenge" | "invite"; id?: string }
  | null;
const navigation = [
  { id: "overview", label: "Overview", icon: LayoutGrid },
  { id: "challenges", label: "Challenges", icon: Target },
  { id: "friends", label: "Friends", icon: Users },
  { id: "rewards", label: "Rewards", icon: Gift },
] as const;

function Offscroll() {
  const mainId = useId();
  const initial = Route.useLoaderData();
  const [data, setData] = useState<Dashboard>(initial);
  const [restored, setRestored] = useState(false);
  const [persistent, setPersistent] = useState(true);
  const [view, setView] = useState<View>("overview");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [authError, setAuthError] = useState(false);
  const load = useServerFn(loadDashboard);
  const save = useServerFn(saveUsage);
  const create = useServerFn(createChallenge);
  const update = useServerFn(saveProfile);

  useEffect(() => {
    if (initial.mode === "demo") {
      try {
        setData(restoreDemo(localStorage.getItem(demoStorageKey), initial));
      } catch {
        setPersistent(false);
      }
    } else {
      setData(initial);
    }
    setRestored(true);
    setAuthError(new URLSearchParams(window.location.search).get("error") === "auth");
  }, [initial]);

  useEffect(() => {
    if (data.mode === "demo" && restored) {
      try {
        localStorage.setItem(demoStorageKey, JSON.stringify(data));
      } catch {
        setPersistent(false);
      }
    }
  }, [data, restored]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timer = window.setTimeout(() => setToast(""), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function commit(
    preview: () => Dashboard,
    live: () => Promise<{ ok: boolean; error: string }>,
    message: string,
  ): Promise<string> {
    if (busy) {
      return "A save is already in progress.";
    }
    setBusy(true);
    try {
      if (data.mode === "demo") {
        setData(preview());
      } else {
        const result = await live();
        if (!result.ok) {
          return result.error;
        }
        try {
          setData(await load());
        } catch {
          setDialog(null);
          setToast("Your change was saved. Reload to refresh your dashboard.");
          return "";
        }
      }
      setDialog(null);
      setToast(`${message}${data.mode === "demo" ? " · saved to your preview" : ""}`);
      return "";
    } catch {
      return "The save couldn’t be confirmed. Reload the page before trying again.";
    } finally {
      setBusy(false);
    }
  }

  const logUsage = (input: UsageInput) =>
    commit(
      () => ({
        ...data,
        usage: [
          ...data.usage.filter(
            (entry) => !(entry.userId === data.viewer.id && entry.date === input.date),
          ),
          { ...input, userId: data.viewer.id, updatedAt: Date.now() },
        ],
      }),
      () => save({ data: input }),
      "A little awareness. A little progress.",
    );

  const addChallenge = (input: ChallengeInput) =>
    data.challenges.length >= 50
      ? Promise.resolve("You have reached the 50-challenge limit.")
      : commit(
          () => ({
            ...data,
            challenges: [
              {
                id: crypto.randomUUID(),
                title: input.title,
                reward: input.reward,
                startDate: data.today,
                endDate: addDays(data.today, input.duration - 1),
                goal: input.goal,
                color: input.color,
                creatorId: data.viewer.id,
                inviteToken: "demo",
                members: [data.viewer],
              },
              ...data.challenges,
            ],
          }),
          () => create({ data: input }),
          "Your challenge is ready",
        );

  const updateGoals = (input: ProfileInput) =>
    commit(
      () => ({ ...data, viewer: { ...data.viewer, ...input } }),
      () => update({ data: input }),
      "Your goals, updated",
    );

  const onClose = () => {
    if (!busy) {
      setDialog(null);
    }
  };
  const openChallenge = (challenge: Challenge) =>
    setDialog({ type: "challenge", id: challenge.id });
  const selected =
    typeof dialog === "object" && dialog
      ? data.challenges.find((group) => group.id === dialog.id)
      : undefined;
  const checkedToday = data.usage.some(
    (entry) => entry.userId === data.viewer.id && entry.date === data.today,
  );
  const firstName = data.viewer.name.split(" ")[0] || "friend";
  const titles = {
    overview: (
      <>
        Hey {firstName}, welcome back.
        <Sun className="greeting-sun" size={27} strokeWidth={1.6} />
      </>
    ),
    challenges: "A little friendly motivation.",
    friends: "Good company. Better habits.",
    rewards: "Less scrolling. More meaning.",
  };
  const subtitles = {
    overview: "Your best moments don’t happen in a feed. Let’s make more of them.",
    challenges: "Small goals feel a little easier when your friends are in on them.",
    friends: "A circle that cheers for your life outside the screen.",
    rewards: "A little incentive for a whole lot more real life.",
  };

  const nav = (mobile = false) => (
    <nav
      className={mobile ? "mobile-nav" : "main-nav"}
      aria-label={mobile ? "Mobile navigation" : "Main navigation"}
    >
      {navigation.map((item) => (
        <button
          type="button"
          key={item.id}
          className={view === item.id ? "active" : ""}
          aria-current={view === item.id ? "page" : undefined}
          onClick={() => setView(item.id)}
        >
          <item.icon size={19} strokeWidth={1.7} />
          <span>{item.label}</span>
          {!mobile && item.id === "challenges" && (
            <span className="nav-count">
              {data.challenges.filter((group) => group.endDate >= data.today).length}
            </span>
          )}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="app-shell" inert={!restored} aria-busy={!restored}>
      <a className="skip-link" href={`#${mainId}`}>
        Skip to content
      </a>
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-caption">A LITTLE LESS ONLINE</div>
        {nav()}
        <div className="sidebar-invite">
          <span className="invite-doodle">
            <Users size={22} strokeWidth={1.5} />
            <span>+</span>
          </span>
          <h3>Better with your people.</h3>
          <p>
            Good habits are contagious.
            <br />
            Bring a friend along.
          </p>
          <button
            className="button sidebar-invite-button"
            type="button"
            onClick={() => setDialog({ type: "invite" })}
          >
            Invite friends <Plus size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button type="button" onClick={() => setDialog("settings")}>
            <Settings2 size={18} /> Your goals
          </button>
          <button type="button" onClick={() => setDialog("guide")}>
            <CircleHelp size={18} /> How it works
          </button>
          <div className="sidebar-footer">
            <Leaf size={14} />
            <span>
              Less feed. More life.
              <small>
                A <strong>Breli</strong> app
              </small>
            </span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="breadcrumb">
            <LayoutGrid size={15} />
            <span>Your {view}</span>
          </div>
          <div className="topbar-right">
            <span className="today-label">
              {new Date(`${data.today}T00:00:00Z`).toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              })}
            </span>
            <button
              type="button"
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => setDialog("updates")}
            >
              <Bell size={19} />
              {!checkedToday && <i />}
            </button>
            <span className="topbar-divider" />
            <button
              type="button"
              className="account-button"
              onClick={() => setDialog("settings")}
              aria-label="Your account and goals"
            >
              <Avatar person={data.viewer} />
              <span>
                {firstName}
                <ChevronDown size={13} />
              </span>
            </button>
          </div>
        </header>
        {data.mode === "demo" && (
          <div className="preview-banner">
            <span>
              <Leaf size={14} />
              <strong>Take a look around.</strong>
              <span>
                {persistent
                  ? "You’re in an interactive preview."
                  : "Preview changes last until this page closes."}
              </span>
            </span>
            <a href="/api/auth/sign-in">
              Make it yours <ArrowRight size={14} />
            </a>
          </div>
        )}
        <main className="main-content" id={mainId}>
          {authError && (
            <div className="auth-error" role="alert">
              <ShieldCheck size={18} />
              <p>Sign-in didn’t finish. Please try again with Breli in the same browser tab.</p>
              <a href="/api/auth/sign-in">Try again</a>
              <button
                type="button"
                className="icon-button"
                aria-label="Dismiss sign-in error"
                onClick={() => setAuthError(false)}
              >
                <X size={16} />
              </button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">MORE PRESENT, TOGETHER</span>
              <h1>{titles[view]}</h1>
              <p>{subtitles[view]}</p>
            </div>
            <button
              type="button"
              className="button primary log-button"
              onClick={() => setDialog("log")}
            >
              <Plus size={17} /> Log screen time
            </button>
          </div>
          {view === "overview" && (
            <>
              <Stats data={data} onLog={() => setDialog("log")} />
              <section className="perspective-banner">
                <div>
                  <span className="eyebrow">
                    <span className="tiny-dot" /> A LITTLE CHANGE, A LOT OF LIFE
                  </span>
                  <h2>Your time looks better on you.</h2>
                  <p>Put down the scroll. Pick up the things that make you, you.</p>
                  <button
                    type="button"
                    onClick={() => setDialog("settings")}
                    className="banner-goal"
                  >
                    <span>
                      <Target size={15} /> Your daily goal: <strong>{data.viewer.goal} min</strong>
                    </span>
                    <span>
                      Make it yours <ArrowRight size={14} />
                    </span>
                  </button>
                </div>
                <OfflineIllustration />
                <span className="banner-note">
                  a little more
                  <br />
                  <i>here & now.</i>
                </span>
              </section>
              <ChallengesSection
                data={data}
                onCreate={() => setDialog("create")}
                onOpen={openChallenge}
              />
              <div className="insights-grid">
                <TimeChart data={data} />
                <LeaderboardPanel data={data} onOpen={openChallenge} />
              </div>
              <OfflineWins
                data={data}
                onBreak={() => setDialog("break")}
                onLog={() => setDialog("log")}
              />
            </>
          )}
          {view === "challenges" && (
            <ChallengesSection
              data={data}
              full
              onCreate={() => setDialog("create")}
              onOpen={openChallenge}
            />
          )}
          {view === "friends" && (
            <FriendsView
              data={data}
              onInvite={() => setDialog({ type: "invite" })}
              onCreate={() => setDialog("create")}
            />
          )}
          {view === "rewards" && <RewardsView data={data} onOpen={openChallenge} />}
          <footer className="page-footer">
            <span>
              <Leaf size={13} /> Built for a life well lived.
            </span>
            <span>
              Self-reported. Friend-supported.{" "}
              <button type="button" onClick={() => setDialog("guide")}>
                The Offscroll way <ArrowRight size={12} />
              </button>
            </span>
          </footer>
        </main>
      </div>
      {nav(true)}
      {dialog === "log" && (
        <LogDialog data={data} onClose={onClose} onSubmit={logUsage} busy={busy} />
      )}
      {dialog === "create" && (
        <CreateDialog data={data} onClose={onClose} onSubmit={addChallenge} busy={busy} />
      )}
      {dialog === "settings" && (
        <SettingsDialog data={data} onClose={onClose} onSubmit={updateGoals} busy={busy} />
      )}
      {dialog === "guide" && <GuideDialog onClose={onClose} />}
      {dialog === "break" && <BreakDialog onClose={onClose} />}
      {dialog === "updates" && (
        <UpdatesDialog data={data} onClose={onClose} onLog={() => setDialog("log")} />
      )}
      {typeof dialog === "object" && dialog?.type === "challenge" && selected && (
        <ChallengeDialog
          challenge={selected}
          data={data}
          onClose={onClose}
          onInvite={() => setDialog({ type: "invite", id: selected.id })}
          onLog={() => setDialog("log")}
        />
      )}
      {typeof dialog === "object" && dialog?.type === "invite" && (
        <InviteDialog
          data={data}
          selectedId={dialog.id}
          onClose={onClose}
          onCreate={() => setDialog("create")}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button type="button" aria-label="Dismiss notification" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
