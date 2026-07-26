import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type SyntheticEvent, useId, useRef, useState, useTransition } from "react";
import { BotanicalStamp, LineFlourish } from "../components/garden-art.tsx";
import type { AdminAccess } from "../lib/admin-auth.ts";
import type { EnrollmentDashboard } from "../lib/enrollment.ts";
import { enrollHousehold, loadAdminDashboard } from "../lib/enrollment-server-functions.ts";

type AdminSearch = {
  readonly error?: string;
};

type GuestDraft = {
  readonly id: number;
  readonly name: string;
  readonly plusOneAllowed: boolean;
};

const initialGuestDraft: GuestDraft = {
  id: 0,
  name: "",
  plusOneAllowed: false,
};

export const Route = createFileRoute("/admin")({
  validateSearch: (search: Record<string, unknown>): AdminSearch => {
    const { error } = search;

    return typeof error === "string" ? { error } : {};
  },
  loader: () => loadAdminDashboard(),
  component: AdminPage,
});

function AdminPage() {
  const loaderData = Route.useLoaderData();
  const search = Route.useSearch();

  if (loaderData.access === "authorized") {
    return <EnrollmentAdmin initialDashboard={loaderData.dashboard} />;
  }

  return <AdminSignIn access={loaderData.access} oauthError={search.error !== undefined} />;
}

