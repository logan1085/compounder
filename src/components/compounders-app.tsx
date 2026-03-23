"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  CADENCE_LABELS,
  CADENCE_ORDER,
  type Cadence,
  type Routine,
  findCompletionForPeriod,
  formatDateKey,
  formatLongDate,
  getActiveRoutines,
  getArchivedRoutines,
  getBestStreak,
  getCadenceWindowLabel,
  getCurrentStreak,
  getLastCompletion,
  getRoutineStatus,
  getWindowRangeLabel,
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
  const colors = ["neutral", "neutral", "neutral", "neutral", "neutral", "neutral"];

  return {
    id: crypto.randomUUID(),
    title: values.title.trim(),
    cadence: values.cadence,
    intention: values.intention.trim(),
    color: colors[count % colors.length],
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
    completions: [],
  };
}

function sortRoutines(routines: Routine[], now: Date) {
  const order = {
    due: 0,
    "off-track": 1,
    complete: 2,
  } as const;

  return [...routines].sort((left, right) => {
    const statusDelta =
      order[getRoutineStatus(left, now)] - order[getRoutineStatus(right, now)];

    if (statusDelta !== 0) {
      return statusDelta;
    }

    return left.title.localeCompare(right.title);
  });
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

    const timeout = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const activeRoutines = useMemo(() => getActiveRoutines(routines), [routines]);
  const archivedRoutines = useMemo(() => getArchivedRoutines(routines), [routines]);
  const orderedRoutines = useMemo(
    () => sortRoutines(activeRoutines, now),
    [activeRoutines, now],
  );

  const pendingRoutines = orderedRoutines.filter(
    (routine) => !isCompleteThisPeriod(routine, now),
  );
  const completedRoutines = orderedRoutines.filter((routine) =>
    isCompleteThisPeriod(routine, now),
  );
  const bestLiveStreak = orderedRoutines.reduce(
    (best, routine) => Math.max(best, getCurrentStreak(routine, now)),
    0,
  );

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
    showToast("Welcome in.");
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
      showToast("Updated.");
      resetForm();
      return;
    }

    setRoutines((current) => [createRoutine(form, current.length), ...current]);
    showToast("Added.");
    resetForm();
  }

  function handleEdit(routine: Routine) {
    setEditingId(routine.id);
    setForm({
      title: routine.title,
      cadence: routine.cadence,
      intention: routine.intention,
    });
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function toggleRoutineCompletion(routineId: string) {
    const target = routines.find((routine) => routine.id === routineId);
    const wasComplete = target ? Boolean(findCompletionForPeriod(target, now)) : false;

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

    showToast(
      wasComplete
        ? `Undid ${getCadenceWindowLabel(target?.cadence ?? "daily")}.`
        : `Completed ${getCadenceWindowLabel(target?.cadence ?? "daily")}.`,
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

    showToast("Archived.");
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
    setShowArchived(false);
    showToast("Restored.");
  }

  function deleteRoutine(routineId: string) {
    if (!window.confirm("Delete this permanently?")) {
      return;
    }

    setRoutines((current) => current.filter((routine) => routine.id !== routineId));

    if (editingId === routineId) {
      resetForm();
    }

    showToast("Deleted.");
  }

  function exportData() {
    downloadJsonFile("compounders-export.json", {
      exportedAt: new Date().toISOString(),
      profile,
      routines,
    });
    showToast("Exported.");
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
        showToast("Imported.");
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
      <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-12 sm:px-6">
        <section className="w-full rounded-[2rem] border border-[var(--border)] bg-white p-8 shadow-[0_12px_32px_rgba(20,27,24,0.05)] sm:p-10">
          <div className="space-y-4">
            <div className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
              Compounders
            </div>
            <div className="space-y-2">
              <h1 className="text-4xl font-semibold tracking-[-0.05em] text-[var(--foreground)] sm:text-5xl">
                Simple habit tracking.
              </h1>
              <p className="max-w-xl text-base leading-7 text-[var(--muted)]">
                Start by telling the app your name. After that, you just open it and
                check off what matters today.
              </p>
            </div>
          </div>

          <form className="mt-8 space-y-4" onSubmit={saveName}>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Your name</span>
              <input
                className={inputClassName}
                placeholder="Logan"
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
              />
            </label>
            <button type="submit" className={primaryButtonClassName}>
              Continue
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12">
      <header className="space-y-4">
        <div className="inline-flex items-center rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">
          Compounders
        </div>
        <div className="space-y-2">
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
          <p className="max-w-2xl text-base leading-7 text-[var(--muted)]">
            Open this page, check what still needs to happen, and move on.
          </p>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <TopMetric label="Still to do" value={`${pendingRoutines.length}`} />
        <TopMetric label="Done today" value={`${completedRoutines.length}`} />
        <TopMetric label="Best live streak" value={`${bestLiveStreak}`} />
      </section>

      <section className="rounded-[2rem] border border-[var(--border)] bg-white shadow-[0_10px_30px_rgba(20,27,24,0.05)]">
        <div className="border-b border-[var(--border)] px-5 py-5 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
            Today
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
            Pending first. Completed stays below.
          </p>
        </div>

        <div className="space-y-6 px-5 py-5 sm:px-6">
          {pendingRoutines.length === 0 ? (
            <div className="rounded-[1.5rem] border border-dashed border-[var(--border)] bg-[var(--panel)] px-6 py-10 text-center">
              <p className="text-lg font-medium text-[var(--foreground)]">
                You’re clear for now.
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                Everything due has been completed.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRoutines.map((routine) => (
                <RoutineRow
                  key={routine.id}
                  routine={routine}
                  now={now}
                  onToggle={() => toggleRoutineCompletion(routine.id)}
                  onEdit={() => handleEdit(routine)}
                  onArchive={() => archiveRoutine(routine.id)}
                />
              ))}
            </div>
          )}

          {completedRoutines.length > 0 ? (
            <div className="space-y-3 border-t border-[var(--border)] pt-6">
              <p className="text-sm font-medium text-[var(--muted)]">Completed</p>
              {completedRoutines.map((routine) => (
                <RoutineRow
                  key={routine.id}
                  routine={routine}
                  now={now}
                  complete
                  onToggle={() => toggleRoutineCompletion(routine.id)}
                  onEdit={() => handleEdit(routine)}
                  onArchive={() => archiveRoutine(routine.id)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section
        ref={formRef}
        className="rounded-[2rem] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(20,27,24,0.04)] sm:p-6"
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
              {editingId ? "Edit routine" : "Add routine"}
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Keep setup simple.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryButtonClassName} onClick={exportData}>
              Export
            </button>
            <button
              type="button"
              className={secondaryButtonClassName}
              onClick={() => fileInputRef.current?.click()}
            >
              Import
            </button>
            <button
              type="button"
              className={secondaryButtonClassName}
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
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-[1.25fr_0.95fr]">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Title</span>
              <input
                className={inputClassName}
                placeholder="Read for 20 minutes"
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-medium text-[var(--foreground)]">Cadence</span>
              <div className="grid grid-cols-3 gap-2">
                {CADENCE_ORDER.map((cadence) => (
                  <button
                    key={cadence}
                    type="button"
                    className={
                      form.cadence === cadence ? activePillClassName : secondaryPillClassName
                    }
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        cadence,
                      }))
                    }
                  >
                    {CADENCE_LABELS[cadence]}
                  </button>
                ))}
              </div>
            </label>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Note</span>
            <textarea
              className={`${inputClassName} min-h-24 resize-none`}
              placeholder="Optional context"
              value={form.intention}
              onChange={(event) =>
                setForm((current) => ({ ...current, intention: event.target.value }))
              }
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className={primaryButtonClassName}>
              {editingId ? "Save changes" : "Add routine"}
            </button>
            {editingId ? (
              <button type="button" className={secondaryButtonClassName} onClick={resetForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-[2rem] border border-[var(--border)] bg-[var(--panel)] p-5 shadow-[0_10px_30px_rgba(20,27,24,0.04)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
              Archived
            </h2>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">
              Hidden from the main flow.
            </p>
          </div>
          <button
            type="button"
            className={secondaryButtonClassName}
            onClick={() => setShowArchived((current) => !current)}
          >
            {showArchived ? "Hide" : `Show ${archivedRoutines.length}`}
          </button>
        </div>

        {showArchived ? (
          <div className="mt-4 space-y-3">
            {archivedRoutines.length === 0 ? (
              <p className="text-sm leading-6 text-[var(--muted)]">Nothing archived yet.</p>
            ) : (
              archivedRoutines.map((routine) => (
                <ArchivedRow
                  key={routine.id}
                  routine={routine}
                  onRestore={() => restoreRoutine(routine.id)}
                  onDelete={() => deleteRoutine(routine.id)}
                />
              ))
            )}
          </div>
        ) : null}
      </section>

      {toast ? <Toast key={toast.id} message={toast.message} /> : null}
    </main>
  );
}

function RoutineRow({
  routine,
  now,
  complete = false,
  onToggle,
  onEdit,
  onArchive,
}: {
  routine: Routine;
  now: Date;
  complete?: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const status = getRoutineStatus(routine, now);
  const currentStreak = getCurrentStreak(routine, now);
  const bestStreak = getBestStreak(routine);
  const lastCompletion = getLastCompletion(routine);

  return (
    <article
      className={`rounded-[1.5rem] border px-4 py-4 transition sm:px-5 ${
        complete
          ? "border-[var(--border)] bg-[var(--surface-soft)]"
          : "border-[var(--line-strong)] bg-white shadow-[0_6px_20px_rgba(20,27,24,0.04)]"
      }`}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <button
            type="button"
            className={`mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border text-lg transition ${
              complete
                ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                : "border-[var(--line-strong)] bg-white text-[var(--foreground)] hover:border-[var(--accent)]"
            }`}
            onClick={onToggle}
          >
            {complete ? "✓" : ""}
          </button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
                {routine.title}
              </h3>
              <span className="rounded-full bg-[var(--pill)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
                {CADENCE_LABELS[routine.cadence]}
              </span>
              <StatusBadge status={status} />
            </div>
            <p className="text-sm leading-6 text-[var(--muted)]">
              {routine.intention || "No note."}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-[var(--muted)]">
              <span>{getWindowRangeLabel(routine.cadence, now)}</span>
              <span>{currentStreak} current streak</span>
              <span>{bestStreak} best</span>
              <span>{lastCompletion ? `Last ${formatLongDate(lastCompletion)}` : "Not started yet"}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButtonClassName} onClick={onEdit}>
            Edit
          </button>
          <button type="button" className={secondaryButtonClassName} onClick={onArchive}>
            Archive
          </button>
        </div>
      </div>
    </article>
  );
}

function ArchivedRow({
  routine,
  onRestore,
  onDelete,
}: {
  routine: Routine;
  onRestore: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[1.4rem] border border-[var(--border)] bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-[var(--foreground)]">{routine.title}</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {CADENCE_LABELS[routine.cadence]} • archived {formatLongDate(routine.archivedAt ?? routine.updatedAt)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={secondaryButtonClassName} onClick={onRestore}>
          Restore
        </button>
        <button type="button" className={secondaryButtonClassName} onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

function TopMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.6rem] border border-[var(--border)] bg-white px-4 py-4 shadow-[0_6px_18px_rgba(20,27,24,0.03)]">
      <p className="text-sm font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-[-0.04em] text-[var(--foreground)]">
        {value}
      </p>
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: ReturnType<typeof getRoutineStatus>;
}) {
  const styles = {
    complete: "bg-emerald-100 text-emerald-800",
    due: "bg-stone-200 text-stone-800",
    "off-track": "bg-amber-100 text-amber-900",
  } as const;

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${styles[status]}`}>
      {status === "off-track" ? "Off track" : status}
    </span>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-medium text-white shadow-[0_16px_36px_rgba(20,27,24,0.22)]">
      {message}
    </div>
  );
}

const inputClassName =
  "w-full rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-base text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)]/75 focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-soft)]";

const primaryButtonClassName =
  "rounded-2xl bg-[var(--foreground)] px-4 py-3 text-sm font-medium text-white transition hover:opacity-94";

const secondaryButtonClassName =
  "rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-soft)]";

const activePillClassName =
  "rounded-full bg-[var(--foreground)] px-3 py-2 text-sm font-medium text-white transition hover:opacity-94";

const secondaryPillClassName =
  "rounded-full border border-[var(--border)] bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-soft)]";
