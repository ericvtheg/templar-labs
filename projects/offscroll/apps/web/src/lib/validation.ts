import { z } from "zod";

export const dateInput = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Choose a valid date.");
const minutes = z.number().int().min(0).max(1440);

export const usageInput = z
  .object({
    date: dateInput,
    instagram: minutes,
    tiktok: minutes,
    youtube: minutes,
    other: minutes,
    note: z.string().trim().max(160),
  })
  .refine(
    (input) => input.instagram + input.tiktok + input.youtube + input.other <= 1440,
    "Screen time cannot exceed 24 hours in one day.",
  );

export const challengeInput = z.object({
  title: z.string().trim().min(3, "Give your challenge a name (at least 3 characters).").max(60),
  reward: z.string().trim().min(3, "Choose a reward that matters to your group.").max(120),
  duration: z.union([z.literal(7), z.literal(14), z.literal(30)]),
  goal: z.number().int().min(5).max(240),
  color: z.enum(["sage", "lavender", "peach"]),
});
export const profileInput = z.object({
  goal: z.number().int().min(5).max(240),
  baseline: z.number().int().min(5).max(1440),
});
export const inviteInput = z.object({ token: z.string().regex(/^[a-f0-9]{48}$/) });
export type UsageInput = z.infer<typeof usageInput>;
export type ChallengeInput = z.infer<typeof challengeInput>;
export type ProfileInput = z.infer<typeof profileInput>;
