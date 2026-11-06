"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from "react";

import {
  ApiError,
  createAccountPhoto,
  deleteAccountPhoto,
  getAccountProfile,
  updateAccountPhoto,
  updateAccountProfile,
  updateAccountTextSize,
  type AccountProfile,
} from "@/lib/api";
import { accountSession } from "@/lib/auth/claims";
import {
  GENDERS,
  birthDateLimits,
  formatBirthDate,
  genderLabel,
  registrationProfile,
} from "@/lib/auth/profile";
import {
  accountStampNow,
  clearMemberDisplay,
  currentUserId,
  readMemberDisplay,
  rememberAccount,
  rememberFetchedAccount,
} from "@/lib/member-display";
import {
  LESSON_BODY_PX,
  TEXT_SIZES,
  clearReadingPreference,
  rememberReadingPreference,
  textSizeOrStandard,
  textSizeScale,
  type TextSizeId,
} from "@/lib/reading-preference";
import { createClient } from "@/lib/supabase/browser";

import { ExitDoorIcon } from "@/components/icons/ExitDoorIcon";
import { LogoutDialog } from "@/features/auth/LogoutDialog";
import { ProfilePhotoDialog } from "@/features/auth/ProfilePhotoDialog";

import { MemberFrame } from "./MemberFrame";
import { Portrait } from "./Portrait";

type Draft = {
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
};

const emptyDraft: Draft = {
  firstName: "",
  lastName: "",
  birthDate: "",
  gender: "",
};

const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

