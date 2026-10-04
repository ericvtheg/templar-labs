import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronRight,
  Clock3,
  Coffee,
  Crown,
  Flame,
  Gift,
  Leaf,
  Plus,
  Smartphone,
  Sparkles,
  Target,
  Trophy,
  Users,
} from "lucide-react";
import { useState } from "react";
import {
  addDays,
  type Challenge,
  challengeStatus,
  type Dashboard,
  datesBetween,
  daysBetween,
  isFinal,
  leaderboard,
  type Person,
  streak,
  totalMinutes,
} from "../lib/model.ts";
import { OfflineIllustration } from "./illustration.tsx";
import { Avatar, AvatarStack, EmptyState } from "./primitives.tsx";

export function Stats({ data, onLog }: { data: Dashboard; onLog: () => void }) {
  const own = data.usage.filter((entry) => entry.userId === data.viewer.id);
  const today = own.find((entry) => entry.date === data.today);
  const yesterday = own.find((entry) => entry.date === addDays(data.today, -1));
  const recent = own.filter(
    (entry) => entry.date >= addDays(data.today, -6) && entry.date <= data.today,
  );
  const reclaimed = recent.reduce(
    (sum, entry) => sum + Math.max(0, data.viewer.baseline - totalMinutes(entry)),
    0,
  );
  const days = streak(own, data.viewer.goal, data.today);
  const friends = [
    ...new Map(
      data.challenges
        .flatMap((group) => group.members)
        .filter((person) => person.id !== data.viewer.id)
        .map((person) => [person.id, person]),
    ).values(),
  ];
  const delta = today && yesterday ? totalMinutes(yesterday) - totalMinutes(today) : null;
  return (
    <section className="stat-grid" aria-label="Your screen-time summary">
      <div className="stat-card time-stat">
        <div className="stat-label">
          Today’s scroll time <Smartphone size={17} />
        </div>
        <div className="stat-value">
          {today ? (
            <>
              {totalMinutes(today)}
              <span>min</span>
            </>
          ) : (
            <span className="no-checkin">Not logged yet</span>
          )}
        </div>
        <div className="stat-foot">
          {today ? (
            <>
              <span className={`stat-chip${delta !== null && delta < 0 ? " neutral" : ""}`}>
                {delta !== null && delta > 0 ? <ArrowDown size={12} /> : <Check size={12} />}
                {delta !== null && delta > 0 ? `${delta}m less` : "Checked in"}
              </span>
              <span>{delta !== null && delta > 0 ? "than yesterday" : "self-reported"}</span>
            </>
          ) : (
            <button className="text-button" type="button" onClick={onLog}>
              Make your first check-in <ArrowRight size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-label">
          Time reclaimed <Leaf size={17} />
        </div>
        <div className="stat-value reclaimed">
          {Math.floor(reclaimed / 60)}
          <span>h</span> {reclaimed % 60}
          <span>m</span>
        </div>
        <div
          className="stat-foot"
          title={`Estimated against your ${data.viewer.baseline}-minute daily baseline, over the last 7 days`}
        >
          <span className="tiny-dot green" />
          <span className="baseline-label">vs. {data.viewer.baseline}m/day · last 7 days</span>
        </div>
      </div>
      <div className="stat-card">
        <div className="stat-label">
          Your mindful streak <Flame size={18} />
        </div>
        <div className="stat-value">
          {days}
          <span>{days === 1 ? "day" : "days"}</span>
          <span className="streak-caption">Keep it going</span>
        </div>
        <div className="streak-days">
          {datesBetween(addDays(data.today, -6), data.today).map((date) => {
            const entry = own.find((log) => log.date === date);
            return (
              <span
                key={date}
                className={entry && totalMinutes(entry) <= data.viewer.goal ? "done" : ""}
                title={`${date}: ${entry ? `${totalMinutes(entry)} minutes` : "no check-in"}`}
              >
                {entry && totalMinutes(entry) <= data.viewer.goal ? (
                  <Check size={11} />
                ) : (
                  new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
                    weekday: "narrow",
                    timeZone: "UTC",
                  })
                )}
              </span>
            );
          })}
        </div>
      </div>
      <div className="stat-card friends-stat">
        <div className="stat-label">
          Better together <Users size={18} />
        </div>
        <div className="stat-value">
          {friends.length}
          <span>{friends.length === 1 ? "friend" : "friends"}</span>
        </div>
        <div className="stat-foot">
          <AvatarStack people={friends} max={4} />
          <span>on your team</span>
        </div>
      </div>
    </section>
  );
}

