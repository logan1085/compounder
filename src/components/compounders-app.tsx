"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CADENCE_LABELS,
  CADENCE_ORDER,
  type Cadence,
  type Routine,
  findCompletionForPeriod,
  formatDateKey,
  getActiveRoutines,
  getArchivedRoutines,
  getCurrentStreak,
  isCompleteThisPeriod,
  normalizeRoutines,
} from "@/lib/compounders";

const STORAGE_KEY = "compounders:routines:v2";
const LEGACY_STORAGE_KEY = "compounders:routines:v1";
const PROFILE_KEY = "compounders:profile:v1";

type FormState = {
  title: string;
  cadence: Cadence;
  intention: string;
};

type ProfileState = {
  name: string;
};

type AppView = "today" | "setup";

type ToastState = {
  id: number;
  message: string;
};

const FORM_DEFAULTS: FormState = {
  title: "",
  cadence: "daily",
  intention: "",
};

function createRoutine(values: FormState, count: number): Routine {
  const timestamp = new Date().toISOString();

  return {
    id: crypto.randomUUID(),
    title: values.title.trim(),
    cadence: values.cadence,
    intention: values.intention.trim(),
    color: `slot-${count}`,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    completions: [],
  };
}

function downloadJsonFile(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function CompoundersApp() {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [form, setForm] = useState<FormState>(FORM_DEFAULTS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<AppView>("today");
  const [showArchived, setShowArchived] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const todayKey = formatDateKey(new Date());
  const now = useMemo(() => new Date(`${todayKey}T12:00:00`), [todayKey]);

  useEffect(() => {
    try {
      const savedProfile = localStorage.getItem(PROFILE_KEY);

      if (savedProfile) {
        const parsed = JSON.parse(savedProfile) as ProfileState;

        if (parsed.name) {
          setProfile(parsed);
          setNameInput(parsed.name);
        }
      }

      const current = localStorage.getItem(STORAGE_KEY);
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      const source = current ?? legacy;

      if (source) {
        setRoutines(normalizeRoutines(JSON.parse(source)));
      }
    } catch (error) {
      console.error("Unable to restore Compounders data", error);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routines));
  }, [routines]);

  useEffect(() => {
    if (!profile) {
      return;
    }

    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const activeRoutines = useMemo(() => getActiveRoutines(routines), [routines]);
  const archivedRoutines = useMemo(() => getArchivedRoutines(routines), [routines]);
  const pendingRoutines = activeRoutines.filter(
    (routine) => !isCompleteThisPeriod(routine, now),
  );
  const completedRoutines = activeRoutines.filter((routine) =>
    isCompleteThisPeriod(routine, now),
  );
  const completionPercent = activeRoutines.length
    ? Math.round((completedRoutines.length / activeRoutines.length) * 100)
    : 0;
  const allDone = activeRoutines.length > 0 && pendingRoutines.length === 0;

  function showToast(message: string) {
    setToast({
      id: Date.now(),
      message,
    });
  }

  function resetForm() {
    setForm(FORM_DEFAULTS);
    setEditingId(null);
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!nameInput.trim()) {
      return;
    }

    setProfile({ name: nameInput.trim() });
    setView("today");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!form.title.trim()) {
      return;
    }

    if (editingId) {
      setRoutines((current) =>
        current.map((routine) =>
          routine.id === editingId
            ? {
                ...routine,
                title: form.title.trim(),
                cadence: form.cadence,
                intention: form.intention.trim(),
                updatedAt: new Date().toISOString(),
                completions: normalizeRoutines([
                  {
                    ...routine,
                    cadence: form.cadence,
                    completions: routine.completions,
                  },
                ])[0].completions,
              }
            : routine,
        ),
      );
      showToast("Saved");
      resetForm();
      return;
    }

    setRoutines((current) => [createRoutine(form, current.length), ...current]);
    showToast("Added");
    resetForm();
  }

  function handleEdit(routine: Routine) {
    setEditingId(routine.id);
    setView("setup");
    setForm({
      title: routine.title,
      cadence: routine.cadence,
      intention: routine.intention,
    });
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function toggleRoutineCompletion(routineId: string) {
    setRoutines((current) =>
      current.map((routine) => {
        if (routine.id !== routineId) {
          return routine;
        }

        const completion = findCompletionForPeriod(routine, now);

        if (completion) {
          return {
            ...routine,
            completions: routine.completions.filter((entry) => entry !== completion),
            updatedAt: new Date().toISOString(),
          };
        }

        return {
          ...routine,
          completions: [...routine.completions, formatDateKey(now)].sort(),
          updatedAt: new Date().toISOString(),
        };
      }),
    );
  }

  function archiveRoutine(routineId: string) {
    setRoutines((current) =>
      current.map((routine) =>
        routine.id === routineId
          ? {
              ...routine,
              archivedAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            }
          : routine,
      ),
    );

    if (editingId === routineId) {
      resetForm();
    }

    showToast("Archived");
  }

  function restoreRoutine(routineId: string) {
    setRoutines((current) =>
      current.map((routine) =>
        routine.id === routineId
          ? {
              ...routine,
              archivedAt: null,
              updatedAt: new Date().toISOString(),
            }
          : routine,
      ),
    );
    showToast("Restored");
  }

  function deleteRoutine(routineId: string) {
    if (!window.confirm("Delete this permanently?")) {
      return;
    }

    setRoutines((current) => current.filter((routine) => routine.id !== routineId));

    if (editingId === routineId) {
      resetForm();
    }

    showToast("Deleted");
  }

  function exportData() {
    downloadJsonFile("compounders-export.json", {
      exportedAt: new Date().toISOString(),
      profile,
      routines,
    });
    showToast("Exported");
  }

  function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result));
        const importedRoutines = normalizeRoutines(
          Array.isArray(payload) ? payload : payload.routines,
        );

        setRoutines(importedRoutines);

        if (
          payload &&
          typeof payload === "object" &&
          "profile" in payload &&
          payload.profile &&
          typeof payload.profile === "object" &&
          "name" in (payload.profile as Record<string, unknown>) &&
          typeof (payload.profile as Record<string, unknown>).name === "string"
        ) {
          const name = (payload.profile as Record<string, string>).name.trim();

          if (name) {
            setProfile({ name });
            setNameInput(name);
          }
        }

        resetForm();
        showToast("Imported");
      } catch (error) {
        console.error("Unable to import Compounders data", error);
        window.alert("That file could not be imported.");
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.readAsText(file);
  }

  if (!profile) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-5 py-12">
        <section className="float-in w-full rounded-[2.25rem] border border-white/70 bg-white/75 p-8 shadow-[var(--cloud-shadow)] backdrop-blur-md">
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
            Hello there.
          </h1>
          <p className="mt-3 text-base leading-7 text-[var(--muted)]">
            What should I call you?
          </p>
          <form className="mt-6 space-y-3" onSubmit={saveName}>
            <input
              className={inputClassName}
              placeholder="Your name"
              value={nameInput}
              onChange={(event) => setNameInput(event.target.value)}
              autoFocus
            />
            <button type="submit" className={primaryButtonClassName}>
              Let&apos;s go
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8 sm:py-12">
      <header className="float-in mb-8 space-y-1">
        <p className="text-sm font-medium text-[var(--muted)]">
          {new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
          }).format(now)}
        </p>
        <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[var(--foreground)] sm:text-5xl">
          Hi {profile.name}.
        </h1>
      </header>

      <nav className="mb-6 inline-flex gap-1 rounded-full border border-white/70 bg-white/60 p-1 shadow-[var(--cloud-shadow-sm)] backdrop-blur">
        <button
          type="button"
          className={view === "today" ? activeTabClassName : tabClassName}
          onClick={() => setView("today")}
        >
          Today
        </button>
        <button
          type="button"
          className={view === "setup" ? activeTabClassName : tabClassName}
          onClick={() => setView("setup")}
        >
          Setup
        </button>
      </nav>

      {view === "today" ? (
        <section className="space-y-3">
          {activeRoutines.length === 0 ? (
            <EmptyCloud
              title="Nothing here yet."
              body="Pop over to Setup and add your first action."
            />
          ) : (
            <>
              <div className="float-in mb-5 rounded-[1.75rem] border border-white/70 bg-white/75 px-5 py-4 shadow-[var(--cloud-shadow-sm)] backdrop-blur">
                <div className="flex items-baseline justify-between">
                  <p className="text-sm font-medium text-[var(--muted)]">
                    {allDone ? "All done today " : "Today"}
                  </p>
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {completedRoutines.length} / {activeRoutines.length}
                  </p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--card-soft)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[#ffb37a] transition-all duration-500 ease-out"
                    style={{ width: `${completionPercent}%` }}
                  />
                </div>
              </div>

              {pendingRoutines.map((routine) => (
                <TodayCard
                  key={routine.id}
                  routine={routine}
                  now={now}
                  complete={false}
                  onToggle={() => toggleRoutineCompletion(routine.id)}
                />
              ))}

              {completedRoutines.map((routine) => (
                <TodayCard
                  key={routine.id}
                  routine={routine}
                  now={now}
                  complete
                  onToggle={() => toggleRoutineCompletion(routine.id)}
                />
              ))}
            </>
          )}
        </section>
      ) : (
        <section className="space-y-5">
          <div
            ref={formRef}
            className="float-in rounded-[2rem] border border-white/70 bg-white/80 p-5 shadow-[var(--cloud-shadow)] backdrop-blur sm:p-6"
          >
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
              {editingId ? "Edit action" : "Add an action"}
            </h2>

            <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
              <input
                className={inputClassName}
                placeholder="Read for 20 minutes"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />

              <div className="grid grid-cols-3 gap-2">
                {CADENCE_ORDER.map((cadence) => (
                  <button
                    key={cadence}
                    type="button"
                    className={
                      form.cadence === cadence ? activeChipClassName : chipClassName
                    }
                    onClick={() =>
                      setForm((current) => ({ ...current, cadence }))
                    }
                  >
                    {CADENCE_LABELS[cadence]}
                  </button>
                ))}
              </div>

              <textarea
                className={`${inputClassName} min-h-20 resize-none`}
                placeholder="Why (optional)"
                value={form.intention}
                onChange={(event) =>
                  setForm((current) => ({ ...current, intention: event.target.value }))
                }
              />

              <div className="flex gap-2">
                <button type="submit" className={primaryButtonClassName}>
                  {editingId ? "Save" : "Add"}
                </button>
                {editingId ? (
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    onClick={resetForm}
                  >
                    Cancel
                  </button>
                ) : null}
              </div>
            </form>
          </div>

          {activeRoutines.length > 0 ? (
            <div className="space-y-2">
              {activeRoutines.map((routine) => (
                <SetupCard
                  key={routine.id}
                  routine={routine}
                  now={now}
                  onEdit={() => handleEdit(routine)}
                  onArchive={() => archiveRoutine(routine.id)}
                />
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 pt-2">
            <button type="button" className={ghostButtonClassName} onClick={exportData}>
              Export
            </button>
            <button
              type="button"
              className={ghostButtonClassName}
              onClick={() => fileInputRef.current?.click()}
            >
              Import
            </button>
            <button
              type="button"
              className={ghostButtonClassName}
              onClick={() => setShowArchived((current) => !current)}
            >
              {showArchived ? "Hide archived" : `Archived (${archivedRoutines.length})`}
            </button>
            <button
              type="button"
              className={ghostButtonClassName}
              onClick={() => {
                setProfile(null);
                localStorage.removeItem(PROFILE_KEY);
              }}
            >
              Change name
            </button>
            <input
              ref={fileInputRef}
              className="hidden"
              type="file"
              accept="application/json"
              onChange={handleImport}
            />
          </div>

          {showArchived && archivedRoutines.length > 0 ? (
            <div className="space-y-2 pt-2">
              {archivedRoutines.map((routine) => (
                <ArchivedCard
                  key={routine.id}
                  routine={routine}
                  onRestore={() => restoreRoutine(routine.id)}
                  onDelete={() => deleteRoutine(routine.id)}
                />
              ))}
            </div>
          ) : null}
        </section>
      )}

      {toast ? <Toast key={toast.id} message={toast.message} /> : null}
    </main>
  );
}

function TodayCard({
  routine,
  now,
  complete,
  onToggle,
}: {
  routine: Routine;
  now: Date;
  complete: boolean;
  onToggle: () => void;
}) {
  const streak = getCurrentStreak(routine, now);

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`float-in group w-full rounded-[1.75rem] border px-5 py-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${
        complete
          ? "border-[var(--accent-soft)] bg-[var(--accent-soft)]/60 backdrop-blur"
          : "border-white/70 bg-white/80 shadow-[var(--cloud-shadow-sm)] backdrop-blur hover:shadow-[var(--cloud-shadow)]"
      }`}
    >
      <div className="flex items-center gap-4">
        <span
          className={`flex h-11 w-11 flex-none items-center justify-center rounded-full border-2 transition-all ${
            complete
              ? "pop border-[var(--accent)] bg-[var(--accent)] text-white"
              : "border-[var(--muted)]/30 bg-white group-hover:border-[var(--accent)]"
          }`}
        >
          {complete ? (
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4.5 4.5L19 7" />
            </svg>
          ) : null}
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-lg font-semibold tracking-[-0.02em] ${
              complete ? "text-[var(--muted)] line-through decoration-[var(--muted)]/40" : "text-[var(--foreground)]"
            }`}
          >
            {routine.title}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>{CADENCE_LABELS[routine.cadence]}</span>
            {streak > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium text-[var(--accent-strong)]">{streak} streak</span>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

function SetupCard({
  routine,
  now,
  onEdit,
  onArchive,
}: {
  routine: Routine;
  now: Date;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const streak = getCurrentStreak(routine, now);

  return (
    <div className="flex flex-col gap-3 rounded-[1.5rem] border border-white/70 bg-white/70 px-4 py-3.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate font-semibold text-[var(--foreground)]">{routine.title}</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          {CADENCE_LABELS[routine.cadence]}
          {streak > 0 ? ` · ${streak} streak` : ""}
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" className={ghostButtonClassName} onClick={onEdit}>
          Edit
        </button>
        <button type="button" className={ghostButtonClassName} onClick={onArchive}>
          Archive
        </button>
      </div>
    </div>
  );
}

function ArchivedCard({
  routine,
  onRestore,
  onDelete,
}: {
  routine: Routine;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[1.5rem] border border-white/60 bg-white/50 px-4 py-3.5 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-[var(--muted)]">{routine.title}</p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          {CADENCE_LABELS[routine.cadence]} · archived
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" className={ghostButtonClassName} onClick={onRestore}>
          Restore
        </button>
        <button type="button" className={ghostButtonClassName} onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function EmptyCloud({ title, body }: { title: string; body: string }) {
  return (
    <div className="float-in rounded-[2rem] border border-white/70 bg-white/70 px-6 py-12 text-center shadow-[var(--cloud-shadow-sm)] backdrop-blur">
      <p className="text-lg font-semibold text-[var(--foreground)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--muted)]">{body}</p>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div className="float-in fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/70 bg-white/90 px-4 py-2 text-sm font-medium text-[var(--foreground)] shadow-[var(--cloud-shadow)] backdrop-blur">
      {message}
    </div>
  );
}

const inputClassName =
  "w-full rounded-2xl border border-white/70 bg-white/90 px-4 py-3 text-base text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)]/70 focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent-soft)]";

const primaryButtonClassName =
  "rounded-full bg-[var(--foreground)] px-5 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-[var(--cloud-shadow-sm)]";

const secondaryButtonClassName =
  "rounded-full border border-white/70 bg-white/70 px-5 py-3 text-sm font-semibold text-[var(--foreground)] transition hover:bg-white";

const ghostButtonClassName =
  "rounded-full border border-white/60 bg-white/50 px-3.5 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:bg-white/80 hover:text-[var(--foreground)]";

const tabClassName =
  "rounded-full px-4 py-2 text-sm font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]";

const activeTabClassName =
  "rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-semibold text-white shadow-[var(--cloud-shadow-sm)]";

const chipClassName =
  "rounded-full border border-white/70 bg-white/70 px-3 py-2.5 text-sm font-medium text-[var(--muted)] transition hover:bg-white hover:text-[var(--foreground)]";

const activeChipClassName =
  "rounded-full bg-[var(--foreground)] px-3 py-2.5 text-sm font-semibold text-white shadow-[var(--cloud-shadow-sm)]";
