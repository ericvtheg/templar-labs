export type Color = "sage" | "lavender" | "peach";
export type Person = { id: string; name: string };
export type Profile = Person & { goal: number; baseline: number };
export type Challenge = {
  id: string;
  title: string;
  reward: string;
  startDate: string;
  endDate: string;
  goal: number;
  color: Color;
  creatorId: string;
  inviteToken: string;
  members: Person[];
};
export type Usage = {
  userId: string;
  date: string;
  instagram: number;
  tiktok: number;
  youtube: number;
  other: number;
  note: string;
  updatedAt: number;
};
export type Dashboard = {
  mode: "demo" | "live";
  today: string;
  viewer: Profile;
  challenges: Challenge[];
  usage: Usage[];
};
export type Leader = Person & {
  average: number | null;
  checkedDays: number;
  expectedDays: number;
  rank: number | null;
};
export type Invite = {
  title: string;
  reward: string;
  startDate: string;
  endDate: string;
  goal: number;
  memberCount: number;
  owner: string;
};

export function utcDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return utcDate(value);
}

export function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000,
  );
}

export function datesBetween(start: string, end: string): string[] {
  return Array.from({ length: Math.max(0, daysBetween(start, end) + 1) }, (_, i) =>
    addDays(start, i),
  );
}

export function totalMinutes(entry: Usage): number {
  return entry.instagram + entry.tiktok + entry.youtube + entry.other;
}

export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  if (rounded < 60) {
    return `${rounded}m`;
  }
  const remainder = rounded % 60;
  return `${Math.floor(rounded / 60)}h${remainder ? ` ${remainder}m` : ""}`;
}

export function challengeStatus(
  challenge: Pick<Challenge, "startDate" | "endDate">,
  today: string,
) {
  if (today < challenge.startDate) {
    return "upcoming";
  }
  return today <= challenge.endDate ? "active" : "completed";
}

export function isFinal(challenge: Pick<Challenge, "endDate">, today: string): boolean {
  return today > addDays(challenge.endDate, 1);
}

function eligible(row: Pick<Leader, "expectedDays" | "checkedDays">): boolean {
  return row.expectedDays > 0 && row.checkedDays === row.expectedDays;
}

// Compare closed UTC days only. Missing check-ins never count as zero screen time.
export function leaderboard(challenge: Challenge, entries: Usage[], today: string): Leader[] {
  const yesterday = addDays(today, -1);
  const through = challenge.endDate < yesterday ? challenge.endDate : yesterday;
  const dates = new Set(datesBetween(challenge.startDate, through));
  const rows = challenge.members.map((person) => {
    const logs = entries.filter((entry) => entry.userId === person.id && dates.has(entry.date));
    const checkedDays = new Set(logs.map((entry) => entry.date)).size;
    const total = logs.reduce((sum, entry) => sum + totalMinutes(entry), 0);
    return {
      ...person,
      checkedDays,
      expectedDays: dates.size,
      total,
      average: checkedDays ? total / checkedDays : null,
      rank: null as number | null,
    };
  });
  const sortedRows = rows.toSorted((a, b) => {
    if (eligible(a) !== eligible(b)) {
      return eligible(a) ? -1 : 1;
    }
    return eligible(a)
      ? a.total - b.total || a.name.localeCompare(b.name)
      : b.checkedDays - a.checkedDays || a.name.localeCompare(b.name);
  });
  let previousTotal = -1;
  let previousRank = 0;
  return sortedRows.map((row, index) => {
    const rank = eligible(row) ? (row.total === previousTotal ? previousRank : index + 1) : null;
    if (rank !== null) {
      previousTotal = row.total;
      previousRank = rank;
    }
    const { total: _total, ...leader } = row;
    return { ...leader, rank };
  });
}

export function streak(entries: Usage[], goal: number, today: string): number {
  const byDate = new Map(entries.map((entry) => [entry.date, totalMinutes(entry)]));
  let date = byDate.has(today) ? today : addDays(today, -1);
  let count = 0;
  while (byDate.has(date) && (byDate.get(date) ?? goal + 1) <= goal) {
    count += 1;
    date = addDays(date, -1);
  }
  return count;
}

export function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "O"
  );
}

export function personColor(id: string): number {
  return [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 6;
}

export function visibleUsage(viewerId: string, groups: Challenge[], entries: Usage[]): Usage[] {
  return entries.filter(
    (entry) =>
      entry.userId === viewerId ||
      groups.some(
        (group) =>
          group.members.some((member) => member.id === entry.userId) &&
          entry.date >= group.startDate &&
          entry.date <= group.endDate,
      ),
  );
}

export function canEditUsage(groups: Challenge[], date: string, today: string): boolean {
  return (
    date <= today &&
    date >= addDays(today, -30) &&
    !groups.some(
      (group) => isFinal(group, today) && date >= group.startDate && date <= group.endDate,
    )
  );
}
