"use client";

import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const STREAK_MILESTONES = [7, 14, 30, 60, 100];

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
  exiting: boolean;
};

type CelebrationState = {
  routineId: string;
  streak: number;
  id: number;
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

const STARTER_ROUTINES: { title: string; cadence: Cadence; emoji: string; desc: string }[] = [
  { title: "Read for 20 min", cadence: "daily", emoji: "\u{1F4D6}", desc: "Feed your mind" },
  { title: "Exercise", cadence: "daily", emoji: "\u{1F4AA}", desc: "Move your body" },
  { title: "Journal", cadence: "daily", emoji: "\u{270D}\u{FE0F}", desc: "Reflect daily" },
  { title: "Meditate", cadence: "daily", emoji: "\u{1F9D8}", desc: "Find your calm" },
  { title: "Drink water", cadence: "daily", emoji: "\u{1F4A7}", desc: "Stay hydrated" },
];

function getEmojiForRoutine(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("read")) return "\u{1F4D6}";
  if (lower.includes("exercise") || lower.includes("workout") || lower.includes("gym")) return "\u{1F4AA}";
  if (lower.includes("journal") || lower.includes("write") || lower.includes("writing")) return "\u{270D}\u{FE0F}";
  if (lower.includes("meditat")) return "\u{1F9D8}";
  if (lower.includes("walk") || lower.includes("run") || lower.includes("jog")) return "\u{1F3C3}";
  if (lower.includes("water") || lower.includes("drink")) return "\u{1F4A7}";
  if (lower.includes("sleep") || lower.includes("bed")) return "\u{1F634}";
  if (lower.includes("code") || lower.includes("program")) return "\u{1F4BB}";
  if (lower.includes("cook") || lower.includes("meal")) return "\u{1F373}";
  if (lower.includes("clean")) return "\u{2728}";
  return "\u{1F525}";
}

/* ------------------------------------------------------------------ */
/*  Progress Ring                                                      */
/* ------------------------------------------------------------------ */

