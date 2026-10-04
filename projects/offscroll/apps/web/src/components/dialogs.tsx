import {
  ArrowRight,
  Camera,
  Check,
  Clock3,
  Coffee,
  Copy,
  Gift,
  Heart,
  Leaf,
  Link2,
  Music2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Trophy,
  Users,
  Video,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  addDays,
  type Challenge,
  canEditUsage,
  challengeStatus,
  type Dashboard,
  datesBetween,
  daysBetween,
  formatMinutes,
  isFinal,
  leaderboard,
} from "../lib/model.ts";
import {
  type ChallengeInput,
  challengeInput,
  type ProfileInput,
  profileInput,
  type UsageInput,
  usageInput,
} from "../lib/validation.ts";
import { LeaderRow } from "./dashboard.tsx";
import { OfflineIllustration } from "./illustration.tsx";
import { AvatarStack, Modal } from "./primitives.tsx";

type FormProps<Input> = {
  data: Dashboard;
  onClose: () => void;
  onSubmit: (input: Input) => Promise<string>;
  busy: boolean;
};

export function LogDialog({ data, onClose, onSubmit, busy }: FormProps<UsageInput>) {
  const id = useId();
  const own = data.usage.filter((entry) => entry.userId === data.viewer.id);
  const fieldsFor = (date: string): UsageInput => {
    const log = own.find((entry) => entry.date === date);
    return {
      date,
      instagram: log?.instagram ?? 0,
      tiktok: log?.tiktok ?? 0,
      youtube: log?.youtube ?? 0,
      other: log?.other ?? 0,
      note: log?.note ?? "",
    };
  };
  const [fields, setFields] = useState(() => fieldsFor(data.today));
  const [error, setError] = useState("");
  const total = fields.instagram + fields.tiktok + fields.youtube + fields.other;
  const apps = [
    { key: "instagram", name: "Instagram", icon: <Camera size={19} /> },
    { key: "tiktok", name: "TikTok", icon: <Music2 size={19} /> },
    { key: "youtube", name: "YouTube", icon: <Video size={19} /> },
    { key: "other", name: "Everything else", icon: <Smartphone size={19} /> },
  ] as const;
  return (
    <Modal
      title="A little daily check-in"
      description="No judgment. Just a little awareness of where your time went."
      onClose={onClose}
    >
      <form
        className="dialog-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = usageInput.safeParse(fields);
          if (!result.success) {
            setError(result.error.issues[0]?.message ?? "Check your entries.");
            return;
          }
          if (!canEditUsage(data.challenges, fields.date, data.today)) {
            setError("That date is locked. Choose an editable date from the past 30 days.");
            return;
          }
          setError(await onSubmit(result.data));
        }}
      >
        <div className="field">
          <label htmlFor={`${id}-date`}>
            Check-in date <span>UTC</span>
          </label>
          <input
            id={`${id}-date`}
            type="date"
            value={fields.date}
            min={addDays(data.today, -30)}
            max={data.today}
            required
            onChange={(event) => {
              setFields(fieldsFor(event.target.value));
              setError("");
            }}
          />
        </div>
        <div className="manual-notice">
          <ShieldCheck size={17} />
          <p>
            Open <strong>Screen Time</strong> on iPhone or <strong>Digital Wellbeing</strong> on
            Android. Enter your social app minutes below.
          </p>
        </div>
        <div className="usage-inputs">
          {apps.map((app) => (
            <div className="usage-field" key={app.key}>
              <label htmlFor={`${id}-${app.key}`}>
                <span className={`app-icon ${app.key}`}>{app.icon}</span>
                {app.name}
              </label>
              <div>
                <input
                  id={`${id}-${app.key}`}
                  inputMode="numeric"
                  type="number"
                  min={0}
                  max={1440}
                  step={1}
                  required
                  value={Number.isNaN(fields[app.key]) ? "" : fields[app.key]}
                  onChange={(event) =>
                    setFields({ ...fields, [app.key]: event.target.valueAsNumber })
                  }
                />
                <span>min</span>
              </div>
            </div>
          ))}
        </div>
        <div className="checkin-total">
          <span>
            Your total
            <span>
              {total <= data.viewer.goal
                ? "A little more room for life."
                : "Tomorrow is a fresh start."}
            </span>
          </span>
          <strong>{Number.isFinite(total) ? formatMinutes(total) : "—"}</strong>
        </div>
        <div className="field">
          <label htmlFor={`${id}-note`}>
            What did you do instead? <span>optional</span>
          </label>
          <textarea
            id={`${id}-note`}
            rows={2}
            maxLength={160}
            value={fields.note}
            placeholder="A sunset walk. A good book. Coffee with a friend."
            onChange={(event) => setFields({ ...fields, note: event.target.value })}
          />
          <small>Shared with friends in your challenges. Keep personal details private.</small>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button primary full-width" disabled={busy}>
          {busy ? "Saving…" : "Save check-in"}
          <Check size={16} />
        </button>
        <p className="form-footnote">
          Self-reported, on the honor system. Zero minutes is a valid check-in.
        </p>
      </form>
    </Modal>
  );
}

