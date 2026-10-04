import { ArrowRight, Check, ChevronRight, X } from "lucide-react";
import { Dialog } from "radix-ui";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { createContext, useContext, useId, useRef } from "react";
import type { DiscoveryResponse, Severity } from "../lib/model.ts";
import { priority } from "../lib/model.ts";

export function Button({
  className = "",
  variant = "secondary",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button type="button" className={`button button-${variant} ${className}`} {...props}>
      {children}
    </button>
  );
}

export function Modal({
  title,
  description,
  children,
  onClose,
  size = "normal",
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  size?: "normal" | "wide" | "drawer";
}) {
  const returnFocus = useRef(document.activeElement);
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal modal-${size}`}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocus.current;
            if (target instanceof HTMLElement && target.isConnected) {
              target.focus();
            } else {
              document.querySelector("main")?.focus();
            }
          }}
        >
          <header className="modal-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label="Close dialog">
                <X />
              </button>
            </Dialog.Close>
          </header>
          {children}
          <ToastMessage />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export const ToastContext = createContext<{ message: string; onDismiss: () => void }>({
  message: "",
  onDismiss: () => undefined,
});

export function ToastMessage() {
  const { message, onDismiss } = useContext(ToastContext);
  if (!message) {
    return null;
  }
  return (
    <div className="toast" role="status" aria-live="polite">
      <span className="toast-icon">
        <Check />
      </span>
      <span>{message}</span>
      <button
        type="button"
        className="icon-button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        <X />
      </button>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <small>{hint}</small>}
    </div>
  );
}

export function PriorityBadge({ response }: { response: DiscoveryResponse }) {
  const severity = priority(response);
  return (
    <span className={`priority-badge priority-${severity ?? "none"}`}>
      <span className="badge-dot" />
      {severity ? priorityLabels[severity] : "No flags"}
    </span>
  );
}

export const priorityLabels: Record<Severity, string> = {
  high: "High priority",
  medium: "Medium priority",
  low: "Clarification",
};

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function TextAction({
  children,
  onClick,
  small = false,
}: {
  children: ReactNode;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <button type="button" className={`text-action ${small ? "small" : ""}`} onClick={onClick}>
      {children}
      {small ? <ChevronRight /> : <ArrowRight />}
    </button>
  );
}
