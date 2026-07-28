import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type SyntheticEvent, useId, useRef, useState, useTransition } from "react";
import { BotanicalStamp, LineFlourish } from "../components/garden-art.tsx";
import { WeddingMonogram } from "../components/wedding-monogram.tsx";
import {
  defaultEventIds,
  mealOptionById,
  rsvpEvents,
  type WeddingEventId,
} from "../content/rsvp.ts";
import type { AdminAccess } from "../lib/admin-auth.ts";
import type { EnrolledGuest, EnrolledHousehold, EnrollmentDashboard } from "../lib/enrollment.ts";
import {
  deleteHousehold,
  enrollHousehold,
  loadAdminDashboard,
  updateHousehold,
} from "../lib/enrollment-server-functions.ts";
import { normalizeGuestName } from "../lib/guest-name.ts";
import type { RsvpSettings } from "../lib/rsvp-settings.ts";
import { updateRsvpSettings } from "../lib/rsvp-settings-server-functions.ts";
import { buildVendorCsv, vendorExportFilename } from "../lib/vendor-export.ts";

type AdminSearch = {
  readonly error?: string;
};

type GuestDraft = {
  readonly rowId: string;
  readonly guestId?: string;
  readonly name: string;
  readonly plusOneAllowed: boolean;
  readonly eventIds: readonly WeddingEventId[];
};

type HouseholdDetailsDraft = {
  readonly householdName: string;
  readonly contactEmail: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
};

const initialGuestDraft: GuestDraft = {
  rowId: "draft-0",
  name: "",
  plusOneAllowed: false,
  eventIds: defaultEventIds,
};

const emptyHouseholdDetails: HouseholdDetailsDraft = {
  householdName: "",
  contactEmail: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  region: "",
  postalCode: "",
  country: "",
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
    return (
      <EnrollmentAdmin
        initialDashboard={loaderData.dashboard}
        initialSettings={loaderData.settings}
      />
    );
  }

  return <AdminSignIn access={loaderData.access} oauthError={search.error !== undefined} />;
}