export function CreateDialog({ data, onClose, onSubmit, busy }: FormProps<ChallengeInput>) {
  const id = useId();
  const [fields, setFields] = useState<ChallengeInput>({
    title: "",
    reward: "",
    duration: 7,
    goal: 45,
    color: "sage",
  });
  const [error, setError] = useState("");
  const rewards = [
    { text: "Coffee on the crew", icon: <Coffee size={14} /> },
    { text: "Pick our next adventure", icon: <Leaf size={14} /> },
    { text: "A donation to my favorite cause", icon: <Heart size={14} /> },
  ];
  return (
    <Modal
      title="Less scrolling starts together."
      description="Make a challenge. Pick a meaningful reward. Bring your people."
      onClose={onClose}
    >
      <form
        className="dialog-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = challengeInput.safeParse(fields);
          if (!result.success) {
            setError(result.error.issues[0]?.message ?? "Check your challenge details.");
            return;
          }
          setError(await onSubmit(result.data));
        }}
      >
        <div className="field">
          <label htmlFor={`${id}-title`}>Give it a name</label>
          <input
            id={`${id}-title`}
            placeholder="The weekly unplug"
            required
            minLength={3}
            maxLength={60}
            value={fields.title}
            onChange={(event) => setFields({ ...fields, title: event.target.value })}
          />
        </div>
        <fieldset className="field">
          <legend>How long are we doing this?</legend>
          <div className="duration-options">
            {([7, 14, 30] as const).map((duration) => (
              <label key={duration} className={duration === fields.duration ? "selected" : ""}>
                <input
                  type="radio"
                  name="duration"
                  value={duration}
                  checked={duration === fields.duration}
                  onChange={() => setFields({ ...fields, duration })}
                />
                <strong>{duration}</strong> days
              </label>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor={`${id}-goal`}>
            A daily goal to aim for <span>minutes</span>
          </label>
          <input
            id={`${id}-goal`}
            type="number"
            min={5}
            max={240}
            required
            value={Number.isNaN(fields.goal) ? "" : fields.goal}
            onChange={(event) => setFields({ ...fields, goal: event.target.valueAsNumber })}
          />
          <small>A little encouragement, not a cutoff. Lowest average still wins.</small>
        </div>
        <div className="field">
          <label htmlFor={`${id}-reward`}>What are you playing for?</label>
          <input
            id={`${id}-reward`}
            placeholder="Something that matters to your crew"
            required
            minLength={3}
            maxLength={120}
            value={fields.reward}
            onChange={(event) => setFields({ ...fields, reward: event.target.value })}
          />
          <div className="reward-presets">
            {rewards.map((reward) => (
              <button
                className={fields.reward === reward.text ? "selected" : ""}
                type="button"
                key={reward.text}
                onClick={() => setFields({ ...fields, reward: reward.text })}
              >
                {reward.icon}
                {reward.text}
              </button>
            ))}
          </div>
        </div>
        <fieldset className="color-field">
          <legend>Give it a little personality</legend>
          <div>
            {(["sage", "lavender", "peach"] as const).map((color) => (
              <label className={`color-swatch ${color}`} key={color}>
                <input
                  type="radio"
                  name="color"
                  aria-label={`${color} challenge color`}
                  value={color}
                  checked={fields.color === color}
                  onChange={() => setFields({ ...fields, color })}
                />
                {fields.color === color && <Check size={16} />}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="rule-note">
          <Trophy size={18} />
          <p>
            Starts today ({data.today}, UTC). Check in every day. The lowest complete average wins;
            ties share the win.
          </p>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full-width" type="submit" disabled={busy}>
          {busy ? "Creating…" : "Let’s do this"}
          <ArrowRight size={16} />
        </button>
        {data.mode === "demo" && (
          <p className="form-footnote">
            Preview challenges stay on this device. Sign in to invite real friends.
          </p>
        )}
      </form>
    </Modal>
  );
}

export function SettingsDialog({ data, onClose, onSubmit, busy }: FormProps<ProfileInput>) {
  const id = useId();
  const [fields, setFields] = useState({ goal: data.viewer.goal, baseline: data.viewer.baseline });
  const [error, setError] = useState("");
  return (
    <Modal
      title="Your pace. Your goals."
      description="Small, sustainable changes beat an all-or-nothing reset."
      onClose={onClose}
    >
      <form
        className="dialog-form"
        onSubmit={async (event) => {
          event.preventDefault();
          const result = profileInput.safeParse(fields);
          if (!result.success) {
            setError(result.error.issues[0]?.message ?? "Choose a valid number of minutes.");
            return;
          }
          setError(await onSubmit(result.data));
        }}
      >
        <div className="field">
          <label htmlFor={`${id}-goal`}>
            Your daily social screen-time goal <span>minutes</span>
          </label>
          <input
            id={`${id}-goal`}
            type="number"
            required
            min={5}
            max={240}
            value={Number.isNaN(fields.goal) ? "" : fields.goal}
            onChange={(event) => setFields({ ...fields, goal: event.target.valueAsNumber })}
          />
          <small>
            Used for your personal streak and chart. Existing challenge goals don’t change.
          </small>
        </div>
        <div className="field">
          <label htmlFor={`${id}-baseline`}>
            Your usual daily scroll time <span>minutes</span>
          </label>
          <input
            id={`${id}-baseline`}
            type="number"
            required
            min={5}
            max={1440}
            value={Number.isNaN(fields.baseline) ? "" : fields.baseline}
            onChange={(event) => setFields({ ...fields, baseline: event.target.valueAsNumber })}
          />
          <small>
            We compare your check-ins with this baseline to estimate time reclaimed. The default is
            120 minutes—adjust it to reflect your own usage.
          </small>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary full-width" type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save my goals"}
          <Check size={16} />
        </button>
      </form>
      {data.mode === "live" ? (
        <form action="/api/auth/sign-out" method="post">
          <button type="submit" className="button secondary full-width">
            Sign out
          </button>
        </form>
      ) : (
        <a className="button secondary full-width" href="/api/auth/sign-in">
          Make it yours · Sign in with Breli <ArrowRight size={15} />
        </a>
      )}
    </Modal>
  );
}

export function GuideDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Less feed. More life."
      description="A little friendly accountability goes a long way."
      onClose={onClose}
    >
      <div className="guide-steps">
        {[
          {
            icon: <Users />,
            title: "Bring your people",
            text: "Create a 7, 14, or 30-day challenge and share its private link. Friends join with their own Breli accounts.",
          },
          {
            icon: <Gift />,
            title: "Make it worth it",
            text: "Coffee, dinner, choosing your next adventure, or a donation. Choose a reward your friends will honor offline.",
          },
          {
            icon: <Smartphone />,
            title: "Check in, honestly",
            text: "Read your phone’s Screen Time or Digital Wellbeing and enter social app minutes. We cannot automatically track or block other apps.",
          },
          {
            icon: <Trophy />,
            title: "Less scrolling wins",
            text: "Rankings compare closed UTC days. Every day needs a check-in; missing days are unranked, never zero. Ties share the win. Late joiners must backfill from the start.",
          },
        ].map((step) => (
          <div key={step.title}>
            <span>{step.icon}</span>
            <section>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </section>
          </div>
        ))}
      </div>
      <div className="rule-note">
        <ShieldCheck size={19} />
        <p>
          Check-ins lock 24 hours after each challenge ends. Only your shared circle can see your
          check-ins during the challenge. Rewards involve no in-app payments.
        </p>
      </div>
      <button type="button" className="button primary full-width" onClick={onClose}>
        Sounds good <Check size={16} />
      </button>
    </Modal>
  );
}

export function ChallengeDialog({
  challenge,
  data,
  onClose,
  onInvite,
  onLog,
}: {
  challenge: Challenge;
  data: Dashboard;
  onClose: () => void;
  onInvite: () => void;
  onLog: () => void;
}) {
  const status = challengeStatus(challenge, data.today);
  const leaders = leaderboard(challenge, data.usage, data.today);
  const winners = challenge.members.length > 1 ? leaders.filter((person) => person.rank === 1) : [];
  const own = data.usage.filter((entry) => entry.userId === data.viewer.id);
  const yesterday = addDays(data.today, -1);
  const requiredThrough = challenge.endDate < yesterday ? challenge.endDate : yesterday;
  const missing = datesBetween(challenge.startDate, requiredThrough).filter(
    (date) => !own.some((entry) => entry.date === date),
  );
  return (
    <Modal
      title={challenge.title}
      description={`${challenge.members.length} friends · ${daysBetween(challenge.startDate, challenge.endDate) + 1} days · ${challenge.startDate} – ${challenge.endDate} (UTC)`}
      onClose={onClose}
    >
      <div className={`detail-reward ${challenge.color}`}>
        <Gift size={25} />
        <div>
          <span>LESS SCROLLING. A LITTLE SOMETHING GOOD.</span>
          <h3>{challenge.reward}</h3>
        </div>
      </div>
      {status === "completed" && (
        <div className="result-banner">
          <Trophy size={20} />
          <p>
            {isFinal(challenge, data.today)
              ? winners.length
                ? `${winners.map((person) => person.name.split(" ")[0]).join(" & ")} ${winners.length === 1 ? "takes" : "share"} the win! Arrange the reward with your friends.`
                : challenge.members.length < 2
                  ? "This circle stayed solo. No competitive reward was declared. Invite a friend for the next one."
                  : "No complete check-ins this time. No winner was declared. A fresh challenge is a fresh start."
              : `Results are settling. Fill any missing check-ins before ${addDays(challenge.endDate, 1)} ends (UTC).`}
          </p>
        </div>
      )}
      <div className="detail-heading">
        <h3>The leaderboard</h3>
        <span>Lower is better</span>
      </div>
      <div className="detail-leaders">
        {leaders.map((person) => (
          <LeaderRow key={person.id} person={person} viewerId={data.viewer.id} />
        ))}
      </div>
      <p className="form-footnote">
        Daily averages use completed UTC days, not today’s partial totals. Check in every day to be
        ranked. Ties share the win.
      </p>
      {!!missing.length && !isFinal(challenge, data.today) && (
        <p className="missing-note">
          <Clock3 size={15} />
          You’re missing {missing.length} {missing.length === 1 ? "check-in" : "check-ins"}. Log
          them to join the rankings.
        </p>
      )}
      <div className="detail-heading">
        <span>Daily goal: {challenge.goal} min</span>
        <AvatarStack people={challenge.members} />
      </div>
      <div className="dialog-actions">
        {status === "active" && (
          <button type="button" className="button secondary" onClick={onInvite}>
            <Link2 size={16} /> Invite friends
          </button>
        )}
        {!isFinal(challenge, data.today) && (
          <button type="button" className="button primary" onClick={onLog}>
            <Check size={16} /> Log screen time
          </button>
        )}
      </div>
    </Modal>
  );
}

export function InviteDialog({
  data,
  selectedId,
  onClose,
  onCreate,
}: {
  data: Dashboard;
  selectedId?: string | undefined;
  onClose: () => void;
  onCreate: () => void;
}) {
  const groups = data.challenges.filter((group) => challengeStatus(group, data.today) === "active");
  const selectId = useId();
  const [id, setId] = useState(selectedId ?? groups[0]?.id ?? "");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const group = groups.find((item) => item.id === id) ?? groups[0];
  const url =
    group && data.mode === "live" ? `${window.location.origin}/join/${group.inviteToken}` : "";
  return (
    <Modal
      title="Good things are better together."
      description="A private circle. A shared goal. Your favorite people."
      onClose={onClose}
    >
      {data.mode === "demo" ? (
        <>
          <div className="invite-preview">
            <Users size={35} />
            <h3>Bring your real friends.</h3>
            <p>
              You’re exploring a sample circle. Sign in to create a shared challenge and get a real
              invitation link.
            </p>
          </div>
          <a className="button primary full-width" href="/api/auth/sign-in">
            Continue with Breli <ArrowRight size={16} />
          </a>
          <p className="form-footnote">
            Preview check-ins stay on this device and won’t be added to your account.
          </p>
        </>
      ) : group ? (
        <>
          <div className="field">
            <label htmlFor={selectId}>Choose a challenge</label>
            <select
              id={selectId}
              value={group.id}
              onChange={(event) => {
                setId(event.target.value);
                setCopied(false);
              }}
            >
              {groups.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </div>
          <div className="invite-link">
            <Link2 size={17} />
            <input
              aria-label="Private invitation link"
              value={url}
              readOnly
              onFocus={(event) => event.target.select()}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button
            className="button primary full-width"
            type="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setError("");
              } catch {
                setError("Select the link above and copy it manually.");
              }
            }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Link copied" : "Copy invitation link"}
          </button>
          <div className="rule-note">
            <ShieldCheck size={17} />
            <p>
              Anyone with this link and a Breli account can join until the challenge ends. Share
              privately with people you trust. Maximum 32 friends.
            </p>
          </div>
        </>
      ) : (
        <div className="invite-preview">
          <Users size={35} />
          <h3>First, a shared goal.</h3>
          <p>Create an active challenge to invite your friends.</p>
          <button className="button primary" type="button" onClick={onCreate}>
            Create a challenge
          </button>
        </div>
      )}
    </Modal>
  );
}