export function ProfileScreen({
  initialTextSize = "standard",
}: {
  initialTextSize?: TextSizeId;
}) {
  const [size, setSize] = useState<TextSizeId>(initialTextSize);
  const [savedSize, setSavedSize] = useState<TextSizeId>(initialTextSize);
  const [savingSize, setSavingSize] = useState(false);
  const [sizeError, setSizeError] = useState("");
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [cachedName, setCachedName] = useState("");
  const [cachedPhoto, setCachedPhoto] = useState<string | null>(null);
  const [hasCache, setHasCache] = useState(false);
  const [email, setEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const [photoOpen, setPhotoOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const previewUrlRef = useRef<string | null>(null);
  const birthLimits = useMemo(() => birthDateLimits(), []);
  const name = accountName(profile) || cachedName;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const userId = await currentUserId();
      const cached = userId ? readMemberDisplay(userId) : null;
      if (!cancelled && cached) {
        setHasCache(true);
        setCachedName(
          [cached.firstName, cached.lastName]
            .map((part) => part?.trim() ?? "")
            .filter(Boolean)
            .join(" "),
        );
        setCachedPhoto(cached.imageUrl ?? cached.avatarUrl);
      }
      const stamp = accountStampNow();
      try {
        const [account, claims] = await Promise.all([
          getAccountProfile(),
          createClient().auth.getClaims(),
        ]);
        if (cancelled) {
          return;
        }
        const saved = textSizeOrStandard(account.text_size);
        if (stamp === accountStampNow()) {
          setProfile(account);
        }
        setSize(saved);
        setSavedSize(saved);
        rememberReadingPreference(saved);
        const session = accountSession(
          claims.data?.claims as Record<string, unknown> | undefined,
        );
        setEmail(session.status === "registered" ? session.email ?? "" : "");
        if (userId) {
          rememberFetchedAccount(userId, account, stamp);
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Could not load your account.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoaded(true);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrlRef.current) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
    };
  }, []);

  function rememberPreview(next: string | null) {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
    }
    previewUrlRef.current = next;
    setPreviewUrl(next);
  }

  function startEdit() {
    if (!profile) {
      return;
    }
    setDraft({
      firstName: profile.first_name ?? "",
      lastName: profile.last_name ?? "",
      birthDate: profile.birth_date ?? "",
      gender: profile.gender ?? "",
    });
    setSaveError("");
    setEditing(true);
  }

  function cancelEdit() {
    setSaveError("");
    setEditing(false);
  }

  function onFormKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    if (
      !editing ||
      event.key !== "Enter" ||
      event.nativeEvent.isComposing ||
      event.target instanceof HTMLButtonElement
    ) {
      return;
    }
    event.preventDefault();
    void save();
  }

  async function save(event?: FormEvent) {
    event?.preventDefault();
    setSaving(true);
    setSaveError("");
    try {
      const next = registrationProfile(draft);
      const saved = await updateAccountProfile(next);
      setProfile(saved);
      const userId = await currentUserId();
      if (userId) {
        rememberAccount(userId, saved);
      }
      setEditing(false);
    } catch (error) {
      setSaveError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Could not save your account. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function confirmLogout() {
    setLoggingOut(true);
    setLogoutError("");
    const { error } = await createClient().auth.signOut();
    if (error) {
      setLogoutError("Could not log out. Try again.");
      setLoggingOut(false);
      return;
    }
    clearReadingPreference();
    clearMemberDisplay();
    window.location.replace("/");
  }

  async function saveTextSize() {
    if (size === savedSize) {
      return;
    }
    setSavingSize(true);
    setSizeError("");
    try {
      const saved = await updateAccountTextSize(size);
      const next = textSizeOrStandard(saved.text_size);
      setProfile(saved);
      setSize(next);
      setSavedSize(next);
      rememberReadingPreference(next);
    } catch (error) {
      setSizeError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Could not save your text size. Try again.",
      );
    } finally {
      setSavingSize(false);
    }
  }

  function resetPhotoDraft() {
    setPendingFile(null);
    setPendingRemoval(false);
    setPhotoError("");
    rememberPreview(null);
  }

  function openPhoto() {
    resetPhotoDraft();
    setPhotoOpen(true);
  }

  function closePhoto() {
    if (photoBusy) {
      return;
    }
    setPhotoOpen(false);
    resetPhotoDraft();
  }

  function selectPhoto(file: File) {
    const name = file.name.toLowerCase();
    const allowedName =
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".png") ||
      name.endsWith(".webp");
    if (
      file.size <= 0 ||
      file.size > PHOTO_MAX_BYTES ||
      (!PHOTO_TYPES.has(file.type) && !allowedName)
    ) {
      setPhotoError("Choose a JPEG, PNG, or WebP photo under 5 MB.");
      return;
    }
    setPendingFile(file);
    setPendingRemoval(false);
    setPhotoError("");
    rememberPreview(URL.createObjectURL(file));
  }

  function stageRemoval() {
    setPhotoError("");
    if (pendingFile) {
      setPendingFile(null);
      rememberPreview(null);
      return;
    }
    if (profile?.image_url) {
      setPendingRemoval(true);
      rememberPreview(null);
    }
  }

  async function confirmPhoto() {
    if (!pendingFile && !pendingRemoval) {
      return;
    }
    setPhotoBusy(true);
    setPhotoError("");
    try {
      const saved = pendingFile
        ? profile?.image_url
          ? await updateAccountPhoto(pendingFile)
          : await createAccountPhoto(pendingFile)
        : await deleteAccountPhoto();
      setProfile(saved);
      const userId = await currentUserId();
      if (userId) {
        rememberAccount(userId, saved);
      }
      setPhotoOpen(false);
      resetPhotoDraft();
    } catch (error) {
      setPhotoError(
        error instanceof ApiError || error instanceof Error
          ? error.message
          : "Could not save your photo. Try again.",
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  const savedPhoto = profile
    ? profile.image_url ?? profile.avatar_url
    : cachedPhoto;
  const modalPhoto = previewUrl ?? (pendingRemoval ? null : savedPhoto);

  return (
    <MemberFrame
      current="profile"
      status={loaded || hasCache ? name || "Your profile" : "…"}
      portraitSrc={loaded || hasCache ? savedPhoto : undefined}
    >
      <main className="per">
        <header className="per-cab">
          <div>
            <span className="k">Profile</span>
            <h1>Your profile</h1>
            <p className="datos">
              {loaded || hasCache ? name || "Your profile" : "…"}
              <br />
              Member since <b>August 2026</b> · Plan: <b>Monthly · 4 courses</b>
            </p>
            <div className="acc">
              <button
                type="button"
                className="btn fantasma chico"
                onClick={openPhoto}
                disabled={!loaded || !profile}
              >
                Edit photo
              </button>
            </div>
          </div>
          <div className="foto" aria-hidden="true">
            <Portrait src={savedPhoto} />
          </div>
        </header>
        <form onSubmit={save} onKeyDown={onFormKeyDown}>
          <section className="per-sec">
            <div>
              <h2>Your account</h2>
            </div>
            <div>
              <div className="fila">
                <span className="tx">
                  Email<small>{email || "—"}</small>
                </span>
                <span className="acc">
                  {editing ? (
                    <>
                      <button
                        key="save"
                        type="button"
                        className="btn fantasma chico"
                        onClick={() => void save()}
                        disabled={saving}
                      >
                        {saving ? "Saving…" : "Save"}
                      </button>
                      <button
                        key="cancel"
                        type="button"
                        className="btn fantasma chico"
                        onClick={cancelEdit}
                        disabled={saving}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      key="edit"
                      type="button"
                      className="btn fantasma chico"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={startEdit}
                      disabled={!loaded || !profile}
                    >
                      Edit
                    </button>
                  )}
                </span>
              </div>
              <AccountField
                id="profile-first-name"
                label="First name"
                editing={editing}
                value={draft.firstName}
                display={profile?.first_name}
                onChange={(firstName) => setDraft((current) => ({ ...current, firstName }))}
                autoComplete="given-name"
              />
              <AccountField
                id="profile-last-name"
                label="Last name"
                editing={editing}
                value={draft.lastName}
                display={profile?.last_name}
                onChange={(lastName) => setDraft((current) => ({ ...current, lastName }))}
                autoComplete="family-name"
              />
              <div className="fila">
                <label className="tx" htmlFor={editing ? "profile-birth-date" : undefined}>
                  Date of birth
                  {editing ? (
                    <input
                      id="profile-birth-date"
                      className="campo"
                      name="bday"
                      type="date"
                      autoComplete="bday"
                      required
                      min={birthLimits.min}
                      max={birthLimits.max}
                      value={draft.birthDate}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, birthDate: event.target.value }))
                      }
                    />
                  ) : (
                    <small>{profile?.birth_date ? formatBirthDate(profile.birth_date) : "—"}</small>
                  )}
                </label>
              </div>
              <div className="fila">
                <label className="tx" htmlFor={editing ? "profile-gender" : undefined}>
                  Gender
                  {editing ? (
                    <select
                      id="profile-gender"
                      className="campo"
                      name="gender"
                      required
                      value={draft.gender}
                      onChange={(event) =>
                        setDraft((current) => ({ ...current, gender: event.target.value }))
                      }
                    >
                      <option value="" disabled>
                        Select
                      </option>
                      {GENDERS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <small>{profile?.gender ? genderLabel(profile.gender) : "—"}</small>
                  )}
                </label>
              </div>
              {loadError || saveError ? (
                <p className="nota" role="alert">
                  {saveError || loadError}
                </p>
              ) : null}
            </div>
          </section>
        </form>
        <section className="per-sec">
          <div>
            <h2>Your reading preferences</h2>
          </div>
          <div>
            <div className="fila reading">
              <span className="tx">
                Text size<small>For lesson text</small>
              </span>
              <span className="acc">
                <span className="tam" role="group" aria-label="Text size">
                  {TEXT_SIZES.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={size === option.id ? "act" : undefined}
                      aria-pressed={size === option.id}
                      disabled={!loaded || !profile}
                      onClick={() => {
                        setSizeError("");
                        setSize(option.id);
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </span>
                <button
                  type="button"
                  className="btn fantasma chico"
                  onClick={() => void saveTextSize()}
                  disabled={!loaded || !profile || savingSize || size === savedSize}
                >
                  {savingSize ? "Saving…" : "Save"}
                </button>
              </span>
            </div>
            <p
              className="prev-t"
              style={{ fontSize: `${LESSON_BODY_PX * textSizeScale(size)}px` }}
            >
              No city begins from nothing. Every modern intervention arrives in a place that already
              exists, and what is there shapes the outcome more than we tend to admit.
            </p>
            {sizeError ? (
              <p className="nota" role="alert">
                {sizeError}
              </p>
            ) : null}
          </div>
        </section>
        <section className="per-sec per-fin">
          <div>
            <h2>Log out</h2>
          </div>
          <div>
            <div className="fila">
              <span className="tx">
                Log out
                <small>
                  Logging out clears your session on this device. You will need to sign in again to
                  open your account and courses.
                </small>
              </span>
              <span className="acc">
                <button
                  type="button"
                  className="btn fantasma chico"
                  onClick={() => {
                    setLogoutError("");
                    setLogoutOpen(true);
                  }}
                >
                  <ExitDoorIcon />
                  Log out
                </button>
              </span>
            </div>
          </div>
        </section>
        <ProfilePhotoDialog
          open={photoOpen}
          previewSrc={modalPhoto}
          canRemove={Boolean(profile?.image_url) || Boolean(pendingFile)}
          canConfirm={Boolean(pendingFile) || pendingRemoval}
          busy={photoBusy}
          error={photoError}
          onClose={closePhoto}
          onSelectFile={selectPhoto}
          onRemove={stageRemoval}
          onConfirm={() => void confirmPhoto()}
        />
        <LogoutDialog
          open={logoutOpen}
          busy={loggingOut}
          error={logoutError}
          onClose={() => {
            if (!loggingOut) {
              setLogoutOpen(false);
            }
          }}
          onConfirm={() => void confirmLogout()}
        />
      </main>
    </MemberFrame>
  );
}

function accountName(profile: AccountProfile | null): string {
  return [profile?.first_name, profile?.last_name]
    .map((part) => part?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function AccountField({
  id,
  label,
  editing,
  value,
  display,
  onChange,
  autoComplete,
}: {
  id: string;
  label: string;
  editing: boolean;
  value: string;
  display: string | null | undefined;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <div className="fila">
      <label className="tx" htmlFor={editing ? id : undefined}>
        {label}
        {editing ? (
          <input
            id={id}
            className="campo"
            type="text"
            autoComplete={autoComplete}
            required
            maxLength={80}
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
        ) : (
          <small>{display?.trim() || "—"}</small>
        )}
      </label>
    </div>
  );
}
