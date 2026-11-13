// Stock card maths, shared by the server (what to prepare once a count is finished)
// and by the page (the same numbers live while counting), so the two always agree.
//
// Each product has an ideal quantity per weekday in two places: the back storage
// ("chambre froide") and the little service fridge in front ("makeline"). The day
// before an open day, both places are counted. Each place is topped up to its own
// ideal. What has to be prepared is
//   todo = idealStock - makelineStock - fridgeStock
// where idealStock is the two ideals added together, so a surplus in one place makes up
// for a shortage in the other.

export type Location = "chambre" | "makeline";
export const LOCATIONS: readonly Location[] = ["chambre", "makeline"];

export type StockItem = {
  id: string;
  name: string;
  order: number;
  /** Ideal quantity per weekday, keyed "1" (Monday) to "7" (Sunday). A missing day is 0. */
  chambre: Record<string, number>;
  makeline: Record<string, number>;
};

/** What was counted, per product and place. A missing entry hasn't been counted yet. */
export type StockCounts = Record<string, Partial<Record<Location, number>>>;

export const MAX_QTY = 9999;

/** Quantities are whole numbers or halves: containers are counted as 1, 1/2, 2... */
export const isQty = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= MAX_QTY && Number.isInteger(n * 2);

export const idealOf = (item: StockItem, location: Location, weekday: number): number =>
  item[location]?.[String(weekday)] ?? 0;

// ─── Dates ────────────────────────────────────────────────────────────────────
// Plain ISO dates (YYYY-MM-DD), worked out in UTC so a machine's time zone can't shift them.

export function weekdayOfIso(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Weekdays with any ideal quantity. A day where everything is 0 is a closed day. */
export function openWeekdays(items: StockItem[]): number[] {
  return [1, 2, 3, 4, 5, 6, 7].filter((day) =>
    items.some((item) => LOCATIONS.some((location) => idealOf(item, location, day) > 0)),
  );
}

/** The next open date after `iso`: the day a count made on `iso` prepares for. */
export function nextOpenDate(iso: string, open: number[]): string | null {
  if (!open.length) return null;
  for (let i = 1; i <= 7; i++) {
    const date = addDaysIso(iso, i);
    if (open.includes(weekdayOfIso(date))) return date;
  }
  return null;
}

// ─── Counting and what to prepare ─────────────────────────────────────────────

export type LocationLine = {
  ideal: number;
  /** null: not counted yet */
  counted: number | null;
  /** How far under the ideal; 0 when at or over it; null until counted */
  missing: number | null;
};

export type StockLine = {
  item: StockItem;
  /** null: nothing to count in that place on this weekday */
  chambre: LocationLine | null;
  makeline: LocationLine | null;
  /** idealStock - makelineStock - fridgeStock, counting only the places counted so far (never below 0) */
  toPrepare: number;
};

const byOrder = (a: StockItem, b: StockItem) => a.order - b.order || a.name.localeCompare(b.name);

/** The products to count for a weekday, in order, each with its two places. */
export function stockLines(items: StockItem[], counts: StockCounts, weekday: number): StockLine[] {
  return [...items].sort(byOrder).flatMap((item) => {
    const line = (location: Location): LocationLine | null => {
      const ideal = idealOf(item, location, weekday);
      if (ideal <= 0) return null;
      const counted = counts[item.id]?.[location] ?? null;
      return { ideal, counted, missing: counted === null ? null : Math.max(0, ideal - counted) };
    };
    const chambre = line("chambre");
    const makeline = line("makeline");
    if (!chambre && !makeline) return [];
    const short = LOCATIONS.reduce((sum, location) => {
      const entry = location === "chambre" ? chambre : makeline;
      return entry && entry.counted !== null ? sum + entry.ideal - entry.counted : sum;
    }, 0);
    return [{ item, chambre, makeline, toPrepare: Math.max(0, short) }];
  });
}

/** How many (product, place) counts there are in total, and how many are done. One place, or both. */
export function countProgress(lines: StockLine[], only?: Location): { total: number; counted: number } {
  let total = 0;
  let counted = 0;
  for (const line of lines) {
    for (const location of only ? [only] : LOCATIONS) {
      const entry = line[location];
      if (!entry) continue;
      total++;
      if (entry.counted !== null) counted++;
    }
  }
  return { total, counted };
}

/** The places a count card is for, in the order they're counted: makeline first, then the fridge. */
export const COUNT_ORDER: readonly Location[] = ["makeline", "chambre"];

export type PrepEntry = {
  item: StockItem;
  qty: number;
  /** Where the missing quantity is missing: only the places that are short */
  parts: Partial<Record<Location, number>>;
};

export function prepList(lines: StockLine[]): PrepEntry[] {
  return lines
    .filter((line) => line.toPrepare > 0)
    .map((line) => {
      // Where it goes: the makeline is topped up first, then the fridge, never more than the total.
      const parts: Partial<Record<Location, number>> = {};
      let left = line.toPrepare;
      for (const location of ["makeline", "chambre"] as const) {
        const share = Math.min(line[location]?.missing ?? 0, left);
        if (share) parts[location] = share;
        left -= share;
      }
      return { item: line.item, qty: line.toPrepare, parts };
    });
}

// ─── Showing and typing quantities ────────────────────────────────────────────

/** 0.5 -> "½", 1.5 -> "1½", 3 -> "3" */
export function formatQty(n: number): string {
  const whole = Math.floor(n);
  if (n - whole !== 0.5) return String(whole);
  return whole === 0 ? "½" : `${whole}½`;
}

/**
 * Reads what someone typed: "2", "1,5", "½", "1½", "1/2", "1 1/2". Anything in
 * between rounds to the nearest half. null when it isn't a quantity.
 */
export function parseQty(raw: string): number | null {
  const text = raw.trim().replace(",", ".").replace(/\s+/g, " ");
  if (!text) return null;

  let value: number;
  let match: RegExpMatchArray | null;
  if ((match = text.match(/^(\d+)?\s?½$/))) {
    value = (match[1] ? Number(match[1]) : 0) + 0.5;
  } else if ((match = text.match(/^(?:(\d+) )?(\d+)\/(\d+)$/))) {
    value = (match[1] ? Number(match[1]) : 0) + Number(match[2]) / Number(match[3]);
  } else if (/^\d+(\.\d+)?$/.test(text)) {
    value = Number(text);
  } else {
    return null;
  }

  const rounded = Math.round(value * 2) / 2;
  return isQty(rounded) ? rounded : null;
}
