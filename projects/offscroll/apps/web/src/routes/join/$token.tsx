import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Check, Gift, Leaf, ShieldCheck, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { OfflineIllustration } from "../../components/illustration.tsx";
import { Brand } from "../../components/primitives.tsx";
import { joinChallenge, loadInvite } from "../../lib/functions.ts";
import { daysBetween, utcDate } from "../../lib/model.ts";

export const Route = createFileRoute("/join/$token")({
  loader: ({ params }) =>
    /^[a-f0-9]{48}$/.test(params.token)
      ? loadInvite({ data: { token: params.token } })
      : { invite: null, signedIn: false, today: utcDate() },
  component: JoinPage,
});

function JoinPage() {
  const { invite, signedIn, today } = Route.useLoaderData();
  const { token } = Route.useParams();
  const join = useServerFn(joinChallenge);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setReady(true);
    if (new URLSearchParams(window.location.search).get("error") === "auth") {
      setError("Sign-in didn’t finish. Please try again with Breli in the same browser tab.");
    }
  }, []);
  const [error, setError] = useState("");
  const expired = invite && (today > invite.endDate || invite.memberCount >= 32);
  const returnTo = `/join/${token}`;
  return (
    <div className="join-page">
      <header>
        <Brand />
        <Link to="/" className="text-button">
          Take a look around <ArrowRight size={15} />
        </Link>
      </header>
      <main className="join-card panel">
        <span className="join-leaf">
          <Leaf size={27} />
        </span>
        <span className="eyebrow">LESS SCROLLING, TOGETHER</span>
        <h1>
          {!invite
            ? "This invitation wandered off."
            : expired
              ? "This circle is closed."
              : "You’re invited to unplug."}
        </h1>
        <p className="join-intro">
          {!invite
            ? "The link may be incomplete or no longer available. Ask your friend for a fresh invitation."
            : expired
              ? "This challenge has ended or reached its limit of 32 friends. Ask your friend to start a fresh one."
              : `${invite.owner.split(" ")[0]} wants a little more real life, with you.`}
        </p>
        <OfflineIllustration />
        {invite && (
          <div className="join-details">
            <h2>{invite.title}</h2>
            <p>
              <Users size={15} /> {invite.memberCount}{" "}
              {invite.memberCount === 1 ? "person" : "friends"} ·{" "}
              {daysBetween(invite.startDate, invite.endDate) + 1} days · {invite.goal} min daily
              goal
            </p>
            <div>
              <Gift size={20} />
              <span>
                <small>PLAYING FOR</small>
                <strong>{invite.reward}</strong>
              </span>
            </div>
            <small>
              {invite.startDate} – {invite.endDate} · UTC days
            </small>
          </div>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {!invite || expired ? (
          <Link to="/" className="button primary full-width">
            Back to Offscroll <ArrowRight size={16} />
          </Link>
        ) : signedIn ? (
          <button
            type="button"
            className="button primary full-width"
            disabled={!ready || busy}
            onClick={async () => {
              setBusy(true);
              try {
                const result = await join({ data: { token } });
                if (!result.ok) {
                  setError(result.error);
                  return;
                }
                await navigate({ to: "/" });
              } catch {
                setError("We couldn’t join just yet. Check your connection and try again.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Joining your circle…" : "I’m in. Let’s do this."}
            <Check size={17} />
          </button>
        ) : (
          <a
            className="button primary full-width"
            href={`/api/auth/sign-in?returnTo=${encodeURIComponent(returnTo)}`}
          >
            Join with Breli <ArrowRight size={17} />
          </a>
        )}
        <p className="join-privacy">
          <ShieldCheck size={16} /> Check-ins and offline wins are shared with this circle. Lowest
          complete average wins. Late joiners check in from the challenge’s start.
        </p>
      </main>
      <footer>
        Less feed. More life. <span>A Breli app.</span>
      </footer>
    </div>
  );
}
