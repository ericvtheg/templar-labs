import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type SyntheticEvent, useId, useRef, useState, useTransition } from "react";
import { BotanicalStamp, LineFlourish } from "../components/garden-art.tsx";
import { eventById, mealOptionById, type WeddingEventId } from "../content/rsvp.ts";
import type {
  RsvpEventResponse,
  RsvpGuest,
  RsvpHousehold,
  RsvpPlusOne,
  RsvpSubmissionResult,
} from "../lib/rsvp.ts";
import { findRsvpHousehold, submitHouseholdRsvp } from "../lib/rsvp-server-functions.ts";
import { loadRsvpSettings } from "../lib/rsvp-settings-server-functions.ts";

type RsvpStep = "lookup" | "respond" | "review" | "confirmed";
type OverallAttendance = "all" | "wedding-only" | "none" | null;

export const Route = createFileRoute("/rsvp")({
  loader: () => loadRsvpSettings(),
  component: RsvpPage,
});

function RsvpPage() {
  const settings = Route.useLoaderData();
  const titleId = useId();
  const messageRef = useRef<HTMLDivElement>(null);
  const findHousehold = useServerFn(findRsvpHousehold);
  const submitRsvp = useServerFn(submitHouseholdRsvp);
  const [step, setStep] = useState<RsvpStep>("lookup");
  const [fullName, setFullName] = useState("");
  const [household, setHousehold] = useState<RsvpHousehold | null>(null);
  const [originalHousehold, setOriginalHousehold] = useState<RsvpHousehold | null>(null);
  const [emailStatus, setEmailStatus] = useState<RsvpSubmissionResult["emailStatus"]>("skipped");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const announceError = (message: string) => {
    setError(message);
    requestAnimationFrame(() => messageRef.current?.focus());
  };

  const handleLookup = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const result = await findHousehold({ data: { fullName } });

        if (result.status === "rate-limited") {
          announceError("Too many lookup attempts. Please wait a minute and try again.");
          return;
        }

        if (result.status === "not-found") {
          announceError(
            "We couldn’t find that name. Enter your full name exactly as it appears on your invitation.",
          );
          return;
        }

        setHousehold(result.household);
        setOriginalHousehold(result.household);
        setStep("respond");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        announceError("We couldn’t look up the invitation. Please try again.");
      }
    });
  };

  const updateGuest = (guestId: string, update: (guest: RsvpGuest) => RsvpGuest) => {
    setHousehold((current) =>
      current === null
        ? null
        : {
            ...current,
            guests: current.guests.map((guest) => (guest.id === guestId ? update(guest) : guest)),
          },
    );
    setError(null);
  };

  const reviewResponses = () => {
    if (household === null) {
      return;
    }

    if (
      !settings.fullEditingAllowed &&
      originalHousehold !== null &&
      !hasSelectedCancellation(household, originalHousehold)
    ) {
      announceError("Select at least one attendance cancellation to continue.");
      return;
    }

    const incompleteMessage = firstIncompleteMessage(household);
    if (incompleteMessage !== null) {
      announceError(incompleteMessage);
      return;
    }

    setError(null);
    setStep("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmResponses = () => {
    if (household === null) {
      return;
    }

    const incompleteMessage = firstIncompleteMessage(household);
    if (incompleteMessage !== null) {
      setStep("respond");
      announceError(incompleteMessage);
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const result = await submitRsvp({
          data: {
            accessToken: household.accessToken,
            contactEmail: household.contactEmail,
            message: household.message,
            guests: household.guests.map((guest) => ({
              guestId: guest.id,
              dietaryRestrictions: guest.dietaryRestrictions,
              eventResponses: guest.eventResponses.map((response) => ({
                eventId: response.eventId,
                attending: response.attending === true,
                mealOptionId: response.mealOptionId,
              })),
              plusOne:
                guest.plusOne === null
                  ? null
                  : {
                      name: guest.plusOne.name,
                      dietaryRestrictions: guest.plusOne.dietaryRestrictions,
                      mealSelections: guest.plusOne.mealSelections.map((selection) => ({
                        eventId: selection.eventId,
                        mealOptionId: selection.mealOptionId,
                      })),
                    },
            })),
          },
        });

        setHousehold(result.household);
        setOriginalHousehold(result.household);
        setEmailStatus(result.emailStatus);
        setStep("confirmed");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (submissionError) {
        const serverMessage = submissionError instanceof Error ? submissionError.message : "";
        announceError(
          serverMessage.includes("expired") ||
            serverMessage.includes("RSVP deadline") ||
            serverMessage.includes("After the RSVP deadline")
            ? serverMessage
            : "Your RSVP could not be saved. Nothing was submitted; please try again.",
        );
      }
    });
  };

  return (
    <main className="rsvp-page">
      <BotanicalStamp className="rsvp-page-botanical rsvp-page-botanical-left" />
      <BotanicalStamp className="rsvp-page-botanical rsvp-page-botanical-right" />
      <header className="rsvp-header">
        <Link aria-label="Emma and Eric wedding home" className="admin-monogram" to="/">
          E <span>&</span> E
        </Link>
        <p>{stepLabel(step)}</p>
        <Link className="admin-text-link" to="/">
          Wedding website
        </Link>
      </header>

      <div className="rsvp-shell">
        <header className="rsvp-title">
          <p className="eyebrow">September 25, 2027</p>
          <h1 id={titleId}>{stepTitle(step, household?.submitted ?? false)}</h1>
          <LineFlourish className="rsvp-title-flourish" />
          <p className="rsvp-deadline">
            Please RSVP by: <strong>{settings.deadlineDisplay}</strong>
          </p>
          <p>{stepIntroduction(step, household)}</p>
        </header>

        <div aria-live="polite" className="rsvp-message" ref={messageRef} tabIndex={-1}>
          {error === null ? null : <p role="alert">{error}</p>}
        </div>

        {step === "lookup" ? (
          <LookupForm
            fullName={fullName}
            isPending={isPending}
            onChange={setFullName}
            onSubmit={handleLookup}
          />
        ) : null}

        {step === "respond" && household !== null && !settings.fullEditingAllowed ? (
          <LateRsvpNotice
            onStartOver={() => {
              setHousehold(null);
              setOriginalHousehold(null);
              setStep("lookup");
              setError(null);
            }}
            submitted={household.submitted}
          />
        ) : null}

        {step === "respond" &&
        household !== null &&
        (settings.fullEditingAllowed || household.submitted) ? (
          <>
            <InvitationOverview household={household} />
            <section aria-label="Household responses" className="rsvp-guest-list">
              {household.guests.map((guest, index) => (
                <GuestResponseCard
                  guest={guest}
                  index={index}
                  key={guest.id}
                  lateChangesOnly={!settings.fullEditingAllowed}
                  onChange={(update) => updateGuest(guest.id, update)}
                  originalGuest={originalHousehold?.guests.find(
                    (candidate) => candidate.id === guest.id,
                  )}
                />
              ))}
            </section>
            <HouseholdMessageField
              message={household.message}
              disabled={!settings.fullEditingAllowed}
              onChange={(message) =>
                setHousehold((current) => (current === null ? null : { ...current, message }))
              }
            />
            <ConfirmationEmailField
              email={household.contactEmail}
              disabled={!settings.fullEditingAllowed}
              onChange={(contactEmail) =>
                setHousehold((current) => (current === null ? null : { ...current, contactEmail }))
              }
            />
            <div className="rsvp-page-actions">
              <button className="button button-primary" onClick={reviewResponses} type="button">
                {settings.fullEditingAllowed ? "Review entire RSVP" : "Review cancellations"}
              </button>
              <button
                className="rsvp-start-over"
                onClick={() => {
                  setHousehold(null);
                  setOriginalHousehold(null);
                  setStep("lookup");
                  setError(null);
                }}
                type="button"
              >
                Use a different name
              </button>
            </div>
          </>
        ) : null}

        {step === "review" && household !== null ? <ReviewResponse household={household} /> : null}

        {step === "review" && household !== null ? (
          <div className="rsvp-page-actions rsvp-review-actions">
            <button
              className="button admin-secondary-button"
              disabled={isPending}
              onClick={() => {
                setStep("respond");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              type="button"
            >
              Edit responses
            </button>
            <button
              className="button button-primary"
              disabled={isPending}
              onClick={confirmResponses}
              type="button"
            >
              {isPending
                ? "Saving…"
                : household.submitted
                  ? "Update household RSVP"
                  : "Confirm household RSVP"}
            </button>
          </div>
        ) : null}

        {step === "confirmed" && household !== null ? (
          <Confirmation household={household} emailStatus={emailStatus} />
        ) : null}
      </div>
    </main>
  );
}

function LookupForm({
  fullName,
  isPending,
  onChange,
  onSubmit,
}: {
  readonly fullName: string;
  readonly isPending: boolean;
  readonly onChange: (name: string) => void;
  readonly onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="rsvp-lookup-card" onSubmit={onSubmit}>
      <label>
        <span>Full name</span>
        <input
          autoComplete="name"
          maxLength={100}
          onChange={(event) => onChange(event.target.value)}
          placeholder="As it appears on your invitation"
          required
          type="text"
          value={fullName}
        />
      </label>
      <button className="button button-primary" disabled={isPending} type="submit">
        {isPending ? "Finding your invitation…" : "Find my invitation"}
      </button>
      <small>Any person named on the invitation can respond for the complete household.</small>
    </form>
  );
}

function InvitationOverview({ household }: { readonly household: RsvpHousehold }) {
  return (
    <section className="rsvp-invitation-overview">
      <div className="rsvp-overview-heading">
        <p className="eyebrow">Your invitation</p>
        <h2>
          {household.events.length === 1
            ? "Come celebrate with us."
            : "Join us for both celebrations."}
        </h2>
      </div>
      <div
        className={`rsvp-event-grid ${household.events.length === 1 ? "rsvp-event-grid-single" : ""}`}
      >
        {household.events.map((event, index) => (
          <article className="rsvp-event-card" key={event.id}>
            {household.events.length > 1 ? <span>0{index + 1}</span> : null}
            <h3>{event.title}</h3>
            <p>{event.date ?? event.detail}</p>
            {event.date === null || event.location === null ? null : (
              <small>{event.location}</small>
            )}
            <ul>
              {household.guests
                .filter((guest) => guest.eventIds.includes(event.id))
                .map((guest) => (
                  <li key={guest.id}>{guest.name}</li>
                ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function LateRsvpNotice({
  onStartOver,
  submitted,
}: {
  readonly onStartOver: () => void;
  readonly submitted: boolean;
}) {
  return (
    <section className="rsvp-late-notice">
      <p className="eyebrow">The response window has closed</p>
      <h2>{submitted ? "Plans changed? Let us know." : "Please contact Emma or Eric."}</h2>
      <p>
        {submitted
          ? "You can still cancel attendance below. For a late acceptance, meal change, or any other update, please contact Emma or Eric directly."
          : "The RSVP deadline has passed, but Emma or Eric can help record your household’s response."}
      </p>
      {submitted ? null : (
        <button
          className="rsvp-start-over rsvp-late-start-over"
          onClick={onStartOver}
          type="button"
        >
          Use a different name
        </button>
      )}
    </section>
  );
}

function GuestResponseCard({
  guest,
  index,
  lateChangesOnly,
  onChange,
  originalGuest,
}: {
  readonly guest: RsvpGuest;
  readonly index: number;
  readonly lateChangesOnly: boolean;
  readonly onChange: (update: (guest: RsvpGuest) => RsvpGuest) => void;
  readonly originalGuest: RsvpGuest | undefined;
}) {
  const overallAttendance = overallAttendanceFor(guest.eventResponses);
  const attendingResponses = guest.eventResponses.filter((response) => response.attending);
  const originalResponseFor = (eventId: WeddingEventId) =>
    originalGuest?.eventResponses.find((response) => response.eventId === eventId);

  const setAllAttendance = (attending: boolean) => {
    if (attending && lateChangesOnly && originalGuest !== undefined) {
      onChange(() => originalGuest);
      return;
    }

    onChange((current) => ({
      ...current,
      eventResponses: current.eventResponses.map((response) => ({
        ...response,
        attending,
        mealOptionId: attending ? response.mealOptionId : null,
      })),
      dietaryRestrictions: attending ? current.dietaryRestrictions : "",
      plusOne: attending ? current.plusOne : null,
    }));
  };

  const chooseWeddingOnly = () => {
    if (lateChangesOnly && originalGuest !== undefined) {
      onChange(() => ({
        ...originalGuest,
        eventResponses: originalGuest.eventResponses.map((response) => ({
          ...response,
          attending: response.eventId === "wedding",
          mealOptionId: response.eventId === "wedding" ? response.mealOptionId : null,
        })),
        plusOne:
          originalGuest.plusOne === null
            ? null
            : {
                ...originalGuest.plusOne,
                mealSelections: originalGuest.plusOne.mealSelections.filter(
                  (selection) => selection.eventId === "wedding",
                ),
              },
      }));
      return;
    }

    onChange((current) => ({
      ...current,
      eventResponses: current.eventResponses.map((response) => ({
        ...response,
        attending: response.eventId === "wedding",
        mealOptionId: response.eventId === "wedding" ? response.mealOptionId : null,
      })),
      plusOne:
        current.plusOne === null
          ? null
          : {
              ...current.plusOne,
              mealSelections: current.plusOne.mealSelections.filter(
                (selection) => selection.eventId === "wedding",
              ),
            },
    }));
  };

  const setMeal = (eventId: WeddingEventId, mealOptionId: string) => {
    onChange((current) => ({
      ...current,
      eventResponses: current.eventResponses.map((response) =>
        response.eventId === eventId ? { ...response, mealOptionId } : response,
      ),
    }));
  };

  const setPlusOne = (plusOne: RsvpPlusOne | null) => {
    onChange((current) => ({ ...current, plusOne }));
  };

  const setDietaryRestrictions = (dietaryRestrictions: string) => {
    onChange((current) => ({ ...current, dietaryRestrictions }));
  };

  return (
    <article className="rsvp-guest-card">
      <header>
        <span>Person {index + 1}</span>
        <h2>{guest.name}</h2>
        <p>
          Invited to {guest.eventIds.map((eventId) => eventById(eventId)?.shortTitle).join(" and ")}
        </p>
      </header>

      {guest.eventResponses.length > 1 ? (
        <fieldset className="rsvp-attendance-options">
          <legend>Can {firstName(guest.name)} celebrate with us?</legend>
          <Choice
            checked={overallAttendance === "all"}
            disabled={
              lateChangesOnly &&
              !guest.eventResponses.every(
                (response) => originalResponseFor(response.eventId)?.attending === true,
              )
            }
            label="Attending rehearsal dinner and wedding"
            name={`${guest.id}-overall`}
            onChange={() => setAllAttendance(true)}
            value="all"
          />
          <Choice
            checked={overallAttendance === "wedding-only"}
            disabled={lateChangesOnly && originalResponseFor("wedding")?.attending !== true}
            label="Attending only wedding"
            name={`${guest.id}-overall`}
            onChange={chooseWeddingOnly}
            value="wedding-only"
          />
          <Choice
            checked={overallAttendance === "none"}
            disabled={false}
            label="Unable to attend"
            name={`${guest.id}-overall`}
            onChange={() => setAllAttendance(false)}
            value="none"
          />
        </fieldset>
      ) : (
        <fieldset className="rsvp-attendance-options">
          <legend>Can {firstName(guest.name)} celebrate with us?</legend>
          <Choice
            checked={guest.eventResponses[0]?.attending === true}
            disabled={
              lateChangesOnly &&
              originalResponseFor(guest.eventResponses[0]?.eventId ?? "wedding")?.attending !== true
            }
            label="Joyfully accepts"
            name={`${guest.id}-single`}
            onChange={() => setAllAttendance(true)}
            value="attending"
          />
          <Choice
            checked={guest.eventResponses[0]?.attending === false}
            disabled={false}
            label="Regretfully declines"
            name={`${guest.id}-single`}
            onChange={() => setAllAttendance(false)}
            value="declining"
          />
        </fieldset>
      )}

      {attendingResponses.map((response) => {
        const weddingEvent = eventById(response.eventId);
        return weddingEvent === undefined || weddingEvent.mealOptions.length === 0 ? null : (
          <MealChoices
            controlName={guest.id}
            eventId={response.eventId}
            disabled={lateChangesOnly}
            key={response.eventId}
            name={guest.name}
            onChange={(mealOptionId) => setMeal(response.eventId, mealOptionId)}
            selectedMealId={response.mealOptionId}
          />
        );
      })}

      {attendingResponses.length > 0 ? (
        <DietaryRestrictionsField
          name={guest.name}
          disabled={lateChangesOnly}
          onChange={setDietaryRestrictions}
          value={guest.dietaryRestrictions}
        />
      ) : null}

      {guest.plusOneAllowed && attendingResponses.length > 0 ? (
        <PlusOneResponse
          guest={guest}
          locked={lateChangesOnly}
          onChange={setPlusOne}
          originalPlusOne={originalGuest?.plusOne ?? null}
          attendingEventIds={attendingResponses.map((response) => response.eventId)}
        />
      ) : null}
    </article>
  );
}

function Choice({
  checked,
  disabled,
  label,
  name,
  onChange,
  value,
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly label: string;
  readonly name: string;
  readonly onChange: () => void;
  readonly value: string;
}) {
  return (
    <label className="rsvp-choice">
      <input
        checked={checked}
        disabled={disabled}
        name={name}
        onChange={onChange}
        type="radio"
        value={value}
      />
      <span>{label}</span>
    </label>
  );
}

function MealChoices({
  controlName,
  disabled,
  eventId,
  name,
  onChange,
  selectedMealId,
}: {
  readonly controlName: string;
  readonly disabled: boolean;
  readonly eventId: WeddingEventId;
  readonly name: string;
  readonly onChange: (mealOptionId: string) => void;
  readonly selectedMealId: string | null;
}) {
  const weddingEvent = eventById(eventId);
  if (weddingEvent === undefined || weddingEvent.mealOptions.length === 0) {
    return null;
  }

  return (
    <fieldset className="rsvp-meal-options">
      <legend>
        {name}’s meal <small>{weddingEvent.shortTitle} · menu to be confirmed</small>
      </legend>
      <div>
        {weddingEvent.mealOptions.map((meal) => (
          <label className="rsvp-meal-choice" key={meal.id}>
            <input
              checked={selectedMealId === meal.id}
              disabled={disabled}
              name={`${controlName}-${eventId}-meal`}
              onChange={() => onChange(meal.id)}
              type="radio"
              value={meal.id}
            />
            <span>
              <strong>{meal.label}</strong>
              <small>{meal.description}</small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function DietaryRestrictionsField({
  disabled,
  name,
  onChange,
  value,
}: {
  readonly disabled: boolean;
  readonly name: string;
  readonly onChange: (dietaryRestrictions: string) => void;
  readonly value: string;
}) {
  return (
    <label className="rsvp-dietary-field">
      <span>{name}’s dietary restrictions</span>
      <textarea
        maxLength={500}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Allergies or dietary needs"
        rows={3}
        value={value}
      />
      <small>Optional. Leave blank if there are none.</small>
    </label>
  );
}

function PlusOneResponse({
  attendingEventIds,
  guest,
  locked,
  onChange,
  originalPlusOne,
}: {
  readonly attendingEventIds: readonly WeddingEventId[];
  readonly guest: RsvpGuest;
  readonly locked: boolean;
  readonly onChange: (plusOne: RsvpPlusOne | null) => void;
  readonly originalPlusOne: RsvpPlusOne | null;
}) {
  const plusOne = guest.plusOne;
  const setPlusOneMeal = (eventId: WeddingEventId, mealOptionId: string) => {
    if (plusOne === null) {
      return;
    }

    onChange({
      ...plusOne,
      mealSelections: [
        ...plusOne.mealSelections.filter((selection) => selection.eventId !== eventId),
        { eventId, mealOptionId },
      ],
    });
  };

  return (
    <section className="rsvp-plus-one">
      {plusOne === null ? (
        locked && originalPlusOne === null ? null : (
          <button
            onClick={() =>
              onChange(originalPlusOne ?? { name: "", dietaryRestrictions: "", mealSelections: [] })
            }
            type="button"
          >
            <span aria-hidden="true">+</span>{" "}
            {locked
              ? `Keep ${originalPlusOne?.name ?? "invited guest"} on the RSVP`
              : `Add ${firstName(guest.name)}’s invited guest`}
          </button>
        )
      ) : (
        <>
          <div className="rsvp-plus-one-heading">
            <div>
              <span>Invited guest</span>
              <p>They’ll join {firstName(guest.name)} at the same selected events.</p>
            </div>
            <button onClick={() => onChange(null)} type="button">
              Remove guest
            </button>
          </div>
          <label className="rsvp-plus-one-name">
            <span>Guest’s full name</span>
            <input
              maxLength={100}
              disabled={locked}
              onChange={(event) => onChange({ ...plusOne, name: event.target.value })}
              placeholder="Full name"
              type="text"
              value={plusOne.name}
            />
          </label>
          {attendingEventIds.map((eventId) => {
            const weddingEvent = eventById(eventId);
            return weddingEvent === undefined || weddingEvent.mealOptions.length === 0 ? null : (
              <MealChoices
                controlName={`${guest.id}-plus-one`}
                disabled={locked}
                eventId={eventId}
                key={eventId}
                name={plusOne.name.trim() || "Invited guest"}
                onChange={(mealOptionId) => setPlusOneMeal(eventId, mealOptionId)}
                selectedMealId={
                  plusOne.mealSelections.find((selection) => selection.eventId === eventId)
                    ?.mealOptionId ?? null
                }
              />
            );
          })}
          <DietaryRestrictionsField
            name={plusOne.name.trim() || "Invited guest"}
            disabled={locked}
            onChange={(dietaryRestrictions) => onChange({ ...plusOne, dietaryRestrictions })}
            value={plusOne.dietaryRestrictions}
          />
        </>
      )}
    </section>
  );
}

function ConfirmationEmailField({
  disabled,
  email,
  onChange,
}: {
  readonly disabled: boolean;
  readonly email: string;
  readonly onChange: (email: string) => void;
}) {
  return (
    <section className="rsvp-email-card">
      <div>
        <p className="eyebrow">Confirmation</p>
        <h2>Where should we send the confirmation?</h2>
        <p>We’ll send a copy of the complete household response to this address.</p>
      </div>
      <label>
        <span>Confirmation email</span>
        <input
          autoComplete="email"
          disabled={disabled}
          maxLength={254}
          onChange={(event) => onChange(event.target.value)}
          placeholder="name@example.com"
          required
          type="email"
          value={email}
        />
      </label>
    </section>
  );
}

function HouseholdMessageField({
  disabled,
  message,
  onChange,
}: {
  readonly disabled: boolean;
  readonly message: string;
  readonly onChange: (message: string) => void;
}) {
  return (
    <section className="rsvp-household-message-card">
      <div>
        <p className="eyebrow">A note for us</p>
        <h2>Anything you’d like to share?</h2>
        <p>Leave Emma and Eric a note, a favorite memory, or anything else on your mind.</p>
      </div>
      <label>
        <span>Message to Emma &amp; Eric</span>
        <textarea
          disabled={disabled}
          maxLength={2_000}
          onChange={(event) => onChange(event.target.value)}
          placeholder="We can’t wait to celebrate with you!"
          rows={5}
          value={message}
        />
        <small>Optional · {message.length.toLocaleString()} / 2,000</small>
      </label>
    </section>
  );
}

function ReviewResponse({ household }: { readonly household: RsvpHousehold }) {
  return (
    <section className="rsvp-review">
      <header>
        <p className="eyebrow">One complete response</p>
        <h2>{household.name}</h2>
        <p>Review every person, event, and meal before confirming.</p>
      </header>
      <ResponseSummary household={household} />
      <HouseholdMessageSummary message={household.message} />
      {household.contactEmail.length === 0 ? null : (
        <p className="rsvp-review-email">
          Confirmation copy: <strong>{household.contactEmail}</strong>
        </p>
      )}
    </section>
  );
}

function Confirmation({
  emailStatus,
  household,
}: {
  readonly emailStatus: RsvpSubmissionResult["emailStatus"];
  readonly household: RsvpHousehold;
}) {
  return (
    <section className="rsvp-confirmation">
      <BotanicalStamp className="rsvp-confirmation-stamp" />
      <span className="rsvp-confirmation-mark" aria-hidden="true">
        ✓
      </span>
      <p className="eyebrow">All together</p>
      <h2>Your RSVP is confirmed.</h2>
      <p className="rsvp-confirmation-intro">
        Thank you. This is the complete response for every event on your invitation.
      </p>
      <ResponseSummary household={household} />
      <HouseholdMessageSummary message={household.message} />
      {emailStatus === "sent" ? (
        <p className="rsvp-confirmation-email">
          A copy is on its way to <strong>{household.contactEmail}</strong>.
        </p>
      ) : null}
      <div className="rsvp-page-actions">
        <Link className="button button-primary" to="/">
          Return to the wedding website
        </Link>
      </div>
    </section>
  );
}

function HouseholdMessageSummary({ message }: { readonly message: string }) {
  return message.length === 0 ? null : (
    <div className="rsvp-household-message-summary">
      <span>Your note to Emma &amp; Eric</span>
      <p>{message}</p>
    </div>
  );
}

function ResponseSummary({ household }: { readonly household: RsvpHousehold }) {
  return (
    <div className="rsvp-response-summary">
      {household.guests.map((guest) => (
        <article key={guest.id}>
          <h3>{guest.name}</h3>
          <ul>
            {guest.eventResponses.map((response) => {
              const weddingEvent = eventById(response.eventId);
              const meal =
                response.mealOptionId === null
                  ? null
                  : mealOptionById(response.eventId, response.mealOptionId);
              return (
                <li key={response.eventId}>
                  <span>{weddingEvent?.shortTitle}</span>
                  <strong>{response.attending ? "Attending" : "Declining"}</strong>
                  {meal === undefined || meal === null ? null : <small>{meal.label}</small>}
                </li>
              );
            })}
          </ul>
          {guest.dietaryRestrictions.length === 0 ? null : (
            <p className="rsvp-summary-dietary">
              <span>Dietary restrictions</span>
              <strong>{guest.dietaryRestrictions}</strong>
            </p>
          )}
          {guest.plusOne === null ? null : (
            <div className="rsvp-summary-plus-one">
              <p>
                <span>Invited guest</span>
                <strong>{guest.plusOne.name}</strong>
              </p>
              {guest.eventResponses
                .filter((response) => response.attending)
                .map((response) => {
                  const selection = guest.plusOne?.mealSelections.find(
                    (meal) => meal.eventId === response.eventId,
                  );
                  const meal =
                    selection === undefined
                      ? null
                      : mealOptionById(response.eventId, selection.mealOptionId);

                  return (
                    <small key={response.eventId}>
                      {eventById(response.eventId)?.shortTitle}: Attending
                      {meal === undefined || meal === null ? "" : ` · ${meal.label}`}
                    </small>
                  );
                })}
              {guest.plusOne.dietaryRestrictions.length === 0 ? null : (
                <small>Dietary restrictions: {guest.plusOne.dietaryRestrictions}</small>
              )}
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

function overallAttendanceFor(responses: readonly RsvpEventResponse[]): OverallAttendance {
  if (responses.some((response) => response.attending === null)) {
    return null;
  }

  if (responses.every((response) => response.attending)) {
    return "all";
  }

  if (
    responses.some((response) => response.eventId === "wedding" && response.attending) &&
    responses.every((response) => response.eventId === "wedding" || !response.attending)
  ) {
    return "wedding-only";
  }

  return responses.every((response) => !response.attending) ? "none" : null;
}

function hasSelectedCancellation(
  household: RsvpHousehold,
  originalHousehold: RsvpHousehold,
): boolean {
  return originalHousehold.guests.some((originalGuest) => {
    const guest = household.guests.find((candidate) => candidate.id === originalGuest.id);
    if (guest === undefined) {
      return false;
    }

    const attendanceCancelled = originalGuest.eventResponses.some(
      (originalResponse) =>
        originalResponse.attending === true &&
        guest.eventResponses.find((response) => response.eventId === originalResponse.eventId)
          ?.attending === false,
    );
    const plusOneCancelled = originalGuest.plusOne !== null && guest.plusOne === null;

    return attendanceCancelled || plusOneCancelled;
  });
}

function firstIncompleteMessage(household: RsvpHousehold): string | null {
  for (const guest of household.guests) {
    for (const response of guest.eventResponses) {
      const weddingEvent = eventById(response.eventId);

      if (response.attending === null) {
        return `Choose ${guest.name}’s response for ${weddingEvent?.shortTitle ?? "each event"}.`;
      }

      if (
        response.attending &&
        weddingEvent !== undefined &&
        weddingEvent.mealOptions.length > 0 &&
        response.mealOptionId === null
      ) {
        return `Choose ${guest.name}’s meal for ${weddingEvent.shortTitle}.`;
      }
    }

    if (guest.plusOne !== null) {
      if (guest.plusOne.name.trim().length === 0) {
        return `Enter the full name of ${guest.name}’s guest.`;
      }

      for (const response of guest.eventResponses.filter((candidate) => candidate.attending)) {
        const weddingEvent = eventById(response.eventId);
        if (
          weddingEvent !== undefined &&
          weddingEvent.mealOptions.length > 0 &&
          !guest.plusOne.mealSelections.some((selection) => selection.eventId === response.eventId)
        ) {
          return `Choose ${guest.plusOne.name.trim()}’s meal for ${weddingEvent.shortTitle}.`;
        }
      }
    }
  }

  if (household.contactEmail.length === 0) {
    return "Enter an email address for the RSVP confirmation.";
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(household.contactEmail)) {
    return "Enter a valid confirmation email.";
  }

  return null;
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function stepLabel(step: RsvpStep): string {
  switch (step) {
    case "lookup":
      return "Find your invitation";
    case "respond":
      return "Household RSVP";
    case "review":
      return "Review everything";
    case "confirmed":
      return "RSVP confirmed";
  }
}

function stepTitle(step: RsvpStep, submitted: boolean): string {
  switch (step) {
    case "lookup":
      return "Let’s find your invitation.";
    case "respond":
      return submitted ? "Update your celebration plans." : "Tell us who can celebrate.";
    case "review":
      return "One last look.";
    case "confirmed":
      return "We have your response.";
  }
}

function stepIntroduction(step: RsvpStep, household: RsvpHousehold | null): string {
  switch (step) {
    case "lookup":
      return "Enter your full name exactly as it appears on your invitation.";
    case "respond":
      return household === null
        ? ""
        : `You’re responding for ${household.name}. Everyone named on the invitation is included below.`;
    case "review":
      return "Nothing is submitted until you confirm the complete household RSVP below.";
    case "confirmed":
      return "Every person and every event was submitted together.";
  }
}
