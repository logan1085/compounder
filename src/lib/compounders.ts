export type Cadence = "daily" | "weekly" | "monthly";

export type Routine = {
  id: string;
  title: string;
  cadence: Cadence;
  intention: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  completions: string[];
};

export type RoutineStatus = "complete" | "due" | "off-track";

export type ActivityItem = {
  id: string;
  routineId: string;
  routineTitle: string;
  cadence: Cadence;
  dateKey: string;
};

export const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
};

export const CADENCE_ORDER: Cadence[] = ["daily", "weekly", "monthly"];

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(value: string) {
  return new Date(`${value}T12:00:00`);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getWeekStart(date: Date) {
  const day = startOfLocalDay(date).getDay();
  return addDays(startOfLocalDay(date), -day);
}

function isCadence(value: unknown): value is Cadence {
  return value === "daily" || value === "weekly" || value === "monthly";
}

export function getPeriodStart(date: Date, cadence: Cadence) {
  const normalized = startOfLocalDay(date);

  if (cadence === "daily") {
    return normalized;
  }

  if (cadence === "weekly") {
    return getWeekStart(normalized);
  }

  return new Date(normalized.getFullYear(), normalized.getMonth(), 1);
}

export function getPreviousPeriodStart(date: Date, cadence: Cadence) {
  if (cadence === "daily") {
    return addDays(date, -1);
  }

  if (cadence === "weekly") {
    return addDays(date, -7);
  }

  return addMonths(date, -1);
}

export function getNextPeriodStart(date: Date, cadence: Cadence) {
  if (cadence === "daily") {
    return addDays(date, 1);
  }

  if (cadence === "weekly") {
    return addDays(date, 7);
  }

  return addMonths(date, 1);
}

export function getPeriodKey(date: Date, cadence: Cadence) {
  return formatDateKey(getPeriodStart(date, cadence));
}

export function getCompletedPeriodKeys(routine: Routine) {
  return Array.from(
    new Set(
      routine.completions.map((completion) =>
        getPeriodKey(parseDateKey(completion), routine.cadence),
      ),
    ),
  ).sort();
}

export function findCompletionForPeriod(routine: Routine, now: Date) {
  const currentPeriodKey = getPeriodKey(now, routine.cadence);

  return (
    routine.completions.find(
      (completion) =>
        getPeriodKey(parseDateKey(completion), routine.cadence) ===
        currentPeriodKey,
    ) ?? null
  );
}

export function isCompleteThisPeriod(routine: Routine, now: Date) {
  return findCompletionForPeriod(routine, now) !== null;
}

export function getCurrentStreak(routine: Routine, now: Date) {
  const completedKeys = new Set(getCompletedPeriodKeys(routine));

  if (completedKeys.size === 0) {
    return 0;
  }

  let cursor = getPeriodStart(now, routine.cadence);

  if (!completedKeys.has(formatDateKey(cursor))) {
    cursor = getPreviousPeriodStart(cursor, routine.cadence);
  }

  let streak = 0;

  while (completedKeys.has(formatDateKey(cursor))) {
    streak += 1;
    cursor = getPreviousPeriodStart(cursor, routine.cadence);
  }

  return streak;
}

export function getBestStreak(routine: Routine) {
  const completedKeys = getCompletedPeriodKeys(routine);

  if (completedKeys.length === 0) {
    return 0;
  }

  let best = 1;
  let running = 1;

  for (let index = 1; index < completedKeys.length; index += 1) {
    const previous = parseDateKey(completedKeys[index - 1]);
    const expected = formatDateKey(getNextPeriodStart(previous, routine.cadence));

    if (completedKeys[index] === expected) {
      running += 1;
      best = Math.max(best, running);
      continue;
    }

    running = 1;
  }

  return best;
}

export function getRecentPeriods(cadence: Cadence, count: number, now: Date) {
  const periods: string[] = [];
  let cursor = getPeriodStart(now, cadence);

  for (let index = 0; index < count; index += 1) {
    periods.unshift(formatDateKey(cursor));
    cursor = getPreviousPeriodStart(cursor, cadence);
  }

  return periods;
}

export function getCompletionRate(
  routine: Routine,
  sampleSize: number,
  now: Date,
) {
  const periodKeys = new Set(getCompletedPeriodKeys(routine));
  const recentPeriods = getRecentPeriods(routine.cadence, sampleSize, now);
  const completed = recentPeriods.filter((periodKey) =>
    periodKeys.has(periodKey),
  ).length;

  return {
    completed,
    total: recentPeriods.length,
    percent: recentPeriods.length
      ? Math.round((completed / recentPeriods.length) * 100)
      : 0,
  };
}

export function getRoutineStatus(routine: Routine, now: Date): RoutineStatus {
  if (isCompleteThisPeriod(routine, now)) {
    return "complete";
  }

  const previousPeriod = formatDateKey(
    getPreviousPeriodStart(getPeriodStart(now, routine.cadence), routine.cadence),
  );
  const completedKeys = new Set(getCompletedPeriodKeys(routine));
  const createdPeriod = getPeriodKey(new Date(routine.createdAt), routine.cadence);

  if (createdPeriod === getPeriodKey(now, routine.cadence)) {
    return "due";
  }

  return completedKeys.has(previousPeriod) ? "due" : "off-track";
}

export function getLastCompletion(routine: Routine) {
  const sorted = [...routine.completions].sort();
  return sorted.at(-1) ?? null;
}

export function getCadenceWindowLabel(cadence: Cadence) {
  if (cadence === "daily") {
    return "today";
  }

  if (cadence === "weekly") {
    return "this week";
  }

  return "this month";
}

export function getCadenceHint(cadence: Cadence) {
  if (cadence === "daily") {
    return "One check-in every day.";
  }

  if (cadence === "weekly") {
    return "One check-in between Sunday and Saturday.";
  }

  return "One check-in sometime this month.";
}

export function getWindowRangeLabel(cadence: Cadence, now: Date) {
  const start = getPeriodStart(now, cadence);
  const end = getNextPeriodStart(start, cadence);
  const endDate = addDays(end, -1);
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });

  if (cadence === "daily") {
    return formatter.format(start);
  }

  if (cadence === "weekly") {
    return `${formatter.format(start)} - ${formatter.format(endDate)}`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(start);
}

