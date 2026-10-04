import { Check, FolderPlus } from "lucide-react";
import { useState } from "react";
import type { MatterDetails } from "../lib/model.ts";
import { matterDetailsSchema } from "../lib/model.ts";
import { Button, Field } from "./ui.tsx";

export function MatterForm({
  initial,
  onSave,
  isNew = false,
}: {
  initial: MatterDetails;
  onSave: (details: MatterDetails) => void;
  isNew?: boolean;
}) {
  const [values, setValues] = useState<MatterDetails>({ ...initial });
  const [error, setError] = useState("");
  const input = (
    key: keyof MatterDetails,
    id: string,
    placeholder: string,
    required = false,
    type = "text",
  ) => (
    <input
      id={id}
      type={type}
      value={values[key]}
      required={required}
      maxLength={key === "title" ? 200 : 500}
      placeholder={placeholder}
      onChange={(event) => setValues({ ...values, [key]: event.target.value })}
    />
  );
  return (
    <form
      className="matter-form"
      onSubmit={(event) => {
        event.preventDefault();
        const result = matterDetailsSchema.safeParse(values);
        if (!result.success) {
          setError(result.error.issues[0]?.message ?? "Check your matter details.");
          return;
        }
        onSave(result.data);
      }}
    >
      <Field label="Matter name">
        {(id) => input("title", id, "e.g. Mitchell v. Acme Industries", true)}
      </Field>
      <div className="form-grid">
        <Field label="Case number">{(id) => input("caseNumber", id, "e.g. 24-CV-01842")}</Field>
        <Field label="Client / moving party">{(id) => input("client", id, "Your client")}</Field>
      </div>
      <Field label="Court & jurisdiction">
        {(id) => input("court", id, "Court, county, and state")}
      </Field>
      <div className="form-grid">
        <Field label="Responding party">
          {(id) => input("respondingParty", id, "Opposing party")}
        </Field>
        <Field label="Opposing counsel">
          {(id) => input("opposingCounsel", id, "Name and firm")}
        </Field>
      </div>
      <Field label="Your name & firm">{(id) => input("sender", id, "Letter signatory")}</Field>
      <Field
        label="Requested supplement date (optional)"
        hint="Used in your letter only. This is not a calculated filing deadline; independently verify and calendar all court deadlines."
      >
        {(id) => input("responseBy", id, "", false, "date")}
      </Field>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-footer">
        <span>Details stay in your local workspace.</span>
        <Button variant="primary" type="submit">
          {isNew ? <FolderPlus /> : <Check />}
          {isNew ? "Create matter" : "Save details"}
        </Button>
      </div>
    </form>
  );
}
