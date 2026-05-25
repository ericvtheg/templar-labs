import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@templar/ui/components/button";
import { Input } from "@templar/ui/components/input";
import { Label } from "@templar/ui/components/label";
import { Textarea } from "@templar/ui/components/textarea";
import { ArrowRightIcon, ShieldCheckIcon } from "lucide-react";
import { type SyntheticEvent, useCallback, useEffect, useId, useState, useTransition } from "react";
import {
  initialPeoplePlaceholderNames,
  MAX_VISIBLE_PEOPLE_PLACEHOLDERS,
  nextPeoplePlaceholderNames,
} from "../lib/people-placeholders.ts";
import { createTrip } from "../lib/trip-server-functions.ts";

export const Route = createFileRoute("/")({
  component: Home,
});

const tripNamePlaceholders = [
  "Tulum Trip",
  "Mexico Bachelor Trip",
  "Kimi & Skylar Wedding",
  "Costa Rica Trip",
  "Sweden Midsommar Trip",
  "Basslake 4th of July Trip",
  "Dan Handler Sponsored Hawaii Trip",
] as const;

const PEOPLE_PLACEHOLDER_SLIDE_MS = 420;
const PEOPLE_PLACEHOLDER_BUFFER_ROWS = MAX_VISIBLE_PEOPLE_PLACEHOLDERS;
const PEOPLE_PLACEHOLDER_VISIBLE_ROWS = 4;