export function formatLongDate(value: string | Date) {
  const date =
    typeof value === "string"
      ? value.length > 10
        ? new Date(value)
        : parseDateKey(value)
      : value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatRelativeWindow(routine: Routine, now: Date) {
  const next = getNextPeriodStart(getPeriodStart(now, routine.cadence), routine.cadence);

  if (routine.cadence === "daily") {
    return "Resets tomorrow";
  }

  if (routine.cadence === "weekly") {
    return `Resets ${new Intl.DateTimeFormat("en-US", {
      weekday: "long",
    }).format(next)}`;
  }

  return `Resets ${new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(next)}`;
}

export function formatPeriodLabel(periodKey: string, cadence: Cadence) {
  const date = parseDateKey(periodKey);

  if (cadence === "daily") {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date);
  }

  if (cadence === "weekly") {
    return `Week of ${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(date)}`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function normalizeRoutine(
  value: Partial<Routine>,
  index: number,
): Routine {
  const cadence = isCadence(value.cadence) ? value.cadence : "daily";
  const createdAt =
    typeof value.createdAt === "string" && value.createdAt
      ? value.createdAt
      : new Date().toISOString();
  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt
      ? value.updatedAt
      : createdAt;
  const archivedAt =
    typeof value.archivedAt === "string" ? value.archivedAt : null;

  const completions = Array.isArray(value.completions)
    ? value.completions
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => (entry.length > 10 ? formatDateKey(new Date(entry)) : entry))
    : [];

  const draft: Routine = {
    id:
      typeof value.id === "string" && value.id
        ? value.id
        : `routine-${index + 1}-${Math.random().toString(36).slice(2, 8)}`,
    title:
      typeof value.title === "string" && value.title.trim()
        ? value.title.trim()
        : "Untitled routine",
    cadence,
    intention: typeof value.intention === "string" ? value.intention.trim() : "",
    color:
      typeof value.color === "string" && value.color
        ? value.color
        : getColorToken(index),
    createdAt,
    updatedAt,
    archivedAt,
    completions: [],
  };

  draft.completions = Array.from(
    new Set(
      completions.map((entry) => getPeriodKey(parseDateKey(entry), draft.cadence)),
    ),
  ).sort();

  return draft;
}

export function normalizeRoutines(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as Routine[];
  }

  return value.map((item, index) => normalizeRoutine(item as Partial<Routine>, index));
}

export function getActiveRoutines(routines: Routine[]) {
  return routines.filter((routine) => !routine.archivedAt);
}

export function getArchivedRoutines(routines: Routine[]) {
  return routines.filter((routine) => Boolean(routine.archivedAt));
}

export function getActivityFeed(routines: Routine[], limit: number) {
  const items: ActivityItem[] = routines.flatMap((routine) =>
    routine.completions.map((dateKey) => ({
      id: `${routine.id}-${dateKey}`,
      routineId: routine.id,
      routineTitle: routine.title,
      cadence: routine.cadence,
      dateKey,
    })),
  );

  return items.sort((left, right) => right.dateKey.localeCompare(left.dateKey)).slice(0, limit);
}

export function getColorToken(index: number) {
  const colors = [
    "mint",
    "amber",
    "sky",
    "rose",
    "lilac",
    "gold",
  ] as const;

  return colors[index % colors.length];
}

export function getColorClasses(color: string) {
  const classes: Record<string, string> = {
    mint: "from-emerald-300/70 via-emerald-100/80 to-white",
    amber: "from-amber-300/75 via-orange-100/80 to-white",
    sky: "from-sky-300/75 via-cyan-100/85 to-white",
    rose: "from-rose-300/70 via-pink-100/80 to-white",
    lilac: "from-fuchsia-200/75 via-violet-100/85 to-white",
    gold: "from-yellow-300/70 via-amber-100/80 to-white",
  };

  return classes[color] ?? classes.mint;
}
