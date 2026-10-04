import { z } from "zod";
import { addDays, type Challenge, type Dashboard, type Usage, utcDate } from "./model.ts";
import { challengeInput, dateInput, profileInput, usageInput } from "./validation.ts";

export function createDemo(today = utcDate()): Dashboard {
  const people = [
    { id: "jamie", name: "Jamie Parker" },
    { id: "alex", name: "Alex Rivera" },
    { id: "maya", name: "Maya Chen" },
    { id: "sam", name: "Sam Wilson" },
    { id: "jules", name: "Jules Martin" },
    { id: "leo", name: "Leo Davis" },
  ];
  const challenges: Challenge[] = [
    {
      id: "weekly",
      title: "The weekly unplug",
      reward: "Coffee on the crew",
      startDate: addDays(today, -4),
      endDate: addDays(today, 2),
      goal: 45,
      color: "sage",
      creatorId: "jamie",
      inviteToken: "demo",
      members: people.slice(0, 5),
    },
    {
      id: "weekend",
      title: "Less feed, more friends",
      reward: "Pick our next adventure",
      startDate: addDays(today, -2),
      endDate: addDays(today, 11),
      goal: 60,
      color: "lavender",
      creatorId: "alex",
      inviteToken: "demo",
      members: people.slice(0, 3).concat(people.slice(5)),
    },
    {
      id: "reset",
      title: "The 30-day reset",
      reward: "Dinner’s on the rest of us",
      startDate: addDays(today, -9),
      endDate: addDays(today, 20),
      goal: 45,
      color: "peach",
      creatorId: "sam",
      inviteToken: "demo",
      members: people.slice(0, 2).concat(people.slice(3)),
    },
    {
      id: "brunch",
      title: "A weekend well spent",
      reward: "Sunday brunch, your pick",
      startDate: addDays(today, -23),
      endDate: addDays(today, -17),
      goal: 45,
      color: "sage",
      creatorId: "maya",
      inviteToken: "demo",
      members: people.slice(0, 3),
    },
  ];
  const notes: Record<string, string> = {
    alex: "Finally finished that book on my nightstand.",
    maya: "A sunset walk beats a scroll every time.",
    sam: "Made pasta from scratch. Worth every minute.",
    jamie: "Coffee with a friend. Phone stayed in my bag.",
  };
  const usage: Usage[] = [];
  for (const [index, person] of people.entries()) {
    for (let day = -28; day <= 0; day += 1) {
      const total =
        person.id === "jamie"
          ? day < -16
            ? 22
            : ([65, 44, 38, 44, 30, 44, 42][(day + 34) % 7] ?? 42)
          : 24 + index * 7 + ((day + 28) % 3) * 4;
      usage.push({
        userId: person.id,
        date: addDays(today, day),
        instagram: Math.round(total * 0.45),
        tiktok: Math.round(total * 0.2),
        youtube: Math.round(total * 0.25),
        other:
          total - Math.round(total * 0.45) - Math.round(total * 0.2) - Math.round(total * 0.25),
        note: day === 0 ? (notes[person.id] ?? "") : "",
        updatedAt: Date.parse(`${today}T12:00:00Z`) - index * 3_600_000,
      });
    }
  }
  return {
    mode: "demo",
    today,
    viewer: { id: "jamie", name: "Jamie Parker", goal: 45, baseline: 120 },
    challenges,
    usage,
  };
}

export const demoStorageKey = "offscroll-preview-v1";
const personInput = z.object({ id: z.string().min(1), name: z.string().min(1) });
const previewInput = z.object({
  mode: z.literal("demo"),
  today: dateInput,
  viewer: personInput.extend(profileInput.shape),
  challenges: z
    .array(
      z.object({
        ...challengeInput.omit({ duration: true }).shape,
        id: z.string().min(1),
        creatorId: z.string(),
        inviteToken: z.string(),
        startDate: dateInput,
        endDate: dateInput,
        members: z.array(personInput).max(32),
      }),
    )
    .max(50),
  usage: z
    .array(usageInput.and(z.object({ userId: z.string(), updatedAt: z.number().finite() })))
    .max(10000),
});

export function restoreDemo(value: string | null, fallback: Dashboard): Dashboard {
  if (!value) {
    return fallback;
  }
  try {
    const result = previewInput.safeParse(JSON.parse(value));
    // A preview is day-scoped and never replaces authenticated account data.
    if (
      result.success &&
      result.data.today === fallback.today &&
      result.data.viewer.id === "jamie"
    ) {
      return result.data;
    }
  } catch {
    return fallback;
  }
  return fallback;
}
