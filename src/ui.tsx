import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { X } from "lucide-preact";

export function IconButton({
  label,
  children,
  onClick,
  active,
  disabled,
  className = "",
}: {
  label: string;
  children: ComponentChildren;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      class={`icon-button ${active ? "active" : ""} ${className}`}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
      <span class="button-tooltip" role="tooltip" aria-hidden="true">{label}</span>
    </button>
  );
}
export function Modal({
  title,
  children,
  close,
  className = "",
}: {
  title: string;
  children: ComponentChildren;
  close: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const dialog = ref.current!;
    dialog.showModal();
    const cancel = (e: Event) => {
      e.preventDefault();
      close();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      class={`modal ${className}`}
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div class="modal-inner">
        <div class="modal-heading">
          <h2>{title}</h2>
          <IconButton label="Close" onClick={close}>
            <X />
          </IconButton>
        </div>
        {children}
      </div>
    </dialog>
  );
}
