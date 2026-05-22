import { createFileRoute } from "@tanstack/react-router";
import { Alert, AlertDescription, AlertTitle } from "@templar/ui/components/alert";
import { Badge } from "@templar/ui/components/badge";
import { Button } from "@templar/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@templar/ui/components/card";
import { Input } from "@templar/ui/components/input";
import { Label } from "@templar/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@templar/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@templar/ui/components/table";
import { useId, useMemo, useState } from "react";

export const Route = createFileRoute("/")({
  component: Home,
});

type DownPaymentMode = "dollars" | "percent";
type TermMode = "years" | "months";

type Scenario = {
  readonly id: string;
  readonly purchasePrice: number;
  readonly downPayment: number;
  readonly downPaymentPercent: number;
  readonly termMonths: number;
  readonly interestRate: number;
  readonly loanAmount: number;
  readonly monthlyPayment: number;
  readonly totalPaid: number;
  readonly totalInterest: number;
};

type FormState = {
  readonly purchasePrice: string;
  readonly downPayment: string;
  readonly downPaymentMode: DownPaymentMode;
  readonly term: string;
  readonly termMode: TermMode;
  readonly interestRate: string;
};

const initialForm: FormState = {
  purchasePrice: "650000",
  downPayment: "20",
  downPaymentMode: "percent",
  term: "30",
  termMode: "years",
  interestRate: "6.75",
};

const sampleScenarios: ReadonlyArray<Scenario> = [
  calculateScenario({
    purchasePrice: 650000,
    downPayment: 20,
    downPaymentMode: "percent",
    term: 30,
    termMode: "years",
    interestRate: 6.75,
  }),
  calculateScenario({
    purchasePrice: 650000,
    downPayment: 160000,
    downPaymentMode: "dollars",
    term: 15,
    termMode: "years",
    interestRate: 6.1,
  }),
];