export function TimeChart({ data }: { data: Dashboard }) {
  const [period, setPeriod] = useState(0);
  const end = addDays(data.today, period === 0 ? 0 : -7);
  const dates = datesBetween(addDays(end, -6), end);
  const logs = data.usage.filter((entry) => entry.userId === data.viewer.id);
  const values = dates.map((date) => {
    const entry = logs.find((log) => log.date === date);
    return entry ? totalMinutes(entry) : null;
  });
  const max = Math.max(90, data.viewer.goal + 20, ...values.map((value) => value ?? 0));
  const logged = values.filter((value): value is number => value !== null);
  const average = logged.length
    ? Math.round(logged.reduce((sum, n) => sum + n, 0) / logged.length)
    : null;
  const left = 42;
  const top = 28;
  const height = 126;
  const width = 545;
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h2>Your scroll, in perspective</h2>
          <p>Small changes. A little more life.</p>
        </div>
        <select
          aria-label="Chart period"
          className="subtle-select"
          value={period}
          onChange={(event) => setPeriod(Number(event.target.value))}
        >
          <option value={0}>Last 7 days</option>
          <option value={1}>Previous 7 days</option>
        </select>
      </div>
      <div className="chart-summary">
        <strong>
          {average === null ? "—" : average}
          <span> min / day</span>
        </strong>
        <span className="chart-legend">
          <i /> Scroll time <i className="goal" /> Your {data.viewer.goal}m goal
        </span>
      </div>
      <svg
        className="time-chart"
        viewBox={`0 0 ${width + 20} 194`}
        role="img"
        aria-label={`Screen time over the last seven days. ${dates.map((date, i) => `${date}: ${values[i] === null ? "not logged" : `${values[i]} minutes`}`).join(". ")}`}
      >
        {[0, Math.round(max / 2), max].map((tick) => {
          const y = top + height - (tick / max) * height;
          return (
            <g key={tick}>
              <line x1={left} y1={y} x2={width} y2={y} stroke="#edf0e9" />
              <text x={left - 10} y={y + 4} textAnchor="end" className="chart-axis">
                {tick}m
              </text>
            </g>
          );
        })}
        <line
          x1={left}
          y1={top + height - (data.viewer.goal / max) * height}
          x2={width}
          y2={top + height - (data.viewer.goal / max) * height}
          stroke="#8fa583"
          strokeDasharray="4 5"
        />
        {dates.map((date, index) => {
          const value = values[index];
          const x = left + 16 + index * 71;
          const barHeight = ((value ?? 0) / max) * height;
          const active = date === data.today;
          return (
            <g key={date}>
              <title>{`${date}: ${value === null ? "not logged" : `${value} minutes`}`}</title>
              {value !== null && (
                <rect
                  x={x}
                  y={top + height - Math.max(3, barHeight)}
                  width={34}
                  height={Math.max(3, barHeight)}
                  rx={5}
                  fill={active ? "#315b45" : "#c8d9b7"}
                />
              )}
              {active && value !== null && (
                <text
                  x={x + 17}
                  y={top + height - barHeight - 9}
                  textAnchor="middle"
                  className="chart-value"
                >
                  {value}m
                </text>
              )}
              <text
                x={x + 17}
                y={180}
                textAnchor="middle"
                className={`chart-axis${active ? " today" : ""}`}
              >
                {new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
                  weekday: "short",
                  timeZone: "UTC",
                })}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="chart-note">
        <span>
          <Leaf size={14} />{" "}
          {logged.length
            ? `${logged.length} of 7 days checked in`
            : "Your first check-in is the start of something good"}
        </span>
        <span>Self-reported · UTC days</span>
      </div>
    </section>
  );
}

export function LeaderboardPanel({
  data,
  onOpen,
}: {
  data: Dashboard;
  onOpen: (challenge: Challenge) => void;
}) {
  const [selected, setSelected] = useState("");
  const groups = data.challenges.filter((group) => challengeStatus(group, data.today) === "active");
  const group = groups.find((item) => item.id === selected) ?? groups[0];
  const leaders = group ? leaderboard(group, data.usage, data.today) : [];
  return (
    <section className="panel leaderboard-panel">
      <div className="panel-heading">
        <div>
          <h2>
            <Trophy size={18} /> A little friendly competition
          </h2>
          <p>Less scrolling moves you up.</p>
        </div>
      </div>
      {group ? (
        <>
          <select
            className="leaderboard-select"
            aria-label="Leaderboard challenge"
            value={group.id}
            onChange={(event) => setSelected(event.target.value)}
          >
            {groups.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
          <div className="leaderboard-list">
            {leaders.slice(0, 4).map((person) => (
              <LeaderRow key={person.id} person={person} viewerId={data.viewer.id} />
            ))}
          </div>
          <button type="button" className="leaderboard-footer" onClick={() => onOpen(group)}>
            View full leaderboard <ArrowRight size={15} />
          </button>
        </>
      ) : (
        <EmptyState
          icon={<Trophy />}
          title="A little competition?"
          description="Start a challenge to see your circle here."
        />
      )}
    </section>
  );
}

export function LeaderRow({
  person,
  viewerId,
}: {
  person: ReturnType<typeof leaderboard>[number];
  viewerId: string;
}) {
  return (
    <div className={`leader-row${person.id === viewerId ? " is-you" : ""}`}>
      <span className={`leader-rank${person.rank === 1 ? " first" : ""}`}>
        {person.rank === 1 ? <Crown size={17} /> : (person.rank ?? "—")}
      </span>
      <Avatar person={person} />
      <span className="leader-person">
        <strong>
          {person.name.split(" ")[0]}{" "}
          {person.id === viewerId && <span className="you-label">you</span>}
        </strong>
        <small>
          {person.rank !== null
            ? `${person.checkedDays}-day average`
            : `${person.checkedDays}/${person.expectedDays} days · unranked`}
        </small>
      </span>
      <span className="leader-time">
        {person.average === null ? "—" : `${Math.round(person.average)}m`}
        <small>/ day</small>
      </span>
    </div>
  );
}

export function ChallengeCard({
  challenge,
  data,
  onOpen,
}: {
  challenge: Challenge;
  data: Dashboard;
  onOpen: () => void;
}) {
  const status = challengeStatus(challenge, data.today);
  const length = daysBetween(challenge.startDate, challenge.endDate) + 1;
  const elapsed = Math.max(0, Math.min(length, daysBetween(challenge.startDate, data.today) + 1));
  const rank = leaderboard(challenge, data.usage, data.today).find(
    (person) => person.id === data.viewer.id,
  )?.rank;
  return (
    <button type="button" className={`challenge-card ${challenge.color}`} onClick={onOpen}>
      <span className="challenge-top">
        <span className="challenge-icon">
          {challenge.color === "sage" ? (
            <Coffee size={22} />
          ) : challenge.color === "lavender" ? (
            <Sparkles size={22} />
          ) : (
            <Leaf size={22} />
          )}
        </span>
        <span className={`status-pill ${status}`}>
          <i />{" "}
          {status === "active" ? "In progress" : status === "completed" ? "Completed" : "Upcoming"}
        </span>
        <ChevronRight className="challenge-arrow" size={17} />
      </span>
      <h3>{challenge.title}</h3>
      <span className="challenge-meta">
        <Users size={13} /> {challenge.members.length}{" "}
        {challenge.members.length === 1 ? "person" : "friends"}
        <span>·</span>
        {length} days
      </span>
      <span className="challenge-reward">
        <Gift size={17} />
        <span>
          <small>PLAYING FOR</small>
          <strong>{challenge.reward}</strong>
        </span>
      </span>
      <span className="challenge-progress-label">
        <span>{status === "completed" ? "Challenge complete" : `Day ${elapsed} of ${length}`}</span>
        <span>
          {status === "active" ? `${daysBetween(data.today, challenge.endDate) + 1} days left` : ""}
        </span>
      </span>
      <progress value={elapsed} max={length} aria-label={`${elapsed} of ${length} days`} />
      <span className="challenge-bottom">
        <AvatarStack people={challenge.members} max={3} />
        <span>
          {rank ? (
            <>
              <Trophy size={12} /> You’re #{rank}
            </>
          ) : (
            "You’re in. Let’s go."
          )}
        </span>
      </span>
    </button>
  );
}

export function ChallengesSection({
  data,
  onCreate,
  onOpen,
  full = false,
}: {
  data: Dashboard;
  onCreate: () => void;
  onOpen: (challenge: Challenge) => void;
  full?: boolean;
}) {
  const [filter, setFilter] = useState("active");
  const active = data.challenges.filter((group) => challengeStatus(group, data.today) === "active");
  const completed = data.challenges.filter(
    (group) => challengeStatus(group, data.today) === "completed",
  );
  const groups = filter === "active" ? active : completed;
  return (
    <section className="challenges-section">
      <div className="section-heading">
        <div>
          <h2>{full ? "Your challenges" : "A little less scrolling, together"}</h2>
          <p>Good company. A shared goal. Something worth winning.</p>
        </div>
        <button type="button" className="button secondary" onClick={onCreate}>
          <Plus size={16} /> Create challenge
        </button>
      </div>
      <fieldset className="section-tabs">
        <legend className="sr-only">Challenge filter</legend>
        <button
          type="button"
          className={filter === "active" ? "selected" : ""}
          aria-pressed={filter === "active"}
          onClick={() => setFilter("active")}
        >
          Active <span>{active.length}</span>
        </button>
        <button
          type="button"
          className={filter === "completed" ? "selected" : ""}
          aria-pressed={filter === "completed"}
          onClick={() => setFilter("completed")}
        >
          Completed <span>{completed.length}</span>
        </button>
      </fieldset>
      {groups.length ? (
        <div className="challenge-grid">
          {groups.slice(0, full ? 50 : 3).map((group) => (
            <ChallengeCard
              key={group.id}
              challenge={group}
              data={data}
              onOpen={() => onOpen(group)}
            />
          ))}
        </div>
      ) : (
        <div className="panel">
          <EmptyState
            icon={<Target />}
            title={
              filter === "active"
                ? "Every good change starts somewhere."
                : "Good things take a little time."
            }
            description={
              filter === "active"
                ? "Bring your friends together for your first screen-time challenge."
                : "Your finished challenges and results will appear here."
            }
            action={filter === "active" ? "Create your first challenge" : undefined}
            onAction={onCreate}
          />
        </div>
      )}
      {!full && groups.length > 3 && (
        <p className="section-hint">And {groups.length - 3} more in your Challenges tab.</p>
      )}
    </section>
  );
}

export function OfflineWins({
  data,
  onBreak,
  onLog,
}: {
  data: Dashboard;
  onBreak: () => void;
  onLog: () => void;
}) {
  const friends = new Map<string, Person>(
    data.challenges.flatMap((group) => group.members).map((person) => [person.id, person]),
  );
  friends.set(data.viewer.id, data.viewer);
  const wins = data.usage
    .filter((entry) => entry.note && friends.has(entry.userId))
    .toSorted((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 3);
  return (
    <div className="bottom-grid">
      <section className="panel wins-panel">
        <div className="panel-heading">
          <div>
            <h2>
              Life beyond the feed{" "}
              <span className="little-spark">
                <Sparkles size={16} />
              </span>
            </h2>
            <p>Your circle’s little offline wins.</p>
          </div>
          <button className="text-button" type="button" onClick={onLog}>
            Share a win <ArrowUpRight size={14} />
          </button>
        </div>
        {wins.length ? (
          <div className="win-list">
            {wins.map((entry) => {
              const person = friends.get(entry.userId) ?? data.viewer;
              return (
                <div className="win-row" key={`${entry.userId}-${entry.date}`}>
                  <Avatar person={person} />
                  <div>
                    <strong>
                      {person.name.split(" ")[0]}
                      <small>{entry.date === data.today ? "Today" : entry.date}</small>
                    </strong>
                    <p>{entry.note}</p>
                  </div>
                  <span className="win-leaf">
                    <Leaf size={15} />
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Leaf />}
            title="What did you do instead?"
            description="Add an offline win to your check-in. Give your friends a little inspiration."
          />
        )}
      </section>
      <section className="offline-card">
        <span className="eyebrow">A GENTLE REMINDER</span>
        <h2>
          There’s a whole world
          <br />
          outside your screen.
        </h2>
        <p>Take a breath. Take a break. Go be in it.</p>
        <OfflineIllustration compact />
        <button type="button" className="button break-button" onClick={onBreak}>
          <Clock3 size={15} /> Take a 10-minute breather <ArrowRight size={15} />
        </button>
      </section>
    </div>
  );
}

export function FriendsView({
  data,
  onInvite,
  onCreate,
}: {
  data: Dashboard;
  onInvite: () => void;
  onCreate: () => void;
}) {
  const friends = [
    ...new Map(
      data.challenges
        .flatMap((group) => group.members)
        .filter((person) => person.id !== data.viewer.id)
        .map((person) => [person.id, person]),
    ).values(),
  ];
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>Your people</h2>
          <p>Less time on your phone. More time with them.</p>
        </div>
        <button
          className="button primary"
          type="button"
          onClick={data.challenges.length ? onInvite : onCreate}
        >
          <Plus size={16} /> Invite friends
        </button>
      </div>
      {friends.length ? (
        <div className="friend-grid">
          {friends.map((person) => {
            const groups = data.challenges.filter((group) =>
              group.members.some((member) => member.id === person.id),
            );
            const log = data.usage.find(
              (entry) => entry.userId === person.id && entry.date === data.today,
            );
            return (
              <div className="panel friend-card" key={person.id}>
                <Avatar person={person} />
                <h3>{person.name}</h3>
                <p>
                  {groups.length} shared {groups.length === 1 ? "challenge" : "challenges"}
                </p>
                <span className={`friend-status${log ? " checked" : ""}`}>
                  {log ? <Check size={14} /> : <Clock3 size={14} />}
                  {log ? "Checked in today" : "No check-in today"}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <EmptyState
            icon={<Users />}
            title="Your circle starts with you."
            description="Create a challenge and share the invitation link. Friends join with their own Breli account."
            action="Create a challenge"
            onAction={onCreate}
          />
        </div>
      )}
      <p className="privacy-note">
        <Leaf size={14} /> Only friends in a shared challenge can see each other’s check-ins during
        that challenge.
      </p>
    </section>
  );
}

export function RewardsView({
  data,
  onOpen,
}: {
  data: Dashboard;
  onOpen: (challenge: Challenge) => void;
}) {
  return (
    <section>
      <div className="section-heading">
        <div>
          <h2>Something worth putting your phone down for.</h2>
          <p>Not points. Not pixels. Real things, from your real friends.</p>
        </div>
      </div>
      {data.challenges.length ? (
        <div className="reward-grid">
          {data.challenges.map((group) => {
            const status = challengeStatus(group, data.today);
            const rank = leaderboard(group, data.usage, data.today).find(
              (person) => person.id === data.viewer.id,
            )?.rank;
            const earned =
              status === "completed" &&
              isFinal(group, data.today) &&
              rank === 1 &&
              group.members.length > 1;
            return (
              <button
                className={`panel reward-card ${group.color}`}
                key={group.id}
                type="button"
                onClick={() => onOpen(group)}
              >
                <span className="reward-big-icon">
                  {earned ? <Trophy size={35} /> : <Gift size={35} />}
                </span>
                <span className={`status-pill${earned ? " active" : ""}`}>
                  {earned
                    ? "You earned this"
                    : status === "active"
                      ? "Up for grabs"
                      : isFinal(group, data.today)
                        ? "Results are in"
                        : "Results settling"}
                </span>
                <h3>{group.reward}</h3>
                <p>{group.title}</p>
                <span className="reward-link">
                  {status === "active" ? "View challenge" : "View results"} <ArrowRight size={15} />
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="panel">
          <EmptyState
            icon={<Gift />}
            title="Make it meaningful."
            description="Choose a reward when you create a challenge. A coffee, a shared adventure, or a cause you care about."
          />
        </div>
      )}
      <p className="privacy-note">
        <Gift size={14} /> Rewards are promises between friends, fulfilled offline. Offscroll
        doesn’t collect money or process payouts.
      </p>
    </section>
  );
}
