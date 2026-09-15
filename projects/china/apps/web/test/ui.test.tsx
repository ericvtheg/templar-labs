// @vitest-environment jsdom
import { Blob as NodeBlob } from "node:buffer";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { China } from "../src/components/China.tsx";
import { MissionExperience } from "../src/components/MissionExperience.tsx";
import { PriceDetective } from "../src/components/PriceDetective.tsx";
import { VoicePractice } from "../src/components/VoicePractice.tsx";
import { crew, crewRoles, fieldNotes, groom, missions } from "../src/lib/curriculum.ts";
import type { TripData } from "../src/lib/types.ts";

const fixture: TripData = {
  user: { id: "gavin", name: "Gavin" },
  groom,
  crew,
  crewRoles,
  missions,
  fieldNotes,
  completed: [],
  mastery: [],
  board: [{ id: "gavin", name: "Gavin", completed: 0 }],
  activity: [],
};
const audioPlay = vi.fn();
beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
  audioPlay.mockResolvedValue(undefined);
  class AudioMock extends EventTarget {
    src: string;
    constructor(src: string) {
      super();
      this.src = src;
    }
    play = audioPlay;
    pause() {
      this.dispatchEvent(new Event("pause"));
    }
    removeAttribute() {
      /* Audio test double has no DOM attributes. */
    }
    load() {
      /* Audio test double performs no network requests. */
    }
  }
  vi.stubGlobal("Audio", AudioMock);
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    cancel: vi.fn(),
    speak: vi.fn(),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(async () => Response.json(fixture)),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
