// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { China } from "../src/components/China.tsx";
import { VoicePractice } from "../src/components/VoicePractice.tsx";
import { crew, fieldNotes, groom, missions } from "../src/lib/curriculum.ts";
import type { TripData } from "../src/lib/types.ts";

const fixture: TripData = {
  user: { id: "gavin", name: "Gavin" },
  groom,
  crew,
  missions,
  fieldNotes,
  completed: [],
  mastery: [],
  board: [{ id: "gavin", name: "Gavin", completed: 0 }],
  activity: [],
};
beforeEach(() => {
  vi.stubGlobal("speechSynthesis", {
    getVoices: () => [],
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    cancel: vi.fn(),
    speak: vi.fn(),
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(fixture)));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("beginner clubhouse", () => {
  it("includes Eric as the groom in onboarding and saves his actual name", async () => {
    vi.mocked(fetch).mockResolvedValue(
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
  it("shows only the invite gate when signed out", async () => {
    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: "Sign in with an invited Google account." }, { status: 401 }),
    );
    render(<China />);
    expect(await screen.findByRole("link", { name: /Continue with Google/ })).toBeTruthy();
    expect(screen.queryByText("Gavin")).toBeNull();
    expect(screen.queryByText(missions[0]?.title ?? "")).toBeNull();
  });
  it("starts with pinyin and tones, and never requires Chinese typing from a novice", async () => {
    render(<China />);
    fireEvent.click(await screen.findByRole("button", { name: /Start from absolute zero/ }));
    expect(screen.getByText("CHINESE, FROM LITERALLY ZERO")).toBeTruthy();
    expect(screen.getByText("Your voice changes the word.")).toBeTruthy();
    expect(screen.getByText("Hello.")).toBeTruthy();
    for (let index = 0; index < 3; index++) {
      fireEvent.click(screen.getByRole("button", { name: /I’ve said it. Next/ }));
    }
    expect(screen.getByText("BEFORE THE SIGN CHECK")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Try the mission check/ }));
    expect(screen.getByText("RECOGNITION CHECK")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    const answer = screen.getByRole("button", { name: /你好/ });
    vi.mocked(fetch).mockImplementation(async (input) =>
      String(input).endsWith("answer")
        ? Response.json({ correct: true, completed: false })
        : Response.json(fixture),
    );
    fireEvent.click(answer);
    expect(await screen.findByText("That’s the one. 好!")).toBeTruthy();
    expect(
      vi
        .mocked(fetch)
        .mock.calls.some(
          ([url, options]) =>
            String(url).endsWith("answer") && JSON.parse(String(options?.body)).answer === "你好。",
        ),
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next check →" }));
    expect(screen.getByText("LISTENING CHECK")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "No audio? Show text hint" }));
    expect(screen.getByText("谢谢。")).toBeTruthy();
  });
  it("keeps emergency phrases unlocked and shows honest empty social/review states", async () => {
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
    expect(screen.queryByText("Rolo passed")).toBeNull();
  });
});
describe("voice practice degrades honestly and releases the mic", () => {
  it("explains missing Mandarin voices without reading Chinese in an English voice", () => {
    render(<VoicePractice text="你好。" />);
    fireEvent.click(screen.getByRole("button", { name: "▶ Listen" }));
    expect(screen.getByRole("status").textContent).toContain("No Mandarin voice is installed");
    expect(speechSynthesis.speak).not.toHaveBeenCalled();
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
  it("stops all tracks when navigating away from an active recording", async () => {
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
