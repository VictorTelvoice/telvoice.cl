/** Zona horaria del panel cliente (Chile continental). */
export const APP_SCHEDULE_TIMEZONE = "America/Santiago";

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function wallClockInTimeZone(ms: number, timeZone: string): WallClock {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

function compareWallClock(a: WallClock, b: WallClock): number {
  if (a.year !== b.year) return a.year - b.year;
  if (a.month !== b.month) return a.month - b.month;
  if (a.day !== b.day) return a.day - b.day;
  if (a.hour !== b.hour) return a.hour - b.hour;
  return a.minute - b.minute;
}

/**
 * Convierte fecha + hora del formulario (reloj de Chile) a ISO UTC para la cola/BD.
 */
export function buildScheduledIsoInTimeZone(
  date: string,
  time: string,
  timeZone = APP_SCHEDULE_TIMEZONE,
): string | null {
  const d = date.trim();
  const t = time.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  if (!/^\d{2}:\d{2}$/.test(t)) return null;

  const year = Number(d.slice(0, 4));
  const month = Number(d.slice(5, 7));
  const day = Number(d.slice(8, 10));
  const hour = Number(t.slice(0, 2));
  const minute = Number(t.slice(3, 5));
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  const target: WallClock = { year, month, day, hour, minute };
  const roughUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  let low = roughUtc - 6 * 3_600_000;
  let high = roughUtc + 6 * 3_600_000;

  for (let i = 0; i < 40; i++) {
    const mid = Math.floor((low + high) / 2);
    const wall = wallClockInTimeZone(mid, timeZone);
    const cmp = compareWallClock(wall, target);
    if (cmp === 0) {
      const aligned = Math.floor(mid / 60_000) * 60_000;
      return new Date(aligned).toISOString();
    }
    if (cmp < 0) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return null;
}

export function formatScheduleInTimeZone(
  iso: string,
  timeZone = APP_SCHEDULE_TIMEZONE,
): string {
  try {
    return new Date(iso).toLocaleString("es-CL", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export function isScheduleAtLeastMinutesAhead(
  scheduledIso: string,
  minutesAhead: number,
): boolean {
  const scheduledMs = new Date(scheduledIso).getTime();
  if (!Number.isFinite(scheduledMs)) return false;
  const minAheadMs = Date.now() + minutesAhead * 60_000;
  return scheduledMs >= minAheadMs;
}

/** Primer día del mes calendario en la zona indicada (YYYY-MM-01). */
export function monthStartIsoInTimeZone(
  date = new Date(),
  timeZone = APP_SCHEDULE_TIMEZONE,
): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value ?? "1970";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${year}-${month}-01`;
}