describe("interactive beginner clubhouse", () => {
  it("includes Eric as groom and saves his real name", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      Response.json({ ...fixture, user: { id: "owner", name: "" } }),
    );
    render(<China />);
    fireEvent.click(await screen.findByRole("button", { name: "Eric · Groom" }));
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("Eric");
    fireEvent.click(screen.getByRole("button", { name: "Let’s get into it →" }));
    await waitFor(() =>
      expect(
        vi
          .mocked(fetch)
          .mock.calls.some(
            ([url, options]) =>
              String(url).endsWith("profile") && JSON.parse(String(options?.body)).name === "Eric",
          ),
      ).toBe(true),
    );
  });
  it("does not leak crew or lesson data through the signed-out gate", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      Response.json({ error: "Sign in." }, { status: 401 }),
    );
    render(<China />);
    expect(await screen.findByRole("link", { name: /Continue with Google/ })).toBeTruthy();
    expect(screen.queryByText("Gavin")).toBeNull();
    expect(screen.queryByText(missions[0]?.title ?? "")).toBeNull();
  });
  it("teaches characters before sounds and explains hello’s tone change", async () => {
    render(<China />);
    fireEvent.click(await screen.findByRole("button", { name: /Start from absolute zero/ }));
    expect(screen.getByText("Your first Chinese words.")).toBeTruthy();
    expect(screen.queryByText("Two characters. Read left → right.")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Let’s begin/ }));
    expect(screen.getByRole("heading", { name: "Two shapes, one greeting." })).toBeTruthy();
    expect(screen.getByText("you", { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Next: hear it/ }));
    expect(screen.getByText("Tap a piece. Hear what it does.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Next: tones/ }));
    expect(screen.getByText("Your voice changes the word.")).toBeTruthy();
    expect(screen.getByText("ní hǎo", { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Next: try it/ }));
    fireEvent.click(screen.getByRole("button", { name: "你" }));
    expect(screen.getByText(/You just read your first Chinese character/)).toBeTruthy();
  });
  it("remixes flashcards, listening and speaking without requiring Chinese typing", async () => {
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith("answer")
        ? Response.json({ correct: true, completed: false })
        : Response.json(fixture),
    );
    const mission = missions.find((item) => item.id === "arrival");
    if (!mission) {
      throw new Error("Missing arrival chapter");
    }
    render(
      <MissionExperience
        mission={mission}
        mastery={[]}
        completed={false}
        completedCount={0}
        onBack={() => undefined}
        onRefresh={async () => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Let’s begin/ }));
    fireEvent.click(screen.getByRole("button", { name: "Flip phrase card" }));
    fireEvent.click(screen.getByRole("button", { name: /Try it from memory/ }));
    const choices = document.querySelector(".encounter-choices");
    if (!choices) {
      throw new Error("Missing phrase choices");
    }
    fireEvent.click(within(choices as HTMLElement).getAllByRole("button")[0] as HTMLButtonElement);
    expect(await screen.findByText("That gets the message across.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "▶ Listen" }));
    expect(
      new URL(
        (audioPlay.mock.contexts.at(-1) as { src: string }).src,
        "https://china.example",
      ).searchParams.get("text"),
    ).toBe("厕所在哪里？");
    fireEvent.click(screen.getByRole("button", { name: "▶ Slower" }));
    expect(
      new URL(
        (audioPlay.mock.contexts.at(-1) as { src: string }).src,
        "https://china.example",
      ).searchParams.get("speed"),
    ).toBe("slow");
    expect(screen.queryByRole("textbox")).toBeNull();
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /What happens next/ }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: /What happens next/ }));
    expect(screen.queryByText("What did you hear?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Try it by ear/ }));
    expect(screen.getByText("What did you hear?")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: mission.phrases[1]?.english ?? "Missing phrase" }),
    );
    await screen.findByText("That gets the message across.");
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /What happens next/ }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: /What happens next/ }));
    fireEvent.click(screen.getByRole("button", { name: /My turn to say it/ }));
    expect(screen.getByRole("button", { name: "● Record yourself" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /No microphone/ }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "▶ Listen" })).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Lesson encounters" })).toBeNull();
  });
  it("provides sign matching and AI conversation within the lesson", async () => {
    const mission = missions[0];
    if (!mission) {
      throw new Error("Missing basics chapter");
    }
    const resumed = {
      ...fixture,
      mastery: mission.phrases.map((_, task) => ({
        mission_id: mission.id,
        task,
        level: 1,
        due: 0,
      })),
    };
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith("match")
        ? Response.json({ correct: true, completed: true })
        : Response.json(resumed),
    );
    render(<China />);
    fireEvent.click(await screen.findByRole("button", { name: /Start from absolute zero/ }));
    fireEvent.click(screen.getByRole("button", { name: /Let’s begin/ }));
    expect(screen.queryByText("CHINESE, FROM LITERALLY ZERO")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Hide the English/ }));
    for (const card of mission.matches ?? []) {
      fireEvent.click(screen.getByRole("button", { name: card.hanzi }));
      fireEvent.click(screen.getByRole("button", { name: card.english }));
    }
    await screen.findByText(/Sign encounter saved/);
    await waitFor(() =>
      expect(
        (screen.getByRole("button", { name: /What happens next/ }) as HTMLButtonElement).disabled,
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: /What happens next/ }));
    expect(screen.getByRole("button", { name: /Deal me a situation/ })).toBeTruthy();
    expect(screen.queryByText("Can you catch anything in the wild?")).toBeNull();
  });
  it("never requests typing during spaced review", async () => {
    vi.mocked(fetch).mockImplementation(async () =>
      Response.json({ ...fixture, mastery: [{ mission_id: "basics", task: 0, level: 1, due: 0 }] }),
    );
    render(<China />);
    fireEvent.click(await screen.findByRole("button", { name: /Keep it fresh/ }));
    const choice = document.querySelector<HTMLButtonElement>(".review-list button");
    if (!choice) {
      throw new Error("Missing due review");
    }
    fireEvent.click(choice);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByText(/type pinyin|text recall/i)).toBeNull();
    expect(screen.getByRole("button", { name: "▶ Listen" })).toBeTruthy();
  });
  it("keeps emergency phrases available and social progress honest", async () => {
    render(<China />);
    fireEvent.click(await screen.findByRole("button", { name: /Pocket guide/ }));
    expect(screen.getByRole("link", { name: /120 Ambulance/ }).getAttribute("href")).toBe(
      "tel:120",
    );
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ambulance" } });
    expect(screen.getByText("Please call an ambulance.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Keep it fresh/ }));
    expect(screen.getByText("Give your brain something to forget.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /The boys/ }));
    expect(screen.getByText(/Quiet in here/)).toBeTruthy();
  });
});
describe("price understanding", () => {
  it("distinguishes per-item and per-person prices from the total", () => {
    render(<PriceDetective />);
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "¥35" }));
    expect(screen.getByRole("status").textContent).toContain("total is ¥105");
    fireEvent.click(screen.getByRole("button", { name: "¥105" }));
    expect(screen.getByRole("status").textContent).toContain("Exactly");
    fireEvent.click(screen.getByRole("button", { name: /Another price situation/ }));
    expect(screen.getByText("每人")).toBeTruthy();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "¥320" }).getAttribute("aria-pressed")).toBe("false");
  });
});
describe("voice practice", () => {
  it("checks a spoken lesson reply directly without a keyboard or transcript-editing step", async () => {
    const mission = missions.find((item) => item.id === "arrival");
    const phrase = mission?.phrases[2];
    if (!mission || !phrase) {
      throw new Error("Missing speaking encounter");
    }
    vi.stubGlobal("Blob", NodeBlob);
    const NativeURL = URL;
    vi.stubGlobal(
      "URL",
      class extends NativeURL {
        static override createObjectURL() {
          return "blob:test-recording";
        }
        static override revokeObjectURL() {
          /* Test-only URL. */
        }
      },
    );
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) },
    });
    class Recorder extends EventTarget {
      state = "inactive";
      mimeType = "audio/webm";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.ondataavailable?.({ data: new Blob(["test-voice"], { type: this.mimeType }) });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", Recorder);
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith("transcribe")
        ? Response.json({ text: phrase.hanzi })
        : Response.json({ correct: true, completed: false }),
    );
    render(
      <MissionExperience
        mission={mission}
        mastery={[0, 1].map((task) => ({ mission_id: mission.id, task, level: 1, due: 0 }))}
        completed={false}
        completedCount={0}
        onBack={() => undefined}
        onRefresh={async () => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Let’s begin/ }));
    fireEvent.click(screen.getByRole("button", { name: /My turn to say it/ }));
    fireEvent.click(screen.getByRole("button", { name: "● Record yourself" }));
    fireEvent.click(await screen.findByRole("button", { name: "■ Stop recording" }));
    fireEvent.click(await screen.findByRole("button", { name: /Check what I said/ }));
    expect(await screen.findByText("That gets the message across.")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, options]) =>
            String(url).endsWith("answer") &&
            JSON.parse(String(options?.body)).answer === phrase.hanzi,
        ),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "▶ Listen" })).toBeTruthy();
  });
  it("tries ElevenLabs first and only offers device speech as an explicit fallback", async () => {
    audioPlay.mockRejectedValue(new Error("Unavailable"));
    render(<VoicePractice text="你好。" />);
    fireEvent.click(screen.getByRole("button", { name: "▶ Listen" }));
    expect(await screen.findByText(/ElevenLabs audio couldn’t play/)).toBeTruthy();
    expect(speechSynthesis.speak).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Use device voice instead" }));
    expect(screen.getByText(/No Mandarin device voice is installed/)).toBeTruthy();
  });
  it("handles denied microphone permission", async () => {
    vi.stubGlobal("MediaRecorder", vi.fn());
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockRejectedValue(new Error("Denied")) },
    });
    render(<VoicePractice text="你好。" />);
    fireEvent.click(screen.getByRole("button", { name: "● Record yourself" }));
    expect(await screen.findByText(/Microphone unavailable or permission denied/)).toBeTruthy();
  });
  it("stops every microphone track on navigation", async () => {
    const stop = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] }) },
    });
    class Recorder extends EventTarget {
      state = "inactive";
      onstop: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", Recorder);
    const { unmount } = render(<VoicePractice text="你好。" />);
    fireEvent.click(screen.getByRole("button", { name: "● Record yourself" }));
    await screen.findByRole("button", { name: "■ Stop recording" });
    unmount();
    await waitFor(() => expect(stop).toHaveBeenCalled());
  });
});
