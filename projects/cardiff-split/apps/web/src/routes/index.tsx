import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@templar/ui/components/button";
import { Input } from "@templar/ui/components/input";
import { Label } from "@templar/ui/components/label";
import { Textarea } from "@templar/ui/components/textarea";
import { ArrowRightIcon, ShieldCheckIcon } from "lucide-react";
import { type SyntheticEvent, useEffect, useId, useState, useTransition } from "react";
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

function Home() {
  const tripNameId = useId();
  const participantNamesId = useId();
  const navigate = useNavigate();
  const createTripFn = useServerFn(createTrip);
  const [tripName, setTripName] = useState("");
  const [tripNamePlaceholderIndex, setTripNamePlaceholderIndex] = useState(0);
  const [participantNames, setParticipantNames] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setTripNamePlaceholderIndex((currentIndex) => {
        return (currentIndex + 1) % tripNamePlaceholders.length;
      });
    }, 2500);

    return () => window.clearInterval(intervalId);
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
            <img
              alt="Cardiff Split"
              className="size-11 rounded-xl shadow-sm"
              src="/cardiff-split-mark.svg"
            />
            <div>
              <p className="text-lg font-semibold tracking-normal text-[#12343B]">Cardiff Split</p>
              <p className="text-sm text-[#52645E]">
                Fast, private trip splitting with our friends.
              </p>
            </div>
          </div>
        </header>

        <div className="grid flex-1 items-center gap-7 py-8 lg:grid-cols-[0.95fr_1.05fr] lg:py-14">
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#D9D1C3] bg-[#FFFDF8]/70 px-3 py-1 text-sm font-medium text-[#12343B]">
              <ShieldCheckIcon aria-hidden="true" className="size-4 text-[#126C5A]" />
              No accounts. No ads.
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
                <Input
                  autoComplete="off"
                  data-testid="create-trip-name"
                  id={tripNameId}
                  onChange={(event) => setTripName(event.currentTarget.value)}
                  placeholder={tripNamePlaceholders[tripNamePlaceholderIndex]}
                  value={tripName}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={participantNamesId}>People</Label>
                <Textarea
                  data-testid="create-trip-participants"
                  id={participantNamesId}
                  onChange={(event) => setParticipantNames(event.currentTarget.value)}
                  placeholder={"K'love\nKimi\nGavin\nFiona"}
                  rows={5}
                  value={participantNames}
                />
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
