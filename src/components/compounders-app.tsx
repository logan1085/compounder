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

type FormState = {
  title: string;
  cadence: Cadence;
  intention: string;
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
  const colors = ["green", "yellow", "blue", "orange", "pink", "mint"];

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

function xpForCadence(cadence: Cadence) {
  if (cadence === "daily") {
    return 15;
  }

  if (cadence === "weekly") {
    return 35;
  }

  return 60;
}

function getLeague(totalXp: number) {
  if (totalXp >= 1800) {
    return "Diamond";
  }

  if (totalXp >= 1200) {
    return "Emerald";
  }

  if (totalXp >= 700) {
    return "Gold";
  }

  if (totalXp >= 300) {
    return "Silver";
  }

  return "Bronze";
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
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [form, setForm] = useState<FormState>(FORM_DEFAULTS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [recentlyTouchedId, setRecentlyTouchedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const todayKey = formatDateKey(new Date());
  const now = useMemo(() => new Date(`${todayKey}T12:00:00`), [todayKey]);

  useEffect(() => {
    try {
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
    if (!toast) {
      return;
    }

    const timeout = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  useEffect(() => {
    if (!recentlyTouchedId) {
      return;
    }

    const timeout = window.setTimeout(() => setRecentlyTouchedId(null), 1200);
    return () => window.clearTimeout(timeout);
  }, [recentlyTouchedId]);

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

  const totalXp = activeRoutines.reduce(
    (sum, routine) => sum + routine.completions.length * xpForCadence(routine.cadence),
    0,
  );
  const todayXp = completedRoutines.reduce(
    (sum, routine) => sum + xpForCadence(routine.cadence),
    0,
  );
  const bestLiveStreak = orderedRoutines.reduce(
    (best, routine) => Math.max(best, getCurrentStreak(routine, now)),
    0,
  );
  const level = Math.floor(totalXp / 120) + 1;
  const levelProgress = totalXp % 120;
  const completionScore = activeRoutines.length
    ? Math.round((completedRoutines.length / activeRoutines.length) * 100)
    : 0;
  const league = getLeague(totalXp);

  function showToast(message: string) {
    setToast({
      id: Date.now(),
      message,
    });
  }

  function touchRoutine(routineId: string) {
    setRecentlyTouchedId(routineId);
  }

  function resetForm() {
    setForm(FORM_DEFAULTS);
    setEditingId(null);
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
      touchRoutine(editingId);
      showToast("Quest updated.");
      resetForm();
      return;
    }

    setRoutines((current) => {
      const routine = createRoutine(form, current.length);
      touchRoutine(routine.id);
      return [routine, ...current];
    });
    showToast("Quest added.");
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

    touchRoutine(routineId);
    showToast(
      wasComplete
        ? `Removed ${getCadenceWindowLabel(target?.cadence ?? "daily")} progress.`
        : `Earned +${xpForCadence(target?.cadence ?? "daily")} XP.`,
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

    showToast("Quest archived.");
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
    showToast("Quest restored.");
  }

  function deleteRoutine(routineId: string) {
    if (!window.confirm("Delete this quest permanently?")) {
      return;
    }

    setRoutines((current) => current.filter((routine) => routine.id !== routineId));

    if (editingId === routineId) {
      resetForm();
    }

    showToast("Quest deleted.");
  }

  function exportData() {
    downloadJsonFile("compounders-export.json", {
      exportedAt: new Date().toISOString(),
      routines,
    });
    showToast("Exported your progress.");
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
        const imported = normalizeRoutines(
          Array.isArray(payload) ? payload : payload.routines,
        );

        setRoutines(imported);
        resetForm();
        showToast("Imported your progress.");
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
      <section className="rounded-[2.25rem] bg-[var(--accent)] p-6 text-white shadow-[0_8px_0_0_var(--accent-dark)] sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <div className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-extrabold uppercase tracking-[0.18em] text-white/85">
              Compounders
            </div>
            <div className="space-y-2">
              <p className="text-sm font-bold uppercase tracking-[0.14em] text-white/75">
                {new Intl.DateTimeFormat("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                }).format(now)}
              </p>
              <h1 className="max-w-2xl text-4xl font-extrabold tracking-[-0.05em] sm:text-5xl">
                Complete your quests and keep the streak alive.
              </h1>
            </div>
            <p className="max-w-2xl text-base leading-7 text-white/82">
              The everyday operating point is still one clear place: today’s missions.
              The overview just makes the progress feel rewarding.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:w-[320px] lg:grid-cols-1">
            <HeroBadge label="League" value={league} />
            <HeroBadge label="Today XP" value={`${todayXp}`} />
            <HeroBadge label="Best live streak" value={`${bestLiveStreak}`} />
          </div>
        </div>

        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <HeroCard label="Level" value={`${level}`} subvalue={`${levelProgress}/120 XP`} />
          <HeroCard
            label="Completion score"
            value={`${completionScore}%`}
            subvalue={`${completedRoutines.length}/${activeRoutines.length || 0} complete`}
          />
          <HeroCard
            label="Open quests"
            value={`${pendingRoutines.length}`}
            subvalue={pendingRoutines.length === 1 ? "1 left today" : `${pendingRoutines.length} left today`}
          />
        </div>

        <div className="mt-4 h-4 overflow-hidden rounded-full bg-white/18">
          <div
            className="h-full rounded-full bg-[var(--sun)] transition-all duration-500"
            style={{ width: `${Math.max((levelProgress / 120) * 100, 8)}%` }}
          />
        </div>
      </section>

      <section className="rounded-[2rem] border border-[var(--line-strong)] bg-white shadow-[0_8px_0_0_var(--panel-shadow)]">
        <div className="border-b border-[var(--border)] px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="space-y-1">
              <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-[var(--muted)]">
                Daily Board
              </p>
              <h2 className="text-3xl font-extrabold tracking-[-0.04em] text-[var(--foreground)]">
                Today&apos;s missions
              </h2>
              <p className="text-sm leading-6 text-[var(--muted)]">
                Start here every day. Pending first, completed second.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <TinyChip>{pendingRoutines.length} pending</TinyChip>
              <TinyChip>{completedRoutines.length} complete</TinyChip>
            </div>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5 sm:px-6">
          {pendingRoutines.length === 0 ? (
            <CelebrationCard />
          ) : (
            <div className="space-y-3">
              {pendingRoutines.map((routine) => (
                <MissionRow
                  key={routine.id}
                  routine={routine}
                  now={now}
                  highlighted={recentlyTouchedId === routine.id}
                  onToggle={() => toggleRoutineCompletion(routine.id)}
                  onEdit={() => handleEdit(routine)}
                  onArchive={() => archiveRoutine(routine.id)}
                />
              ))}
            </div>
          )}

          {completedRoutines.length > 0 ? (
            <div className="space-y-3 border-t border-[var(--border)] pt-6">
              <div className="space-y-1">
                <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-[var(--muted)]">
                  Completed
                </p>
                <p className="text-sm leading-6 text-[var(--muted)]">
                  Still visible, but quieter.
                </p>
              </div>

              <div className="space-y-3">
                {completedRoutines.map((routine) => (
                  <MissionRow
                    key={routine.id}
                    routine={routine}
                    now={now}
                    complete
                    highlighted={recentlyTouchedId === routine.id}
                    onToggle={() => toggleRoutineCompletion(routine.id)}
                    onEdit={() => handleEdit(routine)}
                    onArchive={() => archiveRoutine(routine.id)}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section
        ref={formRef}
        className="rounded-[2rem] border border-[var(--line-strong)] bg-white p-5 shadow-[0_8px_0_0_var(--panel-shadow)] sm:p-6"
      >
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-[var(--muted)]">
              Quest Builder
            </p>
            <h2 className="text-3xl font-extrabold tracking-[-0.04em] text-[var(--foreground)]">
              {editingId ? "Edit quest" : "Add a new quest"}
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <UtilityButton onClick={exportData}>Export</UtilityButton>
            <UtilityButton onClick={() => fileInputRef.current?.click()}>Import</UtilityButton>
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
          <div className="grid gap-4 sm:grid-cols-[1.25fr_1fr]">
            <label className="grid gap-2">
              <span className="text-sm font-bold text-[var(--foreground)]">Quest name</span>
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
              <span className="text-sm font-bold text-[var(--foreground)]">Cadence</span>
              <div className="grid grid-cols-3 gap-2">
                {CADENCE_ORDER.map((cadence) => (
                  <button
                    key={cadence}
                    type="button"
                    className={form.cadence === cadence ? activePillClassName : secondaryPillClassName}
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
            <span className="text-sm font-bold text-[var(--foreground)]">Why it matters</span>
            <textarea
              className={`${inputClassName} min-h-24 resize-none`}
              placeholder="Give yourself a reason to care about this one."
              value={form.intention}
              onChange={(event) =>
                setForm((current) => ({ ...current, intention: event.target.value }))
              }
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button type="submit" className={primaryButtonClassName}>
              {editingId ? "Save quest" : "Add quest"}
            </button>
            {editingId ? (
              <button type="button" className={secondaryButtonClassName} onClick={resetForm}>
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="rounded-[2rem] border border-[var(--line-strong)] bg-white p-5 shadow-[0_8px_0_0_var(--panel-shadow)] sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-[var(--muted)]">
              Archive
            </p>
            <h2 className="text-2xl font-extrabold tracking-[-0.03em] text-[var(--foreground)]">
              Parked quests
            </h2>
          </div>
          <UtilityButton onClick={() => setShowArchived((current) => !current)}>
            {showArchived ? "Hide" : `Show ${archivedRoutines.length}`}
          </UtilityButton>
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

function MissionRow({
  routine,
  now,
  complete = false,
  highlighted,
  onToggle,
  onEdit,
  onArchive,
}: {
  routine: Routine;
  now: Date;
  complete?: boolean;
  highlighted: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onArchive: () => void;
}) {
  const status = getRoutineStatus(routine, now);
  const currentStreak = getCurrentStreak(routine, now);
  const bestStreak = getBestStreak(routine);
  const lastCompletion = getLastCompletion(routine);
  const xp = xpForCadence(routine.cadence);

  return (
    <article
      className={`rounded-[1.6rem] border px-4 py-4 transition-all sm:px-5 ${
        complete
          ? "border-[var(--border)] bg-[var(--surface-soft)]"
          : "border-[var(--line-strong)] bg-white shadow-[0_6px_0_0_var(--panel-shadow)]"
      } ${highlighted ? "translate-y-[-2px] shadow-[0_8px_0_0_var(--panel-shadow)]" : ""}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <button
            type="button"
            className={`mt-0.5 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-[3px] text-xl font-black transition ${
              complete
                ? "border-[var(--accent)] bg-[var(--accent)] text-white shadow-[0_4px_0_0_var(--accent-dark)]"
                : "border-[var(--line-strong)] bg-white text-[var(--foreground)] hover:border-[var(--accent)]"
            }`}
            onClick={onToggle}
          >
            {complete ? "✓" : ""}
          </button>

          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-extrabold tracking-[-0.03em] text-[var(--foreground)]">
                {routine.title}
              </h3>
              <TinyChip>{CADENCE_LABELS[routine.cadence]}</TinyChip>
              <StatusBadge status={status} />
              <RewardChip xp={xp} />
            </div>
            <p className="text-sm leading-6 text-[var(--muted)]">
              {routine.intention || "No note yet."}
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium text-[var(--muted)]">
              <span>{getWindowRangeLabel(routine.cadence, now)}</span>
              <span>{currentStreak} streak</span>
              <span>{bestStreak} best</span>
              <span>{lastCompletion ? `Last ${formatLongDate(lastCompletion)}` : "New quest"}</span>
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
    <div className="flex flex-col gap-3 rounded-[1.4rem] border border-[var(--border)] bg-[var(--surface-soft)] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-extrabold text-[var(--foreground)]">{routine.title}</p>
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

function CelebrationCard() {
  return (
    <div className="rounded-[1.7rem] border border-[var(--line-strong)] bg-[var(--surface-soft)] px-6 py-10 text-center">
      <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-[var(--muted)]">
        All Clear
      </p>
      <h3 className="mt-2 text-3xl font-extrabold tracking-[-0.04em] text-[var(--foreground)]">
        Everything is complete.
      </h3>
      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
        You cleared today&apos;s board. Add another quest below or enjoy the clean slate.
      </p>
    </div>
  );
}

function HeroCard({
  label,
  value,
  subvalue,
}: {
  label: string;
  value: string;
  subvalue: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/16 bg-white/10 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
      <p className="text-sm font-extrabold uppercase tracking-[0.16em] text-white/70">{label}</p>
      <p className="mt-2 text-3xl font-extrabold tracking-[-0.05em] text-white">{value}</p>
      <p className="mt-1 text-sm text-white/78">{subvalue}</p>
    </div>
  );
}

function HeroBadge({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.35rem] border border-white/16 bg-white/10 px-4 py-3 text-right shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
      <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-white/70">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tracking-[-0.04em] text-white">{value}</p>
    </div>
  );
}

function TinyChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--pill)] px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--muted)]">
      {children}
    </span>
  );
}

function RewardChip({ xp }: { xp: number }) {
  return (
    <span className="rounded-full bg-[var(--sun-soft)] px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.12em] text-[var(--sun-deep)]">
      +{xp} XP
    </span>
  );
}

function StatusBadge({ status }: { status: ReturnType<typeof getRoutineStatus> }) {
  const styles = {
    complete: "bg-emerald-100 text-emerald-800",
    due: "bg-stone-200 text-stone-800",
    "off-track": "bg-amber-100 text-amber-900",
  } as const;

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-extrabold uppercase tracking-[0.12em] ${styles[status]}`}>
      {status === "off-track" ? "Off Track" : status}
    </span>
  );
}

function UtilityButton({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button type="button" className={secondaryButtonClassName} onClick={onClick}>
      {children}
    </button>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[var(--foreground)] px-4 py-2 text-sm font-extrabold text-white shadow-[0_16px_36px_rgba(22,31,26,0.25)]">
      {message}
    </div>
  );
}

const inputClassName =
  "w-full rounded-[1.25rem] border-[3px] border-[var(--line-strong)] bg-white px-4 py-3 text-base font-semibold text-[var(--foreground)] outline-none transition placeholder:text-[var(--muted)]/70 focus:border-[var(--accent)]";

const primaryButtonClassName =
  "rounded-[1.2rem] bg-[var(--accent)] px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-white shadow-[0_4px_0_0_var(--accent-dark)] transition hover:translate-y-[1px] hover:shadow-[0_3px_0_0_var(--accent-dark)]";

const secondaryButtonClassName =
  "rounded-[1.2rem] border-[3px] border-[var(--line-strong)] bg-white px-4 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-[var(--foreground)] transition hover:bg-[var(--surface-soft)]";

const activePillClassName =
  "rounded-[1.1rem] bg-[var(--accent)] px-3 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-white shadow-[0_4px_0_0_var(--accent-dark)] transition hover:translate-y-[1px] hover:shadow-[0_3px_0_0_var(--accent-dark)]";

const secondaryPillClassName =
  "rounded-[1.1rem] border-[3px] border-[var(--line-strong)] bg-white px-3 py-3 text-sm font-extrabold uppercase tracking-[0.12em] text-[var(--foreground)] transition hover:bg-[var(--surface-soft)]";