function EnrollmentAdmin({
  initialDashboard,
  initialSettings,
}: {
  readonly initialDashboard: EnrollmentDashboard;
  readonly initialSettings: RsvpSettings;
}) {
  const formTitleId = useId();
  const introTitleId = useId();
  const rosterTitleId = useId();
  const settingsTitleId = useId();
  const formSectionRef = useRef<HTMLElement>(null);
  const nextGuestId = useRef(1);
  const enrollHouseholdFn = useServerFn(enrollHousehold);
  const updateHouseholdFn = useServerFn(updateHousehold);
  const deleteHouseholdFn = useServerFn(deleteHousehold);
  const updateRsvpSettingsFn = useServerFn(updateRsvpSettings);
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [settings, setSettings] = useState(initialSettings);
  const [settingsDraft, setSettingsDraft] = useState({
    deadline: initialSettings.deadline,
    isOpen: initialSettings.isOpen,
  });
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [editingHouseholdId, setEditingHouseholdId] = useState<string | null>(null);
  const [householdDetails, setHouseholdDetails] =
    useState<HouseholdDetailsDraft>(emptyHouseholdDetails);
  const [guestDrafts, setGuestDrafts] = useState<readonly GuestDraft[]>([initialGuestDraft]);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [settingsPending, startSettingsTransition] = useTransition();
  const openGuestCount = guestDrafts.filter((guest) => guest.plusOneAllowed).length;
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const visibleHouseholds = dashboard.households.filter(
    (household) =>
      normalizedSearch.length === 0 ||
      household.name.toLocaleLowerCase().includes(normalizedSearch) ||
      household.contactEmail.toLocaleLowerCase().includes(normalizedSearch) ||
      household.addressLine1.toLocaleLowerCase().includes(normalizedSearch) ||
      household.addressLine2.toLocaleLowerCase().includes(normalizedSearch) ||
      household.city.toLocaleLowerCase().includes(normalizedSearch) ||
      household.region.toLocaleLowerCase().includes(normalizedSearch) ||
      household.postalCode.toLocaleLowerCase().includes(normalizedSearch) ||
      household.country.toLocaleLowerCase().includes(normalizedSearch) ||
      household.message.toLocaleLowerCase().includes(normalizedSearch) ||
      household.guests.some((guest) => guest.name.toLocaleLowerCase().includes(normalizedSearch)),
  );

  const updateDetails = (update: Partial<HouseholdDetailsDraft>) => {
    setHouseholdDetails((current) => ({ ...current, ...update }));
  };

  const updateGuest = (rowId: string, update: Partial<Omit<GuestDraft, "rowId">>) => {
    setGuestDrafts((current) =>
      current.map((guest) => (guest.rowId === rowId ? { ...guest, ...update } : guest)),
    );
  };

  const addGuest = () => {
    const rowId = `draft-${nextGuestId.current}`;
    nextGuestId.current += 1;
    setGuestDrafts((current) => [...current, { ...initialGuestDraft, rowId }]);
  };

  const removeGuest = (rowId: string) => {
    setGuestDrafts((current) => current.filter((guest) => guest.rowId !== rowId));
  };

  const resetForm = () => {
    const rowId = `draft-${nextGuestId.current}`;
    nextGuestId.current += 1;
    setEditingHouseholdId(null);
    setHouseholdDetails(emptyHouseholdDetails);
    setGuestDrafts([{ ...initialGuestDraft, rowId }]);
    setError(null);
    setSuccess(null);
    setDeleteConfirmationOpen(false);
  };

  const startEditing = (household: EnrolledHousehold) => {
    setEditingHouseholdId(household.id);
    setHouseholdDetails({
      householdName: household.name,
      contactEmail: household.contactEmail,
      addressLine1: household.addressLine1,
      addressLine2: household.addressLine2,
      city: household.city,
      region: household.region,
      postalCode: household.postalCode,
      country: household.country,
    });
    setGuestDrafts(
      household.guests.map((guest) => ({
        rowId: `guest-${guest.id}`,
        guestId: guest.id,
        name: guest.name,
        plusOneAllowed: guest.plusOneAllowed,
        eventIds: guest.eventIds,
      })),
    );
    setError(null);
    setSuccess(null);
    setDeleteConfirmationOpen(false);
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedDetails = Object.fromEntries(
      Object.entries(householdDetails).map(([key, value]) => [key, value.trim()]),
    ) as unknown as HouseholdDetailsDraft;
    const trimmedGuests = guestDrafts.map((guest) => ({
      ...(guest.guestId === undefined ? {} : { id: guest.guestId }),
      name: guest.name.trim(),
      plusOneAllowed: guest.plusOneAllowed,
      eventIds: guest.eventIds,
    }));

    if (trimmedDetails.householdName.length === 0) {
      setError("Give this household a name.");
      setSuccess(null);
      return;
    }

    if (trimmedGuests.some((guest) => guest.name.length === 0)) {
      setError("Name each invited person, or remove the empty row.");
      setSuccess(null);
      return;
    }

    if (trimmedGuests.some((guest) => guest.eventIds.length === 0)) {
      setError("Invite each named person to at least one event.");
      setSuccess(null);
      return;
    }

    const submittedNames = trimmedGuests.map((guest) => normalizeGuestName(guest.name));
    const existingNames = new Set(
      dashboard.households
        .filter((household) => household.id !== editingHouseholdId)
        .flatMap((household) => household.guests.map((guest) => normalizeGuestName(guest.name))),
    );

    if (
      new Set(submittedNames).size !== submittedNames.length ||
      submittedNames.some((name) => existingNames.has(name))
    ) {
      setError("Each person needs a full name that is unique across the guest list.");
      setSuccess(null);
      return;
    }

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const nextDashboard =
          editingHouseholdId === null
            ? await enrollHouseholdFn({
                data: {
                  ...trimmedDetails,
                  guests: trimmedGuests.map(({ name, plusOneAllowed, eventIds }) => ({
                    name,
                    plusOneAllowed,
                    eventIds: [...eventIds],
                  })),
                },
              })
            : await updateHouseholdFn({
                data: {
                  householdId: editingHouseholdId,
                  ...trimmedDetails,
                  guests: trimmedGuests.map(({ id, name, plusOneAllowed, eventIds }) => ({
                    id,
                    name,
                    plusOneAllowed,
                    eventIds: [...eventIds],
                  })),
                },
              });

        setDashboard(nextDashboard);
        resetForm();
        setSuccess(
          editingHouseholdId === null
            ? `${trimmedDetails.householdName} is now on the guest list.`
            : `${trimmedDetails.householdName} has been updated.`,
        );
      } catch {
        setError(
          editingHouseholdId === null
            ? "That household could not be enrolled. Please try again."
            : "That household could not be updated. Please try again.",
        );
      }
    });
  };

  const handleDelete = () => {
    if (editingHouseholdId === null) {
      return;
    }

    const householdName = householdDetails.householdName.trim() || "this household";

    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const nextDashboard = await deleteHouseholdFn({
          data: { householdId: editingHouseholdId },
        });
        setDashboard(nextDashboard);
        resetForm();
        setSuccess(`${householdName} has been removed.`);
      } catch {
        setError("That household could not be removed. Please try again.");
      }
    });
  };

  const handleVendorExport = () => {
    const downloadUrl = URL.createObjectURL(
      new Blob([buildVendorCsv(dashboard)], { type: "text/csv;charset=utf-8" }),
    );
    const downloadLink = document.createElement("a");
    downloadLink.href = downloadUrl;
    downloadLink.download = vendorExportFilename(new Date());
    downloadLink.click();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
  };

  const handleSettingsSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSettingsError(null);
    setSettingsMessage(null);

    startSettingsTransition(async () => {
      try {
        const savedSettings = await updateRsvpSettingsFn({ data: settingsDraft });
        setSettings(savedSettings);
        setSettingsDraft({
          deadline: savedSettings.deadline,
          isOpen: savedSettings.isOpen,
        });
        setSettingsMessage("RSVP settings saved.");
      } catch {
        setSettingsError("The RSVP settings could not be saved. Please try again.");
      }
    });
  };

  return (
    <main aria-label="Wedding administration" className="admin-page">
      <BotanicalStamp className="admin-botanical admin-botanical-left" />
      <BotanicalStamp className="admin-botanical admin-botanical-right" />

      <header className="admin-header">
        <WeddingMonogram className="admin-monogram" />
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
          <SummaryItem label="RSVPs in" value={dashboard.responseSummary.respondedHouseholdCount} />
          <SummaryItem
            label="Wedding yes"
            value={dashboard.responseSummary.weddingAttendingCount}
          />
          <SummaryItem
            label="Rehearsal yes"
            value={dashboard.responseSummary.rehearsalDinnerAttendingCount}
          />
        </dl>

        <section aria-labelledby={settingsTitleId} className="admin-rsvp-settings">
          <div className="admin-section-heading">
            <p className="eyebrow">Guest response window</p>
            <h2 id={settingsTitleId}>RSVP settings</h2>
            <p>
              Full edits close after the deadline. Late cancellations remain available so the guest
              count stays accurate.
            </p>
          </div>
          <form onSubmit={handleSettingsSubmit}>
            <label className="admin-field">
              <span>RSVP deadline</span>
              <input
                onChange={(event) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    deadline: event.target.value,
                  }))
                }
                required
                type="date"
                value={settingsDraft.deadline}
              />
            </label>
            <label className="admin-rsvp-open-toggle">
              <input
                checked={settingsDraft.isOpen}
                onChange={(event) =>
                  setSettingsDraft((current) => ({
                    ...current,
                    isOpen: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span>
                Accept full RSVP changes
                <small>Turn this off to allow cancellations only before the deadline.</small>
              </span>
            </label>
            <div className="admin-rsvp-settings-action">
              <button
                className="button button-primary admin-rsvp-settings-button"
                disabled={settingsPending}
                type="submit"
              >
                {settingsPending ? "Saving…" : "Save RSVP settings"}
              </button>
              <span
                className={`admin-rsvp-status ${settings.fullEditingAllowed ? "" : "admin-rsvp-pending"}`}
              >
                {settings.fullEditingAllowed ? "Full editing open" : "Cancellations only"}
              </span>
            </div>
            <div aria-live="polite" className="admin-form-message admin-rsvp-settings-message">
              {settingsError === null ? null : (
                <p className="admin-auth-error" role="alert">
                  {settingsError}
                </p>
              )}
              {settingsMessage === null ? null : (
                <p className="admin-form-success">{settingsMessage}</p>
              )}
            </div>
          </form>
        </section>

        <div className="admin-workspace">
          <section
            aria-labelledby={formTitleId}
            className="admin-enrollment-card"
            ref={formSectionRef}
          >
            <div className="admin-section-heading">
              <p className="eyebrow">
                {editingHouseholdId === null ? "New invitation" : "Edit invitation"}
              </p>
              <h2 id={formTitleId}>
                {editingHouseholdId === null ? "Enroll a household" : "Update this household"}
              </h2>
              <p>
                Add the household’s contact details and named invitees. A checked +1 creates one
                additional unnamed seat.
              </p>
            </div>

            <form className="admin-enrollment-form" onSubmit={handleSubmit}>
              <div className="admin-contact-grid">
                <label className="admin-field">
                  <span>Household name</span>
                  <input
                    autoComplete="off"
                    maxLength={120}
                    onChange={(event) => updateDetails({ householdName: event.target.value })}
                    placeholder="For example, The Anderson household"
                    required
                    type="text"
                    value={householdDetails.householdName}
                  />
                </label>
                <label className="admin-field">
                  <span>Email</span>
                  <input
                    autoComplete="email"
                    maxLength={254}
                    onChange={(event) => updateDetails({ contactEmail: event.target.value })}
                    placeholder="name@example.com"
                    type="email"
                    value={householdDetails.contactEmail}
                  />
                </label>
              </div>

              <fieldset className="admin-address-fields">
                <legend>Mailing address</legend>
                <div className="admin-contact-grid">
                  <label className="admin-field admin-field-wide">
                    <span>Address line 1</span>
                    <input
                      autoComplete="address-line1"
                      maxLength={160}
                      onChange={(event) => updateDetails({ addressLine1: event.target.value })}
                      placeholder="Street address"
                      type="text"
                      value={householdDetails.addressLine1}
                    />
                  </label>
                  <label className="admin-field admin-field-wide">
                    <span>Address line 2</span>
                    <input
                      autoComplete="address-line2"
                      maxLength={160}
                      onChange={(event) => updateDetails({ addressLine2: event.target.value })}
                      placeholder="Apartment, suite, or unit"
                      type="text"
                      value={householdDetails.addressLine2}
                    />
                  </label>
                  <label className="admin-field">
                    <span>City</span>
                    <input
                      autoComplete="address-level2"
                      maxLength={100}
                      onChange={(event) => updateDetails({ city: event.target.value })}
                      type="text"
                      value={householdDetails.city}
                    />
                  </label>
                  <label className="admin-field">
                    <span>State / region</span>
                    <input
                      autoComplete="address-level1"
                      maxLength={100}
                      onChange={(event) => updateDetails({ region: event.target.value })}
                      type="text"
                      value={householdDetails.region}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Postal code</span>
                    <input
                      autoComplete="postal-code"
                      maxLength={32}
                      onChange={(event) => updateDetails({ postalCode: event.target.value })}
                      type="text"
                      value={householdDetails.postalCode}
                    />
                  </label>
                  <label className="admin-field">
                    <span>Country</span>
                    <input
                      autoComplete="country-name"
                      maxLength={100}
                      onChange={(event) => updateDetails({ country: event.target.value })}
                      type="text"
                      value={householdDetails.country}
                    />
                  </label>
                </div>
              </fieldset>

              <fieldset className="admin-guest-fields">
                <legend>People named on the invitation</legend>
                {guestDrafts.map((guest, index) => (
                  <div className="admin-guest-row" key={guest.rowId}>
                    <label className="admin-field admin-guest-name">
                      <span>Person {index + 1}</span>
                      <input
                        autoComplete="off"
                        maxLength={100}
                        onChange={(event) => updateGuest(guest.rowId, { name: event.target.value })}
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
                          updateGuest(guest.rowId, { plusOneAllowed: event.target.checked })
                        }
                        type="checkbox"
                      />
                      <span>
                        May bring a +1
                        <small>Creates one open guest seat</small>
                      </span>
                    </label>
                    <fieldset className="admin-event-toggles">
                      <legend>Invited events</legend>
                      {rsvpEvents.map((weddingEvent) => (
                        <label key={weddingEvent.id}>
                          <input
                            checked={guest.eventIds.includes(weddingEvent.id)}
                            onChange={(event) =>
                              updateGuest(guest.rowId, {
                                eventIds: event.target.checked
                                  ? [...guest.eventIds, weddingEvent.id]
                                  : guest.eventIds.filter((eventId) => eventId !== weddingEvent.id),
                              })
                            }
                            type="checkbox"
                          />
                          <span>{weddingEvent.shortTitle}</span>
                        </label>
                      ))}
                    </fieldset>
                    {guestDrafts.length > 1 ? (
                      <button
                        aria-label={`Remove person ${index + 1}`}
                        className="admin-remove-person"
                        onClick={() => removeGuest(guest.rowId)}
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

              <div className="admin-form-actions">
                <button
                  className="button button-primary admin-enroll-button"
                  disabled={isPending}
                  type="submit"
                >
                  {isPending
                    ? editingHouseholdId === null
                      ? "Enrolling…"
                      : "Saving…"
                    : editingHouseholdId === null
                      ? "Enroll household"
                      : "Save household"}
                </button>
                {editingHouseholdId === null ? null : (
                  <>
                    <button
                      className="button admin-secondary-button"
                      disabled={isPending}
                      onClick={resetForm}
                      type="button"
                    >
                      Cancel
                    </button>
                    <button
                      className="admin-delete-household"
                      disabled={isPending}
                      onClick={() => setDeleteConfirmationOpen(true)}
                      type="button"
                    >
                      Remove household
                    </button>
                  </>
                )}
              </div>
              {editingHouseholdId !== null && deleteConfirmationOpen ? (
                <div className="admin-delete-confirmation" role="alert">
                  <p>
                    Remove {householdDetails.householdName || "this household"} and all of its named
                    guests?
                  </p>
                  <div>
                    <button disabled={isPending} onClick={handleDelete} type="button">
                      {isPending ? "Removing…" : "Yes, remove household"}
                    </button>
                    <button
                      disabled={isPending}
                      onClick={() => setDeleteConfirmationOpen(false)}
                      type="button"
                    >
                      Keep household
                    </button>
                  </div>
                </div>
              ) : null}
            </form>
          </section>

          <section aria-labelledby={rosterTitleId} className="admin-roster-card">
            <div className="admin-roster-header">
              <div className="admin-section-heading">
                <p className="eyebrow">Enrolled so far</p>
                <h2 id={rosterTitleId}>Households</h2>
                <p>Export a vendor-ready roster with event responses, meals, and dietary needs.</p>
              </div>
              {dashboard.households.length > 0 ? (
                <div className="admin-roster-tools">
                  <button
                    className="admin-export-button"
                    onClick={handleVendorExport}
                    type="button"
                  >
                    Export vendor CSV
                  </button>
                  <label className="admin-search">
                    <span className="sr-only">Search households and guests</span>
                    <input
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search the guest list"
                      type="search"
                      value={searchQuery}
                    />
                  </label>
                </div>
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
                          {household.namedGuestCount} named
                          {household.plusOneCount > 0 ? ` · ${household.plusOneCount} open +1` : ""}{" "}
                          · {household.invitedSeatCount} total
                        </p>
                      </div>
                      <div className="admin-household-actions">
                        <span
                          className={`admin-rsvp-status ${household.respondedAt === null ? "admin-rsvp-pending" : ""}`}
                        >
                          {household.respondedAt === null ? "Awaiting RSVP" : "RSVP received"}
                        </span>
                        <span className="admin-seat-count">
                          {household.invitedSeatCount}{" "}
                          {pluralize("seat", household.invitedSeatCount)}
                        </span>
                        <button
                          className="admin-edit-household"
                          onClick={() => startEditing(household)}
                          type="button"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                    {hasContactDetails(household) ? (
                      <div className="admin-household-contact">
                        {household.contactEmail.length === 0 ? null : (
                          <a href={`mailto:${household.contactEmail}`}>{household.contactEmail}</a>
                        )}
                        {formatMailingAddress(household).length === 0 ? null : (
                          <address>{formatMailingAddress(household).join(" · ")}</address>
                        )}
                      </div>
                    ) : null}
                    {household.message.length === 0 ? null : (
                      <blockquote className="admin-household-message">
                        <span>Message to Emma &amp; Eric</span>
                        <p>{household.message}</p>
                      </blockquote>
                    )}
                    <ul className="admin-named-guests">
                      {household.guests.map((guest) => (
                        <li key={guest.id}>
                          <div>
                            <span>{guest.name}</span>
                            <em>
                              {guest.eventIds
                                .map((eventId) => eventResponseLabel(guest, eventId))
                                .join(" · ") || "No events assigned"}
                            </em>
                            {guest.plusOneName.length === 0 ? null : (
                              <em>Guest: {guest.plusOneName}</em>
                            )}
                            {guest.dietaryRestrictions.length === 0 ? null : (
                              <em>Dietary restrictions: {guest.dietaryRestrictions}</em>
                            )}
                            {guest.plusOneDietaryRestrictions.length === 0 ? null : (
                              <em>
                                {guest.plusOneName || "Guest"}’s dietary restrictions:{" "}
                                {guest.plusOneDietaryRestrictions}
                              </em>
                            )}
                          </div>
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

function eventResponseLabel(guest: EnrolledGuest, eventId: WeddingEventId) {
  const weddingEvent = rsvpEvents.find((event) => event.id === eventId);
  const eventLabel = weddingEvent?.shortTitle ?? eventId;
  const response = guest.eventResponses.find((candidate) => candidate.eventId === eventId);

  if (response === undefined) {
    return eventLabel;
  }

  if (!response.attending) {
    return `${eventLabel} · Declining`;
  }

  const meal =
    response.mealOptionId.length === 0 ? undefined : mealOptionById(eventId, response.mealOptionId);

  return `${eventLabel} · Attending${meal === undefined ? "" : ` · ${meal.label}`}`;
}

function pluralize(noun: string, count: number) {
  return count === 1 ? noun : `${noun}s`;
}

function hasContactDetails(household: EnrolledHousehold) {
  return household.contactEmail.length > 0 || formatMailingAddress(household).length > 0;
}

function formatMailingAddress(household: EnrolledHousehold) {
  const cityAndRegion = [household.city, household.region].filter(Boolean).join(", ");
  const locality = [cityAndRegion, household.postalCode].filter(Boolean).join(" ");

  return [household.addressLine1, household.addressLine2, locality, household.country].filter(
    (line) => line.length > 0,
  );
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