function Home() {
  const purchasePriceId = useId();
  const downPaymentId = useId();
  const termId = useId();
  const interestRateId = useId();
  const [form, setForm] = useState<FormState>(initialForm);
  const [scenarios, setScenarios] = useState<ReadonlyArray<Scenario>>(sampleScenarios);
  const [error, setError] = useState<string | null>(null);
  const latestScenario = scenarios[0] ?? null;
  const preview = useMemo(() => {
    const purchasePrice = parseCurrency(form.purchasePrice);
    const downPayment = parseCurrency(form.downPayment);
    const downPaymentAmount =
      form.downPaymentMode === "percent" ? purchasePrice * (downPayment / 100) : downPayment;
    const loanAmount = Math.max(purchasePrice - downPaymentAmount, 0);

    return {
      downPaymentAmount,
      loanAmount,
    };
  }, [form]);

  const updateForm = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    try {
      const scenario = calculateScenario({
        purchasePrice: parseCurrency(form.purchasePrice),
        downPayment: parseCurrency(form.downPayment),
        downPaymentMode: form.downPaymentMode,
        term: parseCurrency(form.term),
        termMode: form.termMode,
        interestRate: parseCurrency(form.interestRate),
      });

      setScenarios((current) => [scenario, ...current]);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Review the inputs and try again.");
    }
  };

  const clearScenarios = () => {
    setScenarios([]);
    setError(null);
  };

  return (
    <main className="min-h-screen bg-[#f4f5f7] text-slate-950">
      <section className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-12">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <Badge className="w-fit bg-blue-100 text-blue-900 hover:bg-blue-100">
              Scenario planner
            </Badge>
            <div>
              <h1 className="text-4xl font-semibold tracking-normal text-blue-950 md:text-5xl">
                Loan Payment Calculator
              </h1>
              <p className="mt-3 max-w-2xl text-base text-slate-600">
                Compare mortgage scenarios by changing price, down payment, term, and rate.
              </p>
            </div>
          </div>
          {latestScenario === null ? null : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[38rem]">
              <Metric label="Loan amount" value={formatCurrency(latestScenario.loanAmount)} />
              <Metric label="Monthly" value={formatCurrency(latestScenario.monthlyPayment)} />
              <Metric label="Total paid" value={formatCurrency(latestScenario.totalPaid)} />
              <Metric label="Interest" value={formatCurrency(latestScenario.totalInterest)} />
            </div>
          )}
        </div>

        <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
          <Card className="h-fit border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <CardTitle>Run a scenario</CardTitle>
              <CardDescription>
                Enter either dollars or percent for the down payment.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-5" onSubmit={handleSubmit}>
                <div className="grid gap-2">
                  <Label htmlFor={purchasePriceId}>Purchase price</Label>
                  <Input
                    id={purchasePriceId}
                    inputMode="decimal"
                    onChange={(event) => updateForm("purchasePrice", event.currentTarget.value)}
                    placeholder="650,000"
                    value={form.purchasePrice}
                  />
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={downPaymentId}>Down payment</Label>
                    <Select
                      onValueChange={(value) =>
                        updateForm("downPaymentMode", value as DownPaymentMode)
                      }
                      value={form.downPaymentMode}
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percent">Percent</SelectItem>
                        <SelectItem value="dollars">Dollars</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    id={downPaymentId}
                    inputMode="decimal"
                    onChange={(event) => updateForm("downPayment", event.currentTarget.value)}
                    placeholder={form.downPaymentMode === "percent" ? "20" : "130,000"}
                    value={form.downPayment}
                  />
                  <p className="text-xs text-slate-500">
                    {form.downPaymentMode === "percent"
                      ? `${formatCurrency(preview.downPaymentAmount)} down`
                      : `${formatPercent(
                          preview.downPaymentAmount /
                            Math.max(parseCurrency(form.purchasePrice), 1),
                        )} down`}
                  </p>
                </div>

                <div className="grid gap-2">
                  <div className="flex items-center justify-between gap-3">
                    <Label htmlFor={termId}>Mortgage term</Label>
                    <Select
                      onValueChange={(value) => updateForm("termMode", value as TermMode)}
                      value={form.termMode}
                    >
                      <SelectTrigger className="h-8 w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="years">Years</SelectItem>
                        <SelectItem value="months">Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    id={termId}
                    inputMode="decimal"
                    onChange={(event) => updateForm("term", event.currentTarget.value)}
                    placeholder={form.termMode === "years" ? "30" : "360"}
                    value={form.term}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor={interestRateId}>Interest rate</Label>
                  <Input
                    id={interestRateId}
                    inputMode="decimal"
                    onChange={(event) => updateForm("interestRate", event.currentTarget.value)}
                    placeholder="6.75"
                    value={form.interestRate}
                  />
                </div>

                <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Estimated loan amount</span>
                    <span className="font-medium tabular-nums">
                      {formatCurrency(preview.loanAmount)}
                    </span>
                  </div>
                </div>

                {error === null ? null : (
                  <Alert variant="destructive">
                    <AlertTitle>Scenario needs attention</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button className="bg-blue-600 text-white hover:bg-blue-700" type="submit">
                  Generate rates
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="min-w-0 border-slate-200 bg-white shadow-sm">
            <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle>Scenario history</CardTitle>
                <CardDescription>
                  Each run shows the normalized loan amount, payment, payoff, and interest.
                </CardDescription>
              </div>
              <Button
                disabled={scenarios.length === 0}
                onClick={clearScenarios}
                type="button"
                variant="outline"
              >
                Clear
              </Button>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-md border border-slate-200">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50">
                        <TableHead>Purchase</TableHead>
                        <TableHead>Down</TableHead>
                        <TableHead>Term</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Loan amount</TableHead>
                        <TableHead>Monthly</TableHead>
                        <TableHead>Total paid</TableHead>
                        <TableHead>Total interest</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scenarios.length === 0 ? (
                        <TableRow>
                          <TableCell className="h-32 text-center text-slate-500" colSpan={8}>
                            Run a scenario to populate the table.
                          </TableCell>
                        </TableRow>
                      ) : (
                        scenarios.map((scenario) => (
                          <TableRow key={scenario.id}>
                            <TableCell className="font-medium tabular-nums">
                              {formatCurrency(scenario.purchasePrice)}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {formatCurrency(scenario.downPayment)}
                              <span className="block text-xs text-slate-500">
                                {formatPercent(scenario.downPaymentPercent)}
                              </span>
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {formatTerm(scenario.termMonths)}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {scenario.interestRate
                                .toFixed(3)
                                .replace(/0+$/, "")
                                .replace(/\.$/, "")}
                              %
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {formatCurrency(scenario.loanAmount)}
                            </TableCell>
                            <TableCell className="font-medium tabular-nums text-blue-900">
                              {formatCurrency(scenario.monthlyPayment)}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {formatCurrency(scenario.totalPaid)}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {formatCurrency(scenario.totalInterest)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-normal text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold tabular-nums text-slate-950">{value}</p>
    </div>
  );
}

function calculateScenario(input: {
  readonly purchasePrice: number;
  readonly downPayment: number;
  readonly downPaymentMode: DownPaymentMode;
  readonly term: number;
  readonly termMode: TermMode;
  readonly interestRate: number;
}): Scenario {
  const termMonths =
    input.termMode === "years" ? Math.round(input.term * 12) : Math.round(input.term);
  const downPayment =
    input.downPaymentMode === "percent"
      ? input.purchasePrice * (input.downPayment / 100)
      : input.downPayment;
  const loanAmount = input.purchasePrice - downPayment;

  if (!Number.isFinite(input.purchasePrice) || input.purchasePrice <= 0) {
    throw new Error("Purchase price must be greater than zero.");
  }

  if (!Number.isFinite(downPayment) || downPayment < 0) {
    throw new Error("Down payment must be zero or greater.");
  }

  if (downPayment >= input.purchasePrice) {
    throw new Error("Down payment must be less than the purchase price.");
  }

  if (!Number.isFinite(termMonths) || termMonths <= 0) {
    throw new Error("Mortgage term must be greater than zero.");
  }

  if (!Number.isFinite(input.interestRate) || input.interestRate < 0) {
    throw new Error("Interest rate must be zero or greater.");
  }

  const monthlyRate = input.interestRate / 100 / 12;
  const monthlyPayment =
    monthlyRate === 0
      ? loanAmount / termMonths
      : (loanAmount * monthlyRate * (1 + monthlyRate) ** termMonths) /
        ((1 + monthlyRate) ** termMonths - 1);
  const totalPaid = monthlyPayment * termMonths;
  const totalInterest = totalPaid - loanAmount;

  return {
    id: crypto.randomUUID(),
    purchasePrice: input.purchasePrice,
    downPayment,
    downPaymentPercent: downPayment / input.purchasePrice,
    termMonths,
    interestRate: input.interestRate,
    loanAmount,
    monthlyPayment,
    totalPaid,
    totalInterest,
  };
}

function parseCurrency(value: string) {
  const parsed = Number(value.replace(/[$,%\s,]/g, ""));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatPercent(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatTerm(months: number) {
  const years = months / 12;

  if (Number.isInteger(years)) {
    return `${years} ${years === 1 ? "year" : "years"}`;
  }

  return `${months} ${months === 1 ? "month" : "months"}`;
}