function EnrollmentAdmin({ initialDashboard }: { readonly initialDashboard: EnrollmentDashboard }) {
  const formTitleId = useId();
  const introTitleId = useId();
  const rosterTitleId = useId();
  const nextGuestId = useRef(1);
  const enrollHouseholdFn = useServerFn(enrollHousehold);
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [householdName, setHouseholdName] = useState("");
  const [guestDrafts, setGuestDrafts] = useState<readonly GuestDraft[]>([initialGuestDraft]);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const openGuestCount = guestDrafts.filter((guest) => guest.plusOneAllowed).length;
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const visibleHouseholds = dashboard.households.filter(
    (household) =>
      normalizedSearch.length === 0 ||
      household.name.toLocaleLowerCase().includes(normalizedSearch) ||
      household.guests.some((guest) => guest.name.toLocaleLowerCase().includes(normalizedSearch)),
  );

  const updateGuest = (id: number, update: Partial<Omit<GuestDraft, "id">>) => {
    setGuestDrafts((current) =>
      current.map((guest) => (guest.id === id ? { ...guest, ...update } : guest)),
    );
  };

  const addGuest = () => {
    const id = nextGuestId.current;
    nextGuestId.current += 1;
    setGuestDrafts((current) => [...current, { ...initialGuestDraft, id }]);
  };

  const removeGuest = (id: number) => {
    setGuestDrafts((current) => current.filter((guest) => guest.id !== id));
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedHouseholdName = householdName.trim();
    const trimmedGuests = guestDrafts.map((guest) => ({
      name: guest.name.trim(),
      plusOneAllowed: guest.plusOneAllowed,
    }));

    if (trimmedHouseholdName.length === 0) {
      setError("Give this household a name.");
      setSuccess(null);
      return;
    }

    if (trimmedGuests.some((guest) => guest.name.length === 0)) {
      setError("Name each invited person, or remove the empty row.");
      setSuccess(null);
      return;
    }

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const nextDashboard = await enrollHouseholdFn({
          data: {
            householdName: trimmedHouseholdName,
            guests: trimmedGuests,
          },
        });

        setDashboard(nextDashboard);
        setHouseholdName("");
        setGuestDrafts([{ ...initialGuestDraft, id: nextGuestId.current }]);
        nextGuestId.current += 1;
        setSuccess(`${trimmedHouseholdName} is now on the guest list.`);
      } catch {
        setError("That household could not be enrolled. Please try again.");
      }
    });
  };

  return (
    <main aria-label="Wedding administration" className="admin-page">
      <BotanicalStamp className="admin-botanical admin-botanical-left" />
      <BotanicalStamp className="admin-botanical admin-botanical-right" />

      <header className="admin-header">
        <Link aria-label="Emma and Eric wedding home" className="admin-monogram" to="/">
          E <span>&</span> E
        </Link>
        <div className="admin-header-title">
          <p>Wedding administration</p>
          <span>Guest enrollment</span>
        </div>
        <div className="admin-header-actions">
          <Link className="admin-text-link" to="/">
            View website
          </Link>
          <form action="/api/auth/sign-out?returnTo=/admin" method="post">
            <button className="admin-text-button" type="submit">
              Sign out
            </button>
          </form>
        </div>
      </header>

      <div className="admin-layout">
        <section className="admin-intro" aria-labelledby={introTitleId}>
          <p className="eyebrow">The guest list</p>
          <h1 id={introTitleId}>Gather the people you love.</h1>
          <LineFlourish className="admin-flourish" />
          <p>
            Enroll each household, name everyone on the invitation, and grant a guest only to the
            people who should receive one.
          </p>
        </section>

        <dl className="admin-summary" aria-label="Invitation totals">
          <SummaryItem label="Households" value={dashboard.summary.householdCount} />
          <SummaryItem label="Named guests" value={dashboard.summary.namedGuestCount} />
          <SummaryItem label="Open +1s" value={dashboard.summary.plusOneCount} />
          <SummaryItem label="Invited seats" value={dashboard.summary.invitedSeatCount} />
        </dl>

        <div className="admin-workspace">
          <section aria-labelledby={formTitleId} className="admin-enrollment-card">
            <div className="admin-section-heading">
              <p className="eyebrow">New invitation</p>
              <h2 id={formTitleId}>Enroll a household</h2>
              <p>Add named invitees first. A checked +1 creates one additional unnamed seat.</p>
            </div>

            <form className="admin-enrollment-form" onSubmit={handleSubmit}>
              <label className="admin-field">
                <span>Household name</span>
                <input
                  autoComplete="off"
                  maxLength={120}
                  onChange={(event) => setHouseholdName(event.target.value)}
                  placeholder="For example, The Anderson household"
                  required
                  type="text"
                  value={householdName}
                />
              </label>

              <fieldset className="admin-guest-fields">
                <legend>People named on the invitation</legend>
                {guestDrafts.map((guest, index) => (
                  <div className="admin-guest-row" key={guest.id}>
                    <label className="admin-field admin-guest-name">
                      <span>Person {index + 1}</span>
                      <input
                        autoComplete="off"
                        maxLength={100}
                        onChange={(event) => updateGuest(guest.id, { name: event.target.value })}
                        placeholder="Full name"
                        required
                        type="text"
                        value={guest.name}
                      />
                    </label>
                    <label className="admin-plus-one-toggle">
                      <input
                        checked={guest.plusOneAllowed}
                        onChange={(event) =>
                          updateGuest(guest.id, { plusOneAllowed: event.target.checked })
                        }
                        type="checkbox"
                      />
                      <span>
                        May bring a +1
                        <small>Creates one open guest seat</small>
                      </span>
                    </label>
                    {guestDrafts.length > 1 ? (
                      <button
                        aria-label={`Remove person ${index + 1}`}
                        className="admin-remove-person"
                        onClick={() => removeGuest(guest.id)}
                        type="button"
                      >
                        Remove
                      </button>
                    ) : null}
                  </div>
                ))}
              </fieldset>

              <button className="admin-add-person" onClick={addGuest} type="button">
                <span aria-hidden="true">+</span> Add another person
              </button>

              <div className="admin-seat-preview">
                <span>This invitation includes</span>
                <strong>
                  {guestDrafts.length} named {pluralize("seat", guestDrafts.length)}
                  {openGuestCount > 0
                    ? ` + ${openGuestCount} open ${pluralize("guest", openGuestCount)}`
                    : ""}
                </strong>
              </div>

              <div aria-live="polite" className="admin-form-message">
                {error === null ? null : (
                  <p className="admin-auth-error" role="alert">
                    {error}
                  </p>
                )}
                {success === null ? null : <p className="admin-form-success">{success}</p>}
              </div>

              <button
                className="button button-primary admin-enroll-button"
                disabled={isPending}
                type="submit"
              >
                {isPending ? "Enrolling…" : "Enroll household"}
              </button>
            </form>
          </section>

          <section aria-labelledby={rosterTitleId} className="admin-roster-card">
            <div className="admin-roster-header">
              <div className="admin-section-heading">
                <p className="eyebrow">Enrolled so far</p>
                <h2 id={rosterTitleId}>Households</h2>
              </div>
              {dashboard.households.length > 0 ? (
                <label className="admin-search">
                  <span className="sr-only">Search households and guests</span>
                  <input
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search the guest list"
                    type="search"
                    value={searchQuery}
                  />
                </label>
              ) : null}
            </div>

            {dashboard.households.length === 0 ? (
              <div className="admin-empty-state">
                <span aria-hidden="true">✿</span>
                <h3>The guest list is ready to grow.</h3>
                <p>Your first enrolled household will appear here.</p>
              </div>
            ) : visibleHouseholds.length === 0 ? (
              <div className="admin-empty-state admin-empty-state-compact">
                <h3>No matching household</h3>
                <p>Try another name.</p>
              </div>
            ) : (
              <ol className="admin-household-list">
                {visibleHouseholds.map((household) => (
                  <li className="admin-household" key={household.id}>
                    <div className="admin-household-heading">
                      <div>
                        <h3>{household.name}</h3>
                        <p>
                          {household.namedGuestCount} named · {household.plusOneCount} open +1 ·{" "}
                          {household.invitedSeatCount} total
                        </p>
                      </div>
                      <span className="admin-seat-count">
                        {household.invitedSeatCount} {pluralize("seat", household.invitedSeatCount)}
                      </span>
                    </div>
                    <ul className="admin-named-guests">
                      {household.guests.map((guest) => (
                        <li key={guest.id}>
                          <span>{guest.name}</span>
                          {guest.plusOneAllowed ? <small>+1 granted</small> : null}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function SummaryItem({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function pluralize(noun: string, count: number) {
  return count === 1 ? noun : `${noun}s`;
}

function AdminSignIn({
  access,
  oauthError,
}: {
  readonly access: Exclude<AdminAccess, "authorized">;
  readonly oauthError: boolean;
}) {
  const titleId = useId();
  const hasError = access === "forbidden" || oauthError;

  return (
    <main className="admin-auth-shell">
      <section aria-labelledby={titleId} className="admin-auth-card">
        <p className="eyebrow">Private administration</p>
        <h1 id={titleId}>Emma & Eric</h1>
        <p className="admin-auth-copy">Continue through Breli App.</p>
        {hasError ? (
          <p className="admin-auth-error" role="alert">
            {access === "forbidden"
              ? "This Google account does not have access."
              : "Sign-in could not be completed. Please try again."}
          </p>
        ) : null}
        {access === "forbidden" ? (
          <form action="/api/auth/sign-out?returnTo=/admin" method="post">
            <button className="button button-primary admin-auth-button" type="submit">
              Sign out
            </button>
          </form>
        ) : (
          <a
            className="button button-primary admin-auth-button"
            href="/api/auth/sign-in?returnTo=/admin"
          >
            Continue with Google
          </a>
        )}
      </section>
    </main>
  );
}
