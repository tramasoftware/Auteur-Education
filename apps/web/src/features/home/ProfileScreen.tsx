"use client";

import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from "react";

import { ApiError, getAccountProfile, updateAccountProfile, type AccountProfile } from "@/lib/api";
import {
  GENDERS,
  birthDateLimits,
  formatBirthDate,
  genderLabel,
  registrationProfile,
} from "@/lib/auth/profile";
import { createClient } from "@/lib/supabase/browser";

import { MemberFrame } from "./MemberFrame";
import { Portrait } from "./Portrait";

const sizes = [
  ["chico", "Small", 0.93],
  ["normal", "Standard", 1],
  ["grande", "Large", 1.14],
  ["xl", "Extra large", 1.3],
] as const;

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

export function ProfileScreen() {
  const [size, setSize] = useState<(typeof sizes)[number][0]>("normal");
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [email, setEmail] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const birthLimits = useMemo(() => birthDateLimits(), []);
  const scale = sizes.find((item) => item[0] === size)?.[2] ?? 1;
  const name = accountName(profile);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [account, userResult] = await Promise.all([
          getAccountProfile(),
          createClient().auth.getUser(),
        ]);
        if (cancelled) {
          return;
        }
        setProfile(account);
        setEmail(userResult.data.user?.email ?? "");
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

  return (
    <MemberFrame current="profile" status={loaded ? name || "Your profile" : "…"}>
      <main className="per" style={{ ["--ft" as string]: scale }}>
        <header className="per-cab">
          <div>
            <span className="k">Profile</span>
            <h1>Your profile</h1>
            <p className="datos">
              {loaded ? name || "Your profile" : "…"}
              <br />
              Member since <b>August 2026</b> · Plan: <b>Monthly · 4 courses</b>
            </p>
            <div className="acc">
              <span className="btn fantasma chico">Change photo</span>
              <span className="btn fantasma chico">Remove</span>
            </div>
          </div>
          <div className="foto" aria-hidden="true">
            <Portrait />
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
            <div className="fila">
              <span className="tx">
                Text size<small>For lesson text</small>
              </span>
              <span className="tam" role="group" aria-label="Text size">
                {sizes.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    className={size === id ? "act" : undefined}
                    onClick={() => setSize(id)}
                  >
                    {label}
                  </button>
                ))}
              </span>
            </div>
            <p className="prev-t">
              No city begins from nothing. Every modern intervention arrives in a place that already
              exists, and what is there shapes the outcome more than we tend to admit.
            </p>
          </div>
        </section>
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