function Home() {
  const tripNameId = useId();
  const participantNamesId = useId();
  const navigate = useNavigate();
  const createTripFn = useServerFn(createTrip);
  const [tripName, setTripName] = useState("");
  const [tripNamePlaceholderIndex, setTripNamePlaceholderIndex] = useState(0);
  const [peoplePlaceholderNames, setPeoplePlaceholderNames] = useState(() =>
    initialPeoplePlaceholderNames().slice(0, PEOPLE_PLACEHOLDER_BUFFER_ROWS),
  );
  const [peoplePlaceholderSlideState, setPeoplePlaceholderSlideState] = useState<
    "idle" | "primed" | "sliding"
  >("idle");
  const [participantNames, setParticipantNames] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const tripNamePlaceholder = tripNamePlaceholders[tripNamePlaceholderIndex];
  const visiblePeoplePlaceholderNames = peoplePlaceholderNames.slice(
    0,
    PEOPLE_PLACEHOLDER_VISIBLE_ROWS,
  );
  const peoplePlaceholder = visiblePeoplePlaceholderNames.join("\n");
  const settlePeoplePlaceholderSlide = useCallback(() => {
    setPeoplePlaceholderNames((currentNames) =>
      currentNames.slice(0, PEOPLE_PLACEHOLDER_BUFFER_ROWS),
    );
    setPeoplePlaceholderSlideState("idle");
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setPeoplePlaceholderNames((currentNames) => {
        if (currentNames.length > PEOPLE_PLACEHOLDER_BUFFER_ROWS) {
          return currentNames;
        }

        const nextNames = nextPeoplePlaceholderNames(currentNames);
        const incomingName = nextNames[0];

        if (incomingName === undefined || incomingName === currentNames[0]) {
          return currentNames;
        }

        setPeoplePlaceholderSlideState("primed");
        return [incomingName, ...currentNames];
      });
    }, 1800);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (peoplePlaceholderSlideState !== "primed") {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      setPeoplePlaceholderSlideState("sliding");
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [peoplePlaceholderSlideState]);

  useEffect(() => {
    if (peoplePlaceholderSlideState !== "sliding") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      settlePeoplePlaceholderSlide();
    }, PEOPLE_PLACEHOLDER_SLIDE_MS + 80);

    return () => window.clearTimeout(timeoutId);
  }, [peoplePlaceholderSlideState, settlePeoplePlaceholderSlide]);

  useEffect(() => {
    setTripNamePlaceholderIndex(Math.floor(Math.random() * tripNamePlaceholders.length));
  }, []);

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = tripName.trim();

    if (name.length === 0) {
      setError("Trip name is required.");
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await createTripFn({
          data: {
            name,
            participantNames: participantNames
              .split(/\n|,/)
              .map((participantName) => participantName.trim())
              .filter((participantName) => participantName.length > 0),
          },
        });

        await navigate({
          to: "/trip/$slug",
          params: {
            slug: result.slug,
          },
        });
      } catch {
        setError("Could not create the trip.");
      }
    });
  };

  return (
    <main className="cardiff-shell">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 py-2">
          <div className="flex items-center gap-3">
            <Link
              aria-label="Go to Cardiff Split home"
              className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-[#126C5A]/50"
              to="/"
            >
              <img
                alt="Cardiff Split"
                className="size-11 rounded-xl shadow-sm"
                src="/cardiff-split-mark.svg"
              />
            </Link>
            <div>
              <p className="text-lg font-semibold tracking-normal text-[#12343B]">Cardiff Split</p>
              <p className="text-sm text-[#52645E]">Fast, easy trip splitting with our friends.</p>
            </div>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-7 py-8 lg:grid-cols-[0.95fr_1.05fr] lg:py-14">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#D9D1C3] bg-[#FFFDF8]/70 px-3 py-1 text-sm font-medium text-[#12343B]">
              <ShieldCheckIcon aria-hidden="true" className="size-4 text-[#126C5A]" />
              No accounts. No ads. Just good times.
            </div>
            <div className="space-y-3">
              <h1 className="text-4xl font-semibold tracking-normal text-[#12343B] sm:text-5xl">
                Another trip in the books. Let's split it.
              </h1>
              <p className="max-w-xl text-base leading-7 text-[#52645E]">
                Create a private trip link, add folk, track expenses, and settle up whenever the
                group is ready.
              </p>
            </div>
          </div>

          <form
            className="rounded-lg border border-[#D9D1C3] bg-[#FFFDF8] p-4 shadow-[0_18px_50px_rgba(18,52,59,0.10)] sm:p-5"
            onSubmit={handleSubmit}
          >
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor={tripNameId}>Trip name</Label>
                <div className="relative">
                  <Input
                    autoComplete="off"
                    className="placeholder:text-transparent"
                    data-testid="create-trip-name"
                    id={tripNameId}
                    onChange={(event) => setTripName(event.currentTarget.value)}
                    placeholder={tripNamePlaceholder}
                    value={tripName}
                  />
                  {tripName.length === 0 ? (
                    <span
                      aria-hidden="true"
                      className="trip-name-placeholder pointer-events-none absolute inset-y-0 right-2.5 left-2.5 flex items-center overflow-hidden text-base text-ellipsis whitespace-nowrap text-[#52645E] md:text-sm"
                      key={tripNamePlaceholder}
                    >
                      {tripNamePlaceholder}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor={participantNamesId}>People</Label>
                <div className="relative">
                  <Textarea
                    className="resize-none [field-sizing:fixed] placeholder:text-transparent"
                    data-testid="create-trip-participants"
                    id={participantNamesId}
                    onChange={(event) => setParticipantNames(event.currentTarget.value)}
                    placeholder={peoplePlaceholder}
                    rows={4}
                    value={participantNames}
                  />
                  {participantNames.length === 0 ? (
                    <div
                      aria-hidden="true"
                      className="people-name-placeholder-window pointer-events-none absolute inset-x-2.5 top-2 bottom-px text-base text-[#52645E] md:text-sm"
                    >
                      <div
                        className="people-name-placeholder-stack"
                        data-state={peoplePlaceholderSlideState}
                        onTransitionEnd={(event) => {
                          if (
                            event.currentTarget === event.target &&
                            event.propertyName === "transform"
                          ) {
                            settlePeoplePlaceholderSlide();
                          }
                        }}
                      >
                        {peoplePlaceholderNames.map((placeholderName) => (
                          <span className="people-name-placeholder" key={placeholderName}>
                            {placeholderName}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>

              {error === null ? null : (
                <p className="rounded-md border border-[#E76F51]/30 bg-[#E76F51]/10 px-3 py-2 text-sm text-[#B94F36]">
                  {error}
                </p>
              )}

              <Button
                className="h-12 w-full justify-between text-base"
                data-testid="create-trip-submit"
                disabled={isPending}
                type="submit"
              >
                {isPending ? "Creating..." : "Create trip"}
                <ArrowRightIcon aria-hidden="true" className="size-4" />
              </Button>

              <p className="text-sm leading-6 text-[#52645E]">
                Anyone with the private link can view and edit this trip.
              </p>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
