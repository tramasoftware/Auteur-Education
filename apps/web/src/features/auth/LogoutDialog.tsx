"use client";

import { useEffect, useId } from "react";

import "./logout-dialog.css";

export function LogoutDialog({
  open,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) {
    return null;
  }

  return (
    <div className="ae-logout-dialog">
      <button
        className="ae-logout-dialog__backdrop"
        type="button"
        aria-label="Close dialog"
        disabled={busy}
        onClick={onClose}
      />
      <div
        className="ae-logout-dialog__sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <h2 id={titleId}>Log out?</h2>
        <p id={descriptionId}>
          This ends your session and returns you to the landing page. You will need to sign in
          again to continue.
        </p>
        {error ? <p role="alert">{error}</p> : null}
        <div className="ae-logout-dialog__actions">
          <button className="ae-logout-dialog__btn" type="button" disabled={busy} onClick={onConfirm}>
            {busy ? "Logging out…" : "Yes, log out"}
          </button>
          <button
            className="ae-logout-dialog__btn ae-logout-dialog__btn--ghost"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}
