"use client";

import { useEffect, useId, useRef } from "react";

import { Portrait } from "@/features/home/Portrait";

import "./logout-dialog.css";

export function ProfilePhotoDialog({
  open,
  previewSrc,
  canRemove,
  canConfirm,
  busy,
  error,
  onClose,
  onSelectFile,
  onRemove,
  onConfirm,
}: {
  open: boolean;
  previewSrc: string | null;
  canRemove: boolean;
  canConfirm: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSelectFile: (file: File) => void;
  onRemove: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const fileRef = useRef<HTMLInputElement>(null);

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
        <h2 id={titleId}>Edit photo</h2>
        <p id={descriptionId}>
          Choose a JPEG, PNG, or WebP photo. Confirm to save it on your account.
        </p>
        <div className="ae-logout-dialog__photo">
          <Portrait src={previewSrc} alt="Profile photo" />
        </div>
        <div className="ae-logout-dialog__photo-actions">
          <button
            className="ae-logout-dialog__btn ae-logout-dialog__btn--ghost"
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            Change photo
          </button>
          <button
            className="ae-logout-dialog__btn ae-logout-dialog__btn--ghost"
            type="button"
            disabled={busy || !canRemove}
            onClick={onRemove}
          >
            Remove
          </button>
          <input
            ref={fileRef}
            className="ae-logout-dialog__file"
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) {
                onSelectFile(file);
              }
            }}
          />
        </div>
        {error ? <p role="alert">{error}</p> : null}
        <div className="ae-logout-dialog__actions">
          <button
            className="ae-logout-dialog__btn"
            type="button"
            disabled={busy || !canConfirm}
            onClick={onConfirm}
          >
            {busy ? "Saving…" : "Confirm changes"}
          </button>
          <button
            className="ae-logout-dialog__btn ae-logout-dialog__btn--ghost"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