function ProgressRing({
  completed,
  total,
  allDone,
}: {
  completed: number;
  total: number;
  allDone: boolean;
}) {
  const size = 64;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = total > 0 ? completed / total : 0;
  const offset = circumference * (1 - percent);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          className="progress-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
        />
        <circle
          className="progress-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          stroke={allDone ? "#4ade80" : "url(#ring-gradient)"}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="100%" stopColor="#ffb37a" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-sm font-bold text-[var(--foreground)]">
        {completed}/{total}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main App                                                           */
/* ------------------------------------------------------------------ */

export function CompoundersApp() {
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [form, setForm] = useState<FormState>(FORM_DEFAULTS);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [view, setView] = useState<AppView>("today");
  const [viewKey, setViewKey] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [celebration, setCelebration] = useState<CelebrationState | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [removedStarters, setRemovedStarters] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
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

    setHydrated(true);
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

  // Toast lifecycle: show -> begin exit animation -> remove
  useEffect(() => {
    if (!toast) {
      return;
    }

    if (toast.exiting) {
      const removeTimeout = window.setTimeout(() => setToast(null), 300);
      return () => window.clearTimeout(removeTimeout);
    }

    const exitTimeout = window.setTimeout(
      () => setToast((current) => (current ? { ...current, exiting: true } : null)),
      1500,
    );
    return () => window.clearTimeout(exitTimeout);
  }, [toast]);

  useEffect(() => {
    if (!celebration) {
      return;
    }

    const timeout = window.setTimeout(() => setCelebration(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [celebration]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (tagName === "input" || tagName === "textarea" || target.isContentEditable) {
        return;
      }

      if (event.key === "n" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        switchView("setup");
        window.setTimeout(() => {
          formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
          titleInputRef.current?.focus();
        }, 100);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // View transition helper
  function switchView(newView: AppView) {
    if (newView === view) return;
    setView(newView);
    setViewKey((k) => k + 1);
  }

  function showToast(message: string) {
    setToast({
      id: Date.now(),
      message,
      exiting: false,
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
    switchView("setup");
    setForm({
      title: routine.title,
      cadence: routine.cadence,
      intention: routine.intention,
    });
    window.setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function addStarterRoutine(starter: { title: string; cadence: Cadence }) {
    const newRoutine = createRoutine(
      { title: starter.title, cadence: starter.cadence, intention: "" },
      routines.length,
    );
    setRoutines((current) => [newRoutine, ...current]);
    // Animate out the pill
    setRemovedStarters((prev) => new Set(prev).add(starter.title));
    showToast("Added");
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

        // Check for milestone streak celebration
        const updatedRoutine = {
          ...routine,
          completions: [...routine.completions, formatDateKey(now)].sort(),
          updatedAt: new Date().toISOString(),
        };
        const newStreak = getCurrentStreak(updatedRoutine, now);
        if (STREAK_MILESTONES.includes(newStreak)) {
          setCelebration({ routineId, streak: newStreak, id: Date.now() });
        }

        return updatedRoutine;
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

  const shareStreaks = useCallback(() => {
    const lines = activeRoutines
      .filter((routine) => getCurrentStreak(routine, now) > 0)
      .map((routine) => {
        const streak = getCurrentStreak(routine, now);
        const emoji = getEmojiForRoutine(routine.title);
        return `${emoji} ${routine.title} \u2014 ${streak} day streak`;
      });

    if (lines.length === 0) {
      showToast("No active streaks to share yet");
      return;
    }

    const text = `My Compounders Streaks:\n${lines.join("\n")}\ncompounders.app`;
    navigator.clipboard.writeText(text).then(
      () => showToast("Copied to clipboard"),
      () => showToast("Unable to copy"),
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoutines, now]);

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

  // Don't render until hydrated to avoid flash
  if (!hydrated) {
    return null;
  }

  /* ---- Landing page (no profile) ---- */
  if (!profile) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-5 py-12">
        {/* Hero section for first-time visitors */}
        <section className="float-in mb-10 w-full text-center">
          <h1 className="text-4xl font-semibold tracking-[-0.04em] text-[var(--foreground)] sm:text-5xl">
            Track what compounds.
            <br />
            <span className="text-[var(--muted)]">No account needed.</span>
          </h1>
          <p className="mx-auto mt-5 max-w-sm text-base leading-7 text-[var(--muted)]">
            The simplest habit tracker that works. No signup, no cloud, no data
            harvesting. Just you and your streaks.
          </p>
        </section>

        {/* Visual preview mockup */}
        <section className="float-in mb-10 w-full" style={{ animationDelay: "0.1s" }}>
          <div className="rounded-[2rem] border border-white/60 bg-white/55 p-5 shadow-[var(--cloud-shadow-lg)] backdrop-blur-md">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
                Preview
              </span>
              <span className="flex items-center gap-1 text-xs font-medium text-[var(--accent-strong)]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                2 / 3 done
              </span>
            </div>
            <div className="space-y-2.5">
              {[
                { title: "Read for 20 min", streak: 14, done: true, emoji: "\u{1F4D6}" },
                { title: "Exercise", streak: 7, done: true, emoji: "\u{1F4AA}" },
                { title: "Journal", streak: 3, done: false, emoji: "\u{270D}\u{FE0F}" },
              ].map((item, idx) => (
                <div
                  key={item.title}
                  className={`float-in stagger-${idx + 1} flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-all ${
                    item.done
                      ? "border border-emerald-200/40 bg-gradient-to-r from-emerald-50/60 to-white/60 shadow-[0_2px_12px_-4px_rgba(74,222,128,0.15)]"
                      : "border border-white/70 bg-white/80 shadow-[0_2px_8px_-4px_rgba(88,118,170,0.12)]"
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 flex-none items-center justify-center rounded-full border-2 text-xs ${
                      item.done
                        ? "border-emerald-400 bg-emerald-400 text-white shadow-[0_0_8px_rgba(74,222,128,0.3)]"
                        : "border-[var(--muted)]/25 bg-white"
                    }`}
                  >
                    {item.done ? (
                      <svg
                        viewBox="0 0 24 24"
                        className="h-3.5 w-3.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12.5l4.5 4.5L19 7" />
                      </svg>
                    ) : (
                      <span className="text-base">{item.emoji}</span>
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`text-sm font-semibold ${
                        item.done
                          ? "text-[var(--muted)] line-through decoration-[var(--muted)]/30"
                          : "text-[var(--foreground)]"
                      }`}
                    >
                      {item.title}
                    </p>
                  </div>
                  {item.streak > 0 ? (
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      item.done
                        ? "bg-emerald-100/60 text-emerald-700"
                        : "bg-[var(--accent-soft)]/60 text-[var(--accent-strong)]"
                    }`}>
                      {item.streak}d
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Get started name input */}
        <section
          className="float-in w-full rounded-[2.25rem] border border-white/60 bg-white/70 p-8 shadow-[var(--cloud-shadow-lg)] backdrop-blur-md"
          style={{ animationDelay: "0.25s" }}
        >
          <div className="mb-1 text-3xl">
            {"\u{1F44B}"}
          </div>
          <h2 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--foreground)]">
            Get started
          </h2>
          <p className="mt-2 text-base leading-7 text-[var(--muted)]">
            What should I call you?
          </p>
          <form className="mt-5 space-y-3" onSubmit={saveName}>
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

        <Footer />
      </main>
    );
  }

  /* ---- Main app (has profile) ---- */

  // Available starter routines (filter out already-added ones)
  const availableStarters = STARTER_ROUTINES.filter(
    (s) => !removedStarters.has(s.title) && !activeRoutines.some((r) => r.title === s.title),
  );

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
          onClick={() => switchView("today")}
        >
          Today
        </button>
        <button
          type="button"
          className={view === "setup" ? activeTabClassName : tabClassName}
          onClick={() => switchView("setup")}
        >
          Setup
        </button>
      </nav>

      {/* View content with crossfade transition */}
      <div key={viewKey} className="view-transition">
        {view === "today" ? (
          <section className="space-y-3">
            {activeRoutines.length === 0 ? (
              <div className="float-in rounded-[2rem] border border-white/70 bg-white/70 px-6 py-12 text-center shadow-[var(--cloud-shadow-sm)] backdrop-blur">
                <div className="mx-auto mb-4 text-4xl">{"\u{1F331}"}</div>
                <p className="text-lg font-semibold text-[var(--foreground)]">
                  Nothing here yet.
                </p>
                <p className="mt-2 text-sm text-[var(--muted)]">
                  Start with a suggested routine, or head to Setup to create your own.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-2.5">
                  {STARTER_ROUTINES.filter((s) => !removedStarters.has(s.title)).map((starter) => (
                    <button
                      key={starter.title}
                      type="button"
                      className="card-interactive group flex items-center gap-2 rounded-full border border-white/70 bg-white/80 px-4 py-2.5 text-sm font-medium text-[var(--foreground)] shadow-[0_2px_8px_-4px_rgba(88,118,170,0.1)] backdrop-blur hover:bg-white hover:shadow-[var(--cloud-shadow-sm)]"
                      onClick={() => addStarterRoutine(starter)}
                    >
                      <span className="text-base transition-transform group-hover:scale-110">{starter.emoji}</span>
                      <span>{starter.title}</span>
                      <span className="ml-0.5 text-[var(--muted)] transition-colors group-hover:text-[var(--accent)]">+</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Progress ring header */}
                <div className="float-in mb-5 rounded-[1.75rem] border border-white/70 bg-white/75 px-5 py-4 shadow-[var(--cloud-shadow-sm)] backdrop-blur">
                  <div className="flex items-center gap-4">
                    <ProgressRing
                      completed={completedRoutines.length}
                      total={activeRoutines.length}
                      allDone={allDone}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        {allDone ? "All done today!" : `${completionPercent}% complete`}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {allDone
                          ? "Great work. Come back tomorrow."
                          : `${pendingRoutines.length} ${pendingRoutines.length === 1 ? "routine" : "routines"} remaining`}
                      </p>
                    </div>
                  </div>
                </div>

                {pendingRoutines.map((routine) => (
                  <TodayCard
                    key={routine.id}
                    routine={routine}
                    now={now}
                    complete={false}
                    onToggle={() => toggleRoutineCompletion(routine.id)}
                    celebration={celebration?.routineId === routine.id ? celebration : null}
                  />
                ))}

                {completedRoutines.map((routine) => (
                  <TodayCard
                    key={routine.id}
                    routine={routine}
                    now={now}
                    complete
                    onToggle={() => toggleRoutineCompletion(routine.id)}
                    celebration={celebration?.routineId === routine.id ? celebration : null}
                  />
                ))}

                {/* Inline starter suggestions when user has few routines */}
                {availableStarters.length > 0 && activeRoutines.length < 5 ? (
                  <div className="float-in mt-4 rounded-2xl border border-white/50 bg-white/40 px-5 py-4 backdrop-blur">
                    <p className="mb-3 text-xs font-medium text-[var(--muted)]">Add more</p>
                    <div className="flex flex-wrap gap-2">
                      {availableStarters.map((starter) => (
                        <button
                          key={starter.title}
                          type="button"
                          className="card-interactive group flex items-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-3 py-1.5 text-xs font-medium text-[var(--muted)] transition hover:bg-white hover:text-[var(--foreground)]"
                          onClick={() => addStarterRoutine(starter)}
                        >
                          <span className="transition-transform group-hover:scale-110">{starter.emoji}</span>
                          {starter.title}
                          <span className="text-[var(--muted)]/50 transition-colors group-hover:text-[var(--accent)]">+</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
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
                  ref={titleInputRef}
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
                onClick={shareStreaks}
              >
                Share
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
      </div>

      {toast ? <Toast key={toast.id} message={toast.message} exiting={toast.exiting} /> : null}

      <Footer />
    </main>
  );
}

/* ------------------------------------------------------------------ */
/*  Streak Heatmap (improved with day labels, gradient, today marker) */
/* ------------------------------------------------------------------ */

function StreakHeatmap({ routine, now }: { routine: Routine; now: Date }) {
  const completionSet = useMemo(() => new Set(routine.completions), [routine.completions]);
  const todayStr = formatDateKey(now);

  // Build 8 weeks x 7 days grid (56 days), ending at today
  const cells = useMemo(() => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayOfWeek = today.getDay(); // 0=Sun
    const endOffset = 6 - dayOfWeek;
    const totalDays = 8 * 7;
    const result: { date: string; completed: boolean; future: boolean; isToday: boolean }[] = [];

    for (let i = 0; i < totalDays; i++) {
      const dayOffset = i - (totalDays - 1) + endOffset;
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset);
      const key = formatDateKey(d);
      const future = d > today;
      result.push({
        date: key,
        completed: completionSet.has(key),
        future,
        isToday: key === formatDateKey(today),
      });
    }

    return result;
  }, [completionSet, now]);

  // Calculate density: how many completions in the surrounding 7-day window
  const densityMap = useMemo(() => {
    const map = new Map<string, number>();
    const allCompletions = Array.from(completionSet);
    for (const cell of cells) {
      if (cell.future || !cell.completed) {
        map.set(cell.date, 0);
        continue;
      }
      // Count completions within 3 days before/after for density
      const cellDate = new Date(`${cell.date}T12:00:00`);
      let nearby = 0;
      for (const comp of allCompletions) {
        const compDate = new Date(`${comp}T12:00:00`);
        const diff = Math.abs(cellDate.getTime() - compDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diff <= 3) nearby++;
      }
      map.set(cell.date, Math.min(nearby, 5));
    }
    return map;
  }, [cells, completionSet]);

  // Arrange into columns (weeks) of 7 rows (days, Sun-Sat)
  const weeks: typeof cells[] = [];
  for (let w = 0; w < 8; w++) {
    weeks.push(cells.slice(w * 7, w * 7 + 7));
  }

  const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

  // Color based on density
  function getCellColor(cell: (typeof cells)[0]) {
    if (cell.future) return "bg-[var(--card-soft)]/40";
    if (!cell.completed) return "bg-[var(--card-soft)]";
    const density = densityMap.get(cell.date) ?? 1;
    if (density >= 4) return "bg-[var(--accent)]";
    if (density >= 3) return "bg-[var(--accent)]/80";
    if (density >= 2) return "bg-[var(--accent)]/60";
    return "bg-[var(--accent)]/40";
  }

  return (
    <div className="mt-3 flex gap-[3px]">
      {/* Day-of-week labels */}
      <div className="flex flex-col gap-[3px] pr-1">
        {dayLabels.map((label, idx) => (
          <div
            key={idx}
            className="flex h-[10px] w-[10px] items-center justify-center text-[7px] font-medium leading-none text-[var(--muted)]/60"
          >
            {idx % 2 === 1 ? label : ""}
          </div>
        ))}
      </div>
      {weeks.map((week, wIdx) => (
        <div key={wIdx} className="flex flex-col gap-[3px]">
          {week.map((cell) => (
            <div
              key={cell.date}
              className={`heatmap-cell h-[10px] w-[10px] rounded-[2.5px] transition-colors ${getCellColor(cell)} ${
                cell.isToday ? "heatmap-today" : ""
              }`}
              title={`${cell.date}${cell.isToday ? " (today)" : ""}${cell.completed ? " - completed" : ""}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Today Card (polished hover/press, checkmark animation, green tint)*/
/* ------------------------------------------------------------------ */

function TodayCard({
  routine,
  now,
  complete,
  onToggle,
  celebration,
}: {
  routine: Routine;
  now: Date;
  complete: boolean;
  onToggle: () => void;
  celebration: CelebrationState | null;
}) {
  const streak = getCurrentStreak(routine, now);
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="float-in">
      <button
        type="button"
        onClick={onToggle}
        className={`card-interactive group w-full rounded-[1.75rem] border px-5 py-4 text-left ${
          complete
            ? "card-complete border-emerald-200/30 backdrop-blur"
            : "border-white/70 bg-white/80 shadow-[var(--cloud-shadow-sm)] backdrop-blur hover:shadow-[var(--cloud-shadow)]"
        }`}
      >
        <div className="flex items-center gap-4">
          <span
            className={`flex h-11 w-11 flex-none items-center justify-center rounded-full border-2 transition-all duration-300 ${
              complete
                ? `pop border-emerald-400 bg-emerald-400 text-white shadow-[0_0_12px_rgba(74,222,128,0.3)] ${celebration ? "streak-glow" : ""}`
                : "border-[var(--muted)]/25 bg-white group-hover:border-[var(--accent)] group-hover:shadow-[0_0_0_3px_rgba(255,140,90,0.1)]"
            }`}
          >
            {complete ? (
              <svg
                viewBox="0 0 24 24"
                className="check-draw h-5 w-5"
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
              className={`truncate text-lg font-semibold tracking-[-0.02em] transition-colors ${
                complete ? "text-[var(--muted)] line-through decoration-[var(--muted)]/30" : "text-[var(--foreground)]"
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
              {celebration ? (
                <span className="streak-text ml-1 font-semibold text-[var(--accent)]">
                  {"\u{1F525}"} {celebration.streak}-day streak!
                </span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((v) => !v);
            }}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[var(--muted)] transition-all hover:bg-white/60 hover:text-[var(--foreground)]"
            aria-label={expanded ? "Hide heatmap" : "Show heatmap"}
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-4 w-4 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>
      </button>
      {expanded ? (
        <div className="float-in mt-1 rounded-2xl border border-white/60 bg-white/50 px-5 py-3 backdrop-blur">
          <p className="text-xs font-medium text-[var(--muted)]">Last 8 weeks</p>
          <StreakHeatmap routine={routine} now={now} />
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Setup Card                                                         */
/* ------------------------------------------------------------------ */

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
    <div className="rounded-[1.5rem] border border-white/70 bg-white/70 px-4 py-3.5 backdrop-blur">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
      <StreakHeatmap routine={routine} now={now} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Archived Card                                                      */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Toast (slides up from bottom with blur)                            */
/* ------------------------------------------------------------------ */

function Toast({ message, exiting }: { message: string; exiting: boolean }) {
  return (
    <div
      className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/60 bg-white/85 px-5 py-2.5 text-sm font-semibold text-[var(--foreground)] shadow-[var(--cloud-shadow)] backdrop-blur-lg ${
        exiting ? "toast-exit" : "toast-enter"
      }`}
    >
      {message}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Footer                                                             */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="mt-16 pb-8 text-center">
      <p className="text-xs text-[var(--muted)]/60">Built by Logan</p>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/*  Class name constants                                               */
/* ------------------------------------------------------------------ */

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
