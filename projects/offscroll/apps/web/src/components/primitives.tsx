import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@templar/ui/components/dialog";
import { Leaf } from "lucide-react";
import { type ReactNode, useState } from "react";
import { initials, type Person, personColor } from "../lib/model.ts";

export function Brand() {
  return (
    <a className="brand" href="/" aria-label="Offscroll home">
      <span className="brand-mark">
        <Leaf size={23} strokeWidth={1.8} />
      </span>
      <span>
        offscroll<span className="brand-period">.</span>
      </span>
    </a>
  );
}

export function Avatar({ person, small = false }: { person: Person; small?: boolean }) {
  return (
    <span
      className={`avatar avatar-${personColor(person.id)}${small ? " small" : ""}`}
      role="img"
      aria-label={person.name}
      title={person.name}
    >
      {initials(person.name)}
    </span>
  );
}

export function AvatarStack({ people, max = 4 }: { people: Person[]; max?: number }) {
  return (
    <span className="avatar-stack">
      {people.slice(0, max).map((person) => (
        <Avatar key={person.id} person={person} small />
      ))}
      {people.length > max && (
        <span className="avatar small avatar-more">+{people.length - max}</span>
      )}
    </span>
  );
}

export function Modal({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const [opener] = useState(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        className={`offscroll-modal${wide ? " wide" : ""}`}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (
            opener?.isConnected &&
            !document.querySelector('[role="dialog"][data-state="open"]')
          ) {
            opener.focus();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: string | undefined;
  onAction?: (() => void) | undefined;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action && (
        <button className="button primary" type="button" onClick={onAction}>
          {action}
        </button>
      )}
    </div>
  );
}