export function BreakDialog({ onClose }: { onClose: () => void }) {
  const [remaining, setRemaining] = useState(600);
  const [deadline, setDeadline] = useState<number | null>(null);
  useEffect(() => {
    if (deadline === null) {
      return;
    }
    const update = () => {
      const next = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) {
        setDeadline(null);
      }
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return (
    <Modal
      title={remaining === 0 ? "That time was yours." : "A little room to breathe."}
      description="No feed. No pressure. Just ten minutes for you."
      onClose={onClose}
    >
      <div className="break-content">
        <OfflineIllustration />
        <div
          className="break-time"
          role="timer"
          aria-label={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds remaining`}
        >
          {String(Math.floor(remaining / 60)).padStart(2, "0")}
          <span>:</span>
          {String(remaining % 60).padStart(2, "0")}
        </div>
        <p>
          {remaining === 0
            ? "A small break makes a real difference. Welcome back."
            : deadline
              ? "Stretch. Look outside. Let your mind wander."
              : "What would feel good right now?"}
        </p>
        <div className="dialog-actions">
          <button
            type="button"
            className="button secondary"
            aria-label="Reset break timer"
            onClick={() => {
              setDeadline(null);
              setRemaining(600);
            }}
          >
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            className="button primary"
            onClick={() => {
              if (deadline !== null) {
                setRemaining(Math.max(0, Math.ceil((deadline - Date.now()) / 1000)));
                setDeadline(null);
              } else {
                const seconds = remaining || 600;
                setRemaining(seconds);
                setDeadline(Date.now() + seconds * 1000);
              }
            }}
          >
            {deadline ? <Pause size={16} /> : <Play size={16} />}
            {deadline ? "Pause break" : remaining === 0 ? "Take another break" : "Start break"}
          </button>
        </div>
        <p className="form-footnote">
          Keep this window open. This timer doesn’t track or block other apps, and closing it ends
          the session.
        </p>
      </div>
    </Modal>
  );
}

export function UpdatesDialog({
  data,
  onClose,
  onLog,
}: {
  data: Dashboard;
  onClose: () => void;
  onLog: () => void;
}) {
  const checked = data.usage.some(
    (entry) => entry.userId === data.viewer.id && entry.date === data.today,
  );
  const active = data.challenges.filter((group) => challengeStatus(group, data.today) === "active");
  return (
    <Modal
      title="A little nudge"
      description="Just the useful things. No endless notifications."
      onClose={onClose}
    >
      <div className="update-card">
        <Check size={22} />
        <div>
          <h3>{checked ? "You’re checked in for today." : "Your daily check-in is waiting."}</h3>
          <p>
            {checked
              ? "Nice work. Go enjoy the time you’re making for yourself."
              : "A minute of awareness can make a difference."}
          </p>
        </div>
      </div>
      <div className="update-card">
        <Users size={22} />
        <div>
          <h3>
            {active.length} active {active.length === 1 ? "challenge" : "challenges"}
          </h3>
          <p>
            {active.length
              ? "Your friends are doing this with you. Check the leaderboard to see your progress."
              : "Start a circle and invite your favorite people."}
          </p>
        </div>
      </div>
      <button type="button" className="button primary full-width" onClick={onLog}>
        {checked ? "Edit today’s check-in" : "Log screen time"}
        <ArrowRight size={16} />
      </button>
    </Modal>
  );
}
