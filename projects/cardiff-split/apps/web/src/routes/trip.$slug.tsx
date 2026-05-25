import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@templar/ui/components/badge";
import { Button } from "@templar/ui/components/button";
import { Input } from "@templar/ui/components/input";
import { Label } from "@templar/ui/components/label";
import { NativeSelect, NativeSelectOption } from "@templar/ui/components/native-select";
import {
  ActivityIcon,
  ArrowLeftRightIcon,
  CheckIcon,
  CopyIcon,
  PencilIcon,
  PlusIcon,
  ReceiptTextIcon,
  Share2Icon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react";
import {
  type ReactNode,
  type SyntheticEvent,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  basisPointsToPercentInput,
  centsToDollarInput,
  formatCurrency,
  formatSignedCurrency,
  parseDollarInput,
  parsePercentInput,
} from "../lib/money.ts";
import { exactSplitMismatchMessage, exactSplitToleranceCents } from "../lib/split-math.ts";
import type { TripSnapshot } from "../lib/trip-model.ts";
import {
  type Expense,
  type Participant,
  participantNameById,
  type Settlement,
} from "../lib/trip-model.ts";
import {
  addParticipant,
  deleteExpense,
  deleteSettlement,
  loadTrip,
  saveExpense,
  saveSettlement,
  updateParticipant,
} from "../lib/trip-server-functions.ts";

export const Route = createFileRoute("/trip/$slug")({
  component: TripRoute,
});

type ActiveView = "overview" | "people" | "expense" | "settle" | "activity" | "share";

type ExpensePayload = {
  readonly expenseId?: string;
  readonly title: string;
  readonly amountCents: number;
  readonly payerParticipantId: string;
  readonly expenseDate: string;
  readonly splitMethod: "equal" | "exact" | "percentage";
  readonly includedParticipantIds: readonly string[];
  readonly exactSplits: readonly {
    readonly participantId: string;
    readonly amountCents: number;
  }[];
  readonly percentageSplits: readonly {
    readonly participantId: string;
    readonly percentageBasisPoints: number;
  }[];
};

type SettlementPayload = {
  readonly settlementId?: string;
  readonly fromParticipantId: string;
  readonly toParticipantId: string;
  readonly amountCents: number;
};

type LoadState = "loading" | "ready" | "not-found" | "error";

function TripRoute() {
  const { slug } = Route.useParams();
  const loadTripFn = useServerFn(loadTrip);
  const addParticipantFn = useServerFn(addParticipant);
  const updateParticipantFn = useServerFn(updateParticipant);
  const saveExpenseFn = useServerFn(saveExpense);
  const deleteExpenseFn = useServerFn(deleteExpense);
  const saveSettlementFn = useServerFn(saveSettlement);
  const deleteSettlementFn = useServerFn(deleteSettlement);
  const [snapshot, setSnapshot] = useState<TripSnapshot | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>("overview");
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [editingSettlement, setEditingSettlement] = useState<Settlement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [isPending, startTransition] = useTransition();

  const refreshTrip = useCallback(async () => {
    const result = await loadTripFn({ data: { slug } });

    if (result === null) {
      setLoadState("not-found");
      return;
    }

    setSnapshot(result);
    setLoadState("ready");
  }, [loadTripFn, slug]);

  useEffect(() => {
    setSnapshot(null);
    setError(null);
    setLoadState("loading");

    startTransition(async () => {
      try {
        await refreshTrip();
      } catch (cause) {
        setLoadState(isMissingTripError(cause) ? "not-found" : "error");
      }
    });
  }, [refreshTrip]);

  const runTripAction = (action: () => Promise<TripSnapshot>, message: string) => {
    setError(null);
    startTransition(async () => {
      try {
        const nextSnapshot = await action();
        setSnapshot(nextSnapshot);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : message);
      }
    });
  };

  const handleAddParticipant = (name: string) => {
    runTripAction(
      () => addParticipantFn({ data: { tripSlug: slug, name } }),
      "Could not add that person.",
    );
  };

  const handleUpdateParticipant = (participant: {
    readonly participantId: string;
    readonly name: string;
    readonly avatarType: "emoji" | "initials";
    readonly avatarValue: string;
    readonly color: string;
  }) => {
    runTripAction(
      () => updateParticipantFn({ data: { tripSlug: slug, ...participant } }),
      "Could not update that person.",
    );
  };

  const handleSaveExpense = (payload: ExpensePayload) => {
    runTripAction(async () => {
      const nextSnapshot = await saveExpenseFn({
        data: {
          tripSlug: slug,
          ...payload,
          includedParticipantIds: [...payload.includedParticipantIds],
          exactSplits: [...payload.exactSplits],
          percentageSplits: [...payload.percentageSplits],
        },
      });
      setEditingExpense(null);
      setActiveView("overview");
      return nextSnapshot;
    }, "Could not save that expense.");
  };

  const handleDeleteExpense = (expenseId: string) => {
    runTripAction(
      () => deleteExpenseFn({ data: { tripSlug: slug, expenseId } }),
      "Could not delete that expense.",
    );
  };

  const handleSaveSettlement = (payload: SettlementPayload) => {
    runTripAction(async () => {
      const nextSnapshot = await saveSettlementFn({
        data: {
          tripSlug: slug,
          ...payload,
        },
      });
      setEditingSettlement(null);
      return nextSnapshot;
    }, "Could not save that payment.");
  };

  const handleDeleteSettlement = (settlementId: string) => {
    runTripAction(
      () => deleteSettlementFn({ data: { tripSlug: slug, settlementId } }),
      "Could not delete that payment.",
    );
  };

  if (loadState === "not-found") {
    return <TripNotFound />;
  }

  if (loadState === "error") {
    return <TripLoadError />;
  }

  if (snapshot === null) {
    return (
      <main className="cardiff-shell grid min-h-screen place-items-center px-4">
        <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm text-muted-foreground">
          <img alt="" className="size-8 rounded-lg" src="/cardiff-split-mark.svg" />
          Loading Cardiff Split...
        </div>
      </main>
    );
  }

  const hasParticipants = snapshot.participants.length > 0;

  return (
    <main className="cardiff-shell min-h-screen">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-4 sm:px-6 lg:px-8">
        <header className="rounded-lg border border-[#D9D1C3] bg-[#FFFDF8]/92 p-3 shadow-sm sm:p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link
                aria-label="Go to Cardiff Split home"
                className="shrink-0 rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-[#126C5A]/50"
                to="/"
              >
                <img
                  alt="Cardiff Split"
                  className="size-12 rounded-xl"
                  src="/cardiff-split-mark.svg"
                />
              </Link>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#52645E]">Cardiff Split</p>
                <h1 className="truncate text-2xl font-semibold tracking-normal text-[#12343B]">
                  {snapshot.trip.name}
                </h1>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-normal text-[#52645E]">
                Total spent
              </p>
              <p className="text-xl font-semibold tabular-nums text-[#12343B]">
                {formatCurrency(snapshot.totalSpentCents)}
              </p>
            </div>
          </div>
        </header>

        <ViewNav activeView={activeView} onChange={setActiveView} />

        {error === null ? null : (
          <div className="rounded-lg border border-[#E76F51]/30 bg-[#E76F51]/10 px-3 py-2 text-sm text-[#B94F36]">
            {error}
          </div>
        )}

        {activeView === "overview" ? (
          <OverviewView
            isPending={isPending}
            onAddExpense={() => {
              setEditingExpense(null);
              setActiveView("expense");
            }}
            onDeleteExpense={handleDeleteExpense}
            onEditExpense={(expense) => {
              setEditingExpense(expense);
              setActiveView("expense");
            }}
            onSettle={() => setActiveView("settle")}
            snapshot={snapshot}
          />
        ) : null}

        {activeView === "people" ? (
          <PeopleView
            isPending={isPending}
            onAddParticipant={handleAddParticipant}
            onUpdateParticipant={handleUpdateParticipant}
            participants={snapshot.participants}
          />
        ) : null}

        {activeView === "expense" ? (
          <ExpenseForm
            expense={editingExpense}
            isPending={isPending}
            onCancel={() => {
              setEditingExpense(null);
              setActiveView("overview");
            }}
            onSave={handleSaveExpense}
            participants={snapshot.participants}
          />
        ) : null}

        {activeView === "settle" ? (
          <SettleView
            editingSettlement={editingSettlement}
            isPending={isPending}
            onCancelEdit={() => setEditingSettlement(null)}
            onDeleteSettlement={handleDeleteSettlement}
            onEditSettlement={setEditingSettlement}
            onSaveSettlement={handleSaveSettlement}
            participants={snapshot.participants}
            settlements={snapshot.settlements}
            settlementRecommendations={snapshot.settlementRecommendations}
          />
        ) : null}

        {activeView === "activity" ? <ActivityView snapshot={snapshot} /> : null}

        {activeView === "share" ? <ShareView tripName={snapshot.trip.name} /> : null}

        {!hasParticipants && activeView !== "people" ? (
          <div className="rounded-lg border border-[#D9D1C3] bg-[#FFFDF8] p-4">
            <p className="font-medium text-[#12343B]">Add people to start splitting.</p>
            <Button className="mt-3" onClick={() => setActiveView("people")} type="button">
              <UsersIcon aria-hidden="true" className="size-4" />
              People
            </Button>
          </div>
        ) : null}
      </div>
    </main>
  );
}

function TripNotFound() {
  return (
    <main className="cardiff-shell grid min-h-screen place-items-center px-4">
      <section className="w-full max-w-md rounded-lg border border-[#D9D1C3] bg-[#FFFDF8]/92 p-6 text-center shadow-sm">
        <img
          alt="Cardiff Split"
          className="mx-auto size-14 rounded-xl"
          src="/cardiff-split-mark.svg"
        />
        <h1 className="mt-5 text-2xl font-semibold tracking-normal text-[#12343B]">
          Trip not found
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#52645E]">
          This Cardiff Split link may be incomplete, expired, or no longer available.
        </p>
        <Button asChild className="mt-5">
          <Link to="/">Create a new trip</Link>
        </Button>
      </section>
    </main>
  );
}

function TripLoadError() {
  return (
    <main className="cardiff-shell grid min-h-screen place-items-center px-4">
      <section className="w-full max-w-md rounded-lg border border-[#D9D1C3] bg-[#FFFDF8]/92 p-6 text-center shadow-sm">
        <img
          alt="Cardiff Split"
          className="mx-auto size-14 rounded-xl"
          src="/cardiff-split-mark.svg"
        />
        <h1 className="mt-5 text-2xl font-semibold tracking-normal text-[#12343B]">
          Could not load this trip
        </h1>
        <p className="mt-2 text-sm leading-6 text-[#52645E]">
          Refresh the page and try again. If the problem continues, create a new private trip link.
        </p>
        <Button asChild className="mt-5">
          <Link to="/">Back to Cardiff Split</Link>
        </Button>
      </section>
    </main>
  );
}

function isMissingTripError(cause: unknown) {
  if (cause instanceof Error) {
    return cause.message.includes("Trip not found") || cause.message.includes("Invalid input");
  }

  return false;
}

function ViewNav({
  activeView,
  onChange,
}: {
  readonly activeView: ActiveView;
  readonly onChange: (view: ActiveView) => void;
}) {
  const items: readonly {
    readonly view: ActiveView;
    readonly label: string;
    readonly icon: ReactNode;
  }[] = [
    { view: "overview", label: "Overview", icon: <ReceiptTextIcon className="size-4" /> },
    { view: "people", label: "People", icon: <UsersIcon className="size-4" /> },
    { view: "settle", label: "Settle up", icon: <ArrowLeftRightIcon className="size-4" /> },
    { view: "activity", label: "Activity", icon: <ActivityIcon className="size-4" /> },
    { view: "share", label: "Share", icon: <Share2Icon className="size-4" /> },
  ];

  return (
    <nav className="-mx-3 overflow-x-auto px-3">
      <div className="flex min-w-max gap-2">
        {items.map((item) => (
          <Button
            aria-current={activeView === item.view ? "page" : undefined}
            key={item.view}
            onClick={() => onChange(item.view)}
            size="sm"
            type="button"
            variant={activeView === item.view ? "default" : "outline"}
          >
            {item.icon}
            {item.label}
          </Button>
        ))}
      </div>
    </nav>
  );
}

function OverviewView({
  snapshot,
  isPending,
  onAddExpense,
  onEditExpense,
  onDeleteExpense,
  onSettle,
}: {
  readonly snapshot: TripSnapshot;
  readonly isPending: boolean;
  readonly onAddExpense: () => void;
  readonly onEditExpense: (expense: Expense) => void;
  readonly onDeleteExpense: (expenseId: string) => void;
  readonly onSettle: () => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="rounded-lg border border-[#D9D1C3] bg-[#FFFDF8] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-[#12343B]">Balances</h2>
            <p className="text-sm text-[#52645E]">USD only</p>
          </div>
          <Button onClick={onSettle} type="button" variant="outline">
            <ArrowLeftRightIcon aria-hidden="true" className="size-4" />
            Settle up
          </Button>
        </div>

        <div className="mt-4 grid gap-2">
          {snapshot.participants.length === 0 ? (
            <p className="rounded-md bg-[#ECE7DB] px-3 py-3 text-sm text-[#52645E]">
              No people yet.
            </p>
          ) : (
            snapshot.balances.map((balance) => {
              const participant = snapshot.participants.find(
                (person) => person.id === balance.participantId,
              );

              if (participant === undefined) {
                return null;
              }

              return (
                <div
                  className="flex items-center justify-between gap-3 rounded-md border border-[#ECE7DB] bg-white/70 px-3 py-3"
                  data-testid={`balance-${participant.name}`}
                  key={participant.id}
                >
                  <ParticipantAvatar participant={participant} />
                  <div className="ml-auto text-right">
                    <p
                      className={`text-base font-semibold tabular-nums ${
                        balance.balanceCents > 0
                          ? "balance-positive"
                          : balance.balanceCents < 0
                            ? "balance-negative"
                            : "text-[#52645E]"
                      }`}
                    >
                      {formatSignedCurrency(balance.balanceCents)}
                    </p>
                    <p className="text-xs text-[#52645E]">
                      {balance.balanceCents > 0
                        ? "gets back"
                        : balance.balanceCents < 0
                          ? "pays"
                          : "settled"}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-lg border border-[#D9D1C3] bg-[#FFFDF8] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-normal text-[#12343B]">Expenses</h2>
            <p className="text-sm text-[#52645E]">{snapshot.expenses.length} ledger items</p>
          </div>
          <Button
            data-testid="add-expense-open"
            disabled={snapshot.participants.length === 0}
            onClick={onAddExpense}
            type="button"
          >
            <PlusIcon aria-hidden="true" className="size-4" />
            Add expense
          </Button>
        </div>

        <div className="mt-4 grid gap-2">
          {snapshot.expenses.length === 0 ? (
            <p className="rounded-md bg-[#ECE7DB] px-3 py-3 text-sm text-[#52645E]">
              No expenses yet.
            </p>
          ) : (
            snapshot.expenses.map((expense) => (
              <ExpenseRow
                expense={expense}
                isPending={isPending}
                key={expense.id}
                onDelete={onDeleteExpense}
                onEdit={onEditExpense}
                participants={snapshot.participants}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function ExpenseRow({
  expense,
  participants,
  isPending,
  onEdit,
  onDelete,
}: {
  readonly expense: Expense;
  readonly participants: readonly Participant[];
  readonly isPending: boolean;
  readonly onEdit: (expense: Expense) => void;
  readonly onDelete: (expenseId: string) => void;
}) {
  const payerName = participantNameById(participants, expense.payerParticipantId);

  return (
    <article className="rounded-md border border-[#ECE7DB] bg-white/75 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-semibold text-[#12343B]">{expense.title}</h3>
          <p className="text-sm text-[#52645E]">
            {payerName} paid on {formatDate(expense.expenseDate)}
          </p>
          <p className="mt-1 text-xs text-[#52645E]">
            Split between {expense.splits.length}{" "}
            {expense.splits.length === 1 ? "person" : "people"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums text-[#12343B]">
            {formatCurrency(expense.amountCents)}
          </p>
          <Badge className="mt-1 capitalize" variant="secondary">
            {expense.splitMethod}
          </Badge>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <Button onClick={() => onEdit(expense)} size="sm" type="button" variant="outline">
          <PencilIcon aria-hidden="true" className="size-4" />
          Edit
        </Button>
        <Button
          disabled={isPending}
          onClick={() => onDelete(expense.id)}
          size="sm"
          type="button"
          variant="destructive"
        >
          <Trash2Icon aria-hidden="true" className="size-4" />
          Delete
        </Button>
      </div>
    </article>
  );
}

function PeopleView({
  participants,
  isPending,
  onAddParticipant,
  onUpdateParticipant,
}: {
  readonly participants: readonly Participant[];
  readonly isPending: boolean;
  readonly onAddParticipant: (name: string) => void;
  readonly onUpdateParticipant: (participant: {
    readonly participantId: string;
    readonly name: string;
    readonly avatarType: "emoji" | "initials";
    readonly avatarValue: string;
    readonly color: string;
  }) => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <AddParticipantForm isPending={isPending} onAddParticipant={onAddParticipant} />
      <div className="grid gap-3">
        {participants.length === 0 ? (
          <div className="rounded-lg border border-[#D9D1C3] bg-[#FFFDF8] p-4 text-sm text-[#52645E]">
            Add at least one person before adding expenses.
          </div>
        ) : (
          participants.map((participant) => (
            <ParticipantEditor
              isPending={isPending}
              key={participant.id}
              onUpdateParticipant={onUpdateParticipant}
              participant={participant}
            />
          ))
        )}
      </div>
    </section>
  );
}

function AddParticipantForm({
  isPending,
  onAddParticipant,
}: {
  readonly isPending: boolean;
  readonly onAddParticipant: (name: string) => void;
}) {
  const nameId = useId();
  const [name, setName] = useState("");

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();

    if (trimmedName.length === 0) {
      return;
    }

    onAddParticipant(trimmedName);
    setName("");
  };

  return (
    <form
      className="h-fit rounded-lg border border-[#D9D1C3] bg-[#FFFDF8] p-4"
      onSubmit={handleSubmit}
    >
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            autoComplete="off"
            data-testid="participant-name-input"
            id={nameId}
            onChange={(event) => setName(event.currentTarget.value)}
            placeholder="Alex"
            value={name}
          />
        </div>
        <Button
          className="w-full"
          data-testid="add-participant-submit"
          disabled={isPending}
          type="submit"
        >
          <PlusIcon aria-hidden="true" className="size-4" />
          Add person
        </Button>
      </div>
    </form>
  );
}

function ParticipantEditor({
  participant,
  isPending,
  onUpdateParticipant,
}: {
  readonly participant: Participant;
  readonly isPending: boolean;
  readonly onUpdateParticipant: (participant: {
    readonly participantId: string;
    readonly name: string;
    readonly avatarType: "emoji" | "initials";
    readonly avatarValue: string;
    readonly color: string;
  }) => void;
}) {
  const [name, setName] = useState(participant.name);
  const [avatarValue, setAvatarValue] = useState(participant.avatarValue);
  const [color, setColor] = useState(participant.color);

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    onUpdateParticipant({
      participantId: participant.id,
      name,
      avatarType: "initials",
      avatarValue,
      color,
    });
  };

  return (
    <form className="rounded-lg border border-[#D9D1C3] bg-[#FFFDF8] p-4" onSubmit={handleSubmit}>
      <div className="flex items-start gap-3">
        <ParticipantAvatar
          participant={{
            ...participant,
            avatarType: "initials",
            avatarValue,
            color,
            name,
          }}
        />
        <div className="grid flex-1 gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input onChange={(event) => setName(event.currentTarget.value)} value={name} />
          </div>
          <div className="space-y-2">
            <Label>Avatar</Label>
            <Input
              maxLength={8}
              onChange={(event) => setAvatarValue(event.currentTarget.value)}
              value={avatarValue}
            />
          </div>
          <div className="flex items-end gap-2">
            <Input
              aria-label="Avatar color"
              className="h-9 w-12 p-1"
              onChange={(event) => setColor(event.currentTarget.value)}
              type="color"
              value={color}
            />
            <Button disabled={isPending} type="submit" variant="outline">
              <CheckIcon aria-hidden="true" className="size-4" />
              Save
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

function ExpenseForm({
  participants,
  expense,
  isPending,
  onSave,
  onCancel,
}: {
  readonly participants: readonly Participant[];
  readonly expense: Expense | null;
  readonly isPending: boolean;
  readonly onSave: (payload: ExpensePayload) => void;
  readonly onCancel: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [title, setTitle] = useState(expense?.title ?? "");
  const [amount, setAmount] = useState(
    expense === null ? "" : centsToDollarInput(expense.amountCents),
  );
  const [payerParticipantId, setPayerParticipantId] = useState<string | null>(
    expense?.payerParticipantId ?? null,
  );
  const [expenseDate, setExpenseDate] = useState(
    expense === null ? today : expense.expenseDate.slice(0, 10),
  );
  const [splitMethod, setSplitMethod] = useState<"equal" | "exact" | "percentage">(
    expense?.splitMethod ?? "equal",
  );
  const [includedParticipantIds, setIncludedParticipantIds] = useState<string[]>(
    expense === null
      ? participants.map((participant) => participant.id)
      : expense.splits.map((split) => split.participantId),
  );
  const [exactValues, setExactValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      expense?.splits.map((split) => [
        split.participantId,
        centsToDollarInput(split.amountCents),
      ]) ?? [],
    ),
  );
  const [percentageValues, setPercentageValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      expense?.splits.map((split) => [
        split.participantId,
        split.percentageBasisPoints === null
          ? ""
          : basisPointsToPercentInput(split.percentageBasisPoints),
      ]) ?? [],
    ),
  );
  const [formError, setFormError] = useState<string | null>(null);

  const amountCents = parseDollarInput(amount);

  const splitSummary = useMemo(() => {
    if (amountCents === null || includedParticipantIds.length === 0) {
      return null;
    }

    if (splitMethod === "equal") {
      return `${formatCurrency(amountCents)} across ${includedParticipantIds.length}`;
    }

    if (splitMethod === "exact") {
      const total = includedParticipantIds.reduce(
        (sum, participantId) => sum + (parseDollarInput(exactValues[participantId] ?? "") ?? 0),
        0,
      );

      return `${formatCurrency(total)} of ${formatCurrency(amountCents)}`;
    }

    const total = includedParticipantIds.reduce(
      (sum, participantId) => sum + (parsePercentInput(percentageValues[participantId] ?? "") ?? 0),
      0,
    );

    return `${basisPointsToPercentInput(total)}% of 100%`;
  }, [amountCents, exactValues, includedParticipantIds, percentageValues, splitMethod]);

  const toggleIncluded = (participantId: string) => {
    setFormError(null);
    setIncludedParticipantIds((current) =>
      current.includes(participantId)
        ? current.filter((id) => id !== participantId)
        : [...current, participantId],
    );
  };

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextAmountCents = parseDollarInput(amount);

    if (title.trim().length === 0) {
      setFormError("Title is required.");
      return;
    }

    if (nextAmountCents === null || nextAmountCents <= 0) {
      setFormError("Amount must be greater than $0.00.");
      return;
    }

    if (payerParticipantId === null) {
      setFormError("Who paid is required.");
      return;
    }

    const exactSplits = includedParticipantIds
      .map((participantId) => ({
        participantId,
        amountCents: parseDollarInput(exactValues[participantId] ?? ""),
      }))
      .filter((split) => split.amountCents !== 0)
      .map((split) => ({
        participantId: split.participantId,
        amountCents: split.amountCents ?? Number.NaN,
      }));
    const percentageSplits = includedParticipantIds.map((participantId) => ({
      participantId,
      percentageBasisPoints: parsePercentInput(percentageValues[participantId] ?? "") ?? Number.NaN,
    }));
    const submittedParticipantIds =
      splitMethod === "exact"
        ? exactSplits.map((split) => split.participantId)
        : includedParticipantIds;

    if (submittedParticipantIds.length === 0) {
      setFormError("At least one participant must be included.");
      return;
    }

    if (splitMethod === "exact") {
      if (exactSplits.some((split) => !Number.isInteger(split.amountCents))) {
        setFormError("Enter exact amounts for everyone included.");
        return;
      }

      const total = exactSplits.reduce((sum, split) => sum + split.amountCents, 0);

      if (Math.abs(total - nextAmountCents) > exactSplitToleranceCents) {
        setFormError(exactSplitMismatchMessage(total, nextAmountCents));
        return;
      }
    }

    if (splitMethod === "percentage") {
      if (percentageSplits.some((split) => !Number.isInteger(split.percentageBasisPoints))) {
        setFormError("Enter percentages for everyone included.");
        return;
      }

      const total = percentageSplits.reduce((sum, split) => sum + split.percentageBasisPoints, 0);

      if (total !== 10_000) {
        setFormError("Percentages must equal 100%.");
        return;
      }
    }

    setFormError(null);
    onSave({
      ...(expense === null ? {} : { expenseId: expense.id }),
      title: title.trim(),
      amountCents: nextAmountCents,
      payerParticipantId,
      expenseDate,
      splitMethod,
      includedParticipantIds: submittedParticipantIds,
      exactSplits: splitMethod === "exact" ? exactSplits : [],
      percentageSplits: splitMethod === "percentage" ? percentageSplits : [],
    });
  };

  return (
    <form
      className="mx-auto grid w-full max-w-3xl gap-4 rounded-lg border border-[#D9D1C3] bg-[#FFFDF8] p-4"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-[#12343B]">
            {expense === null ? "Add expense" : "Edit expense"}
          </h2>
          <p className="text-sm text-[#52645E]">{splitSummary ?? "Split between"}</p>
        </div>
        <Button onClick={onCancel} type="button" variant="outline">
          Cancel
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            autoComplete="off"
            data-testid="expense-title"
            onChange={(event) => {
              setFormError(null);
              setTitle(event.currentTarget.value);
            }}
            placeholder="Dinner"
            value={title}
          />
        </div>
        <div className="space-y-2">
          <Label>Amount</Label>
          <Input
            data-testid="expense-amount"
            inputMode="decimal"
            onChange={(event) => {
              setFormError(null);
              setAmount(event.currentTarget.value);
            }}
            placeholder="42.00"
            value={amount}
          />
        </div>
        <div className="space-y-2">
          <Label>Who paid?</Label>
          <NativeSelect
            className="w-full"
            data-testid="expense-payer"
            required
            aria-invalid={payerParticipantId === null && formError !== null}
            onChange={(event) => {
              setFormError(null);
              setPayerParticipantId(
                event.currentTarget.value.length === 0 ? null : event.currentTarget.value,
              );
            }}
            value={payerParticipantId ?? ""}
          >
            <NativeSelectOption value="">Select who paid</NativeSelectOption>
            {participants.map((participant) => (
              <NativeSelectOption key={participant.id} value={participant.id}>
                {participant.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-2">
          <Label>Date</Label>
          <Input
            onChange={(event) => {
              setFormError(null);
              setExpenseDate(event.currentTarget.value);
            }}
            type="date"
            value={expenseDate}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Split method</Label>
        <div className="grid grid-cols-3 gap-2">
          {(["equal", "exact", "percentage"] as const).map((method) => (
            <Button
              key={method}
              onClick={() => {
                setFormError(null);
                setSplitMethod(method);
              }}
              type="button"
              variant={splitMethod === method ? "default" : "outline"}
            >
              {method === "percentage" ? "Percent" : titleCase(method)}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <Label>Split between</Label>
        <div className="grid gap-2">
          {participants.map((participant) => {
            const included = includedParticipantIds.includes(participant.id);

            return (
              <div
                className="grid gap-2 rounded-md border border-[#ECE7DB] bg-white/70 p-2 sm:grid-cols-[1fr_10rem]"
                key={participant.id}
              >
                <Button
                  aria-pressed={included}
                  className="justify-start"
                  data-testid={`include-${participant.name}`}
                  onClick={() => toggleIncluded(participant.id)}
                  type="button"
                  variant={included ? "secondary" : "outline"}
                >
                  <ParticipantAvatar participant={participant} />
                </Button>
                {splitMethod === "exact" ? (
                  <Input
                    aria-label={`${participant.name} exact amount`}
                    disabled={!included}
                    inputMode="decimal"
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      setFormError(null);
                      setExactValues((current) => ({
                        ...current,
                        [participant.id]: nextValue,
                      }));
                    }}
                    placeholder="0.00"
                    value={exactValues[participant.id] ?? ""}
                  />
                ) : null}
                {splitMethod === "percentage" ? (
                  <Input
                    aria-label={`${participant.name} percentage`}
                    disabled={!included}
                    inputMode="decimal"
                    onChange={(event) => {
                      const nextValue = event.currentTarget.value;
                      setFormError(null);
                      setPercentageValues((current) => ({
                        ...current,
                        [participant.id]: nextValue,
                      }));
                    }}
                    placeholder="0"
                    value={percentageValues[participant.id] ?? ""}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {formError === null ? null : (
        <p className="rounded-md border border-[#E76F51]/30 bg-[#E76F51]/10 px-3 py-2 text-sm text-[#B94F36]">
          {formError}
        </p>
      )}

      <Button className="h-12" data-testid="save-expense" disabled={isPending} type="submit">
        <CheckIcon aria-hidden="true" className="size-4" />
        Save expense
      </Button>
    </form>
  );
}

function SettleView({
  participants,
  settlements,
  settlementRecommendations,
  editingSettlement,
  isPending,
  onSaveSettlement,
  onEditSettlement,
  onCancelEdit,
  onDeleteSettlement,
}: {
  readonly participants: readonly Participant[];
  readonly settlements: readonly Settlement[];
  readonly settlementRecommendations: TripSnapshot["settlementRecommendations"];
  readonly editingSettlement: Settlement | null;
  readonly isPending: boolean;
  readonly onSaveSettlement: (payload: SettlementPayload) => void;
  readonly onEditSettlement: (settlement: Settlement) => void;
  readonly onCancelEdit: () => void;
  readonly onDeleteSettlement: (settlementId: string) => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
      <div className="rounded-lg border border-[#D9D1C3] bg-[#FFFDF8] p-4">
        <div>
          <h2 className="text-xl font-semibold tracking-normal text-[#12343B]">Settle up</h2>
          <p className="text-sm text-[#52645E]">Recommendations update after each payment.</p>
        </div>

        <div className="mt-4 grid gap-3">
          {settlementRecommendations.length === 0 ? (
            <div className="rounded-md bg-[#E8DDC8] px-3 py-4 text-center font-medium text-[#12343B]">
              Everyone is settled
            </div>
          ) : (
            settlementRecommendations.map((recommendation) => (
              <article
                className="rounded-md border border-[#ECE7DB] bg-white/75 p-3"
                key={`${recommendation.fromParticipantId}-${recommendation.toParticipantId}-${recommendation.amountCents}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#12343B]">
                      {participantNameById(participants, recommendation.fromParticipantId)} pays{" "}
                      {participantNameById(participants, recommendation.toParticipantId)}
                    </p>
                    <p className="text-sm text-[#52645E]">
                      {formatCurrency(recommendation.amountCents)}
                    </p>
                  </div>
                  <Button
                    data-testid="mark-paid"
                    disabled={isPending}
                    onClick={() =>
                      onSaveSettlement({
                        fromParticipantId: recommendation.fromParticipantId,
                        toParticipantId: recommendation.toParticipantId,
                        amountCents: recommendation.amountCents,
                      })
                    }
                    type="button"
                  >
                    <CheckIcon aria-hidden="true" className="size-4" />
                    Mark paid
                  </Button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="grid content-start gap-4">
        {editingSettlement === null ? null : (
          <SettlementForm
            isPending={isPending}
            onCancel={onCancelEdit}
            onSave={onSaveSettlement}
            participants={participants}
            settlement={editingSettlement}
          />
        )}

        <div className="rounded-lg border border-[#D9D1C3] bg-[#FFFDF8] p-4">
          <h3 className="text-lg font-semibold tracking-normal text-[#12343B]">
            Recorded payments
          </h3>
          <div className="mt-3 grid gap-2">
            {settlements.length === 0 ? (
              <p className="rounded-md bg-[#ECE7DB] px-3 py-3 text-sm text-[#52645E]">
                No payments recorded.
              </p>
            ) : (
              settlements.map((settlement) => (
                <article
                  className="rounded-md border border-[#ECE7DB] bg-white/75 p-3"
                  key={settlement.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-[#12343B]">
                        {participantNameById(participants, settlement.fromParticipantId)} paid{" "}
                        {participantNameById(participants, settlement.toParticipantId)}
                      </p>
                      <p className="text-sm text-[#52645E]">
                        {formatCurrency(settlement.amountCents)} on{" "}
                        {formatDate(settlement.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => onEditSettlement(settlement)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <PencilIcon aria-hidden="true" className="size-4" />
                        Edit
                      </Button>
                      <Button
                        disabled={isPending}
                        onClick={() => onDeleteSettlement(settlement.id)}
                        size="sm"
                        type="button"
                        variant="destructive"
                      >
                        <Trash2Icon aria-hidden="true" className="size-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function SettlementForm({
  participants,
  settlement,
  isPending,
  onSave,
  onCancel,
}: {
  readonly participants: readonly Participant[];
  readonly settlement: Settlement;
  readonly isPending: boolean;
  readonly onSave: (payload: SettlementPayload) => void;
  readonly onCancel: () => void;
}) {
  const [fromParticipantId, setFromParticipantId] = useState(settlement.fromParticipantId);
  const [toParticipantId, setToParticipantId] = useState(settlement.toParticipantId);
  const [amount, setAmount] = useState(centsToDollarInput(settlement.amountCents));
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountCents = parseDollarInput(amount);

    if (amountCents === null || amountCents <= 0) {
      setFormError("Amount must be greater than $0.00.");
      return;
    }

    if (fromParticipantId === toParticipantId) {
      setFormError("Choose two different people.");
      return;
    }

    setFormError(null);
    onSave({
      settlementId: settlement.id,
      fromParticipantId,
      toParticipantId,
      amountCents,
    });
  };

  return (
    <form className="rounded-lg border border-[#D9D1C3] bg-[#FFFDF8] p-4" onSubmit={handleSubmit}>
      <h3 className="text-lg font-semibold tracking-normal text-[#12343B]">Edit payment</h3>
      <div className="mt-3 grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>From</Label>
            <NativeSelect
              className="w-full"
              onChange={(event) => setFromParticipantId(event.currentTarget.value)}
              value={fromParticipantId}
            >
              {participants.map((participant) => (
                <NativeSelectOption key={participant.id} value={participant.id}>
                  {participant.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <NativeSelect
              className="w-full"
              onChange={(event) => setToParticipantId(event.currentTarget.value)}
              value={toParticipantId}
            >
              {participants.map((participant) => (
                <NativeSelectOption key={participant.id} value={participant.id}>
                  {participant.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="space-y-2">
          <Label>Amount</Label>
          <Input
            inputMode="decimal"
            onChange={(event) => setAmount(event.currentTarget.value)}
            value={amount}
          />
        </div>
        {formError === null ? null : (
          <p className="rounded-md border border-[#E76F51]/30 bg-[#E76F51]/10 px-3 py-2 text-sm text-[#B94F36]">
            {formError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button onClick={onCancel} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={isPending} type="submit">
            Save payment
          </Button>
        </div>
      </div>
    </form>
  );
}

function ActivityView({ snapshot }: { readonly snapshot: TripSnapshot }) {
  return (
    <section className="rounded-lg border border-[#D9D1C3] bg-[#FFFDF8] p-4">
      <h2 className="text-xl font-semibold tracking-normal text-[#12343B]">Activity</h2>
      <div className="mt-4 grid gap-2" data-testid="activity-list">
        {snapshot.activityEvents.length === 0 ? (
          <p className="rounded-md bg-[#ECE7DB] px-3 py-3 text-sm text-[#52645E]">
            No activity yet.
          </p>
        ) : (
          snapshot.activityEvents.map((event) => (
            <article
              className="rounded-md border border-[#ECE7DB] bg-white/75 px-3 py-3"
              key={event.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[#12343B]">{event.summary}</p>
                  <p className="text-sm text-[#52645E]">{event.actorLabel}</p>
                </div>
                <time className="text-right text-xs text-[#52645E]" dateTime={event.createdAt}>
                  {formatDate(event.createdAt)}
                </time>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function ShareView({ tripName }: { readonly tripName: string }) {
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setShareUrl(window.location.href);
  }, []);

  const handleCopy = async () => {
    if (shareUrl.length === 0) {
      return;
    }

    await navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <section className="mx-auto grid w-full max-w-2xl gap-4 rounded-lg border border-[#D9D1C3] bg-[#FFFDF8] p-4">
      <div>
        <h2 className="text-xl font-semibold tracking-normal text-[#12343B]">Share trip</h2>
        <p className="text-sm text-[#52645E]">{tripName}</p>
      </div>
      <div className="rounded-md border border-[#ECE7DB] bg-white/75 p-3">
        <p className="break-all text-sm text-[#12343B]">{shareUrl}</p>
      </div>
      <Button className="h-12" onClick={() => void handleCopy()} type="button">
        <CopyIcon aria-hidden="true" className="size-4" />
        {copied ? "Copied" : "Copy link"}
      </Button>
      <p className="rounded-md bg-[#E8DDC8] px-3 py-3 text-sm leading-6 text-[#12343B]">
        Anyone with this private link can view and edit the trip.
      </p>
    </section>
  );
}

function ParticipantAvatar({ participant }: { readonly participant: Participant }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span
        className="grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: participant.color }}
      >
        {participant.avatarValue}
      </span>
      <span className="min-w-0 truncate font-medium text-[#12343B]">{participant.name}</span>
    </span>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
