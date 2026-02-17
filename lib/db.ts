import Dexie, { Table } from "dexie";

/**
 * Small helper to generate stable unique ids (good for sync/export later)
 */
export function makeId(): string {
  // Modern browsers
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback (good enough for local ids)
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Habit record - tracks individual habits
 */
export interface Habit {
  id: string;
  name: string;
  description?: string;
  pointsYes: number; // Points earned for completing (yes)
  pointsNo: number; // Points earned for not doing (no) - usually 0 or negative
  active: boolean;
  createdAt: number; // timestamp
  updatedAt: number; // timestamp
}

/**
 * Habit log entry - daily log of habit completion
 * status:
 * - "yes"  -> completed
 * - "no"   -> not completed
 * - "null" -> ignored / not counted
 */
export interface HabitLog {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  habitId: string;
  status: "yes" | "no" | "null";
  createdAt: number;
  updatedAt: number;
}

/**
 * Daily summary - consolidated daily stats (snapshot for history)
 */
export interface DailySummary {
  date: string; // ISO date string (YYYY-MM-DD) -> primary key
  totalPoints: number;
  habitsCompleted: number;
  habitsLogged: number;
  updatedAt: number;
}

/**
 * Ledger entry - transaction history
 */
export interface LedgerEntry {
  id: string;
  date: string; // ISO date string (YYYY-MM-DD)
  type: "EARN" | "SPEND";
  amount: number;
  description?: string;
  relatedDailySummaryDate?: string; // link to daily summary date (optional)
  createdAt: number;
}

/**
 * Municipality - Aragonese municipality data
 */
export interface Municipality {
  id: string;
  name: string;
  province: string; // HUESCA, TERUEL, ZARAGOZA (or your preferred casing)
  basePopulation: number; // Starting population
  latitude: number;
  longitude: number;
  createdAt: number;
}

/**
 * Population transaction - track population changes
 */
export interface PopulationTransaction {
  id: string;
  municipalityId: string;
  date: string; // ISO date string (YYYY-MM-DD)
  amount: number; // Positive or negative change
  reason?: string; // e.g., "Spent points", "Manual edit"
  createdAt: number;
}

/**
 * Dexie Database definition
 */
export class AragonHabitosDB extends Dexie {
  habits!: Table<Habit, string>;
  habitLogs!: Table<HabitLog, string>;
  dailySummaries!: Table<DailySummary, string>; // key = date
  ledger!: Table<LedgerEntry, string>;
  municipalities!: Table<Municipality, string>;
  populationTransactions!: Table<PopulationTransaction, string>;

  constructor() {
    super("AragonHabitosDB");

    this.version(1).stores({
      // unique habit names to avoid duplicates
      habits: "id, &name, active, updatedAt",

      // unique per (date + habitId) so you can upsert easily
      habitLogs: "id, date, habitId, [date+habitId], updatedAt",

      // date as primary key (one summary per day)
      dailySummaries: "date, updatedAt",

      ledger: "id, date, type, createdAt",

      // unique municipality name (optional but helpful)
      municipalities: "id, &name, province, basePopulation",

      // unique per (municipalityId + date) if you want 1 tx per day,
      // keep it if that matches your logic; otherwise remove the unique index
      populationTransactions: "id, municipalityId, date, [municipalityId+date], createdAt",
    });
  }
}

/**
 * Singleton instance of the database
 */
export const db = new AragonHabitosDB();

/**
 * Helper to get current ISO date string
 */
export function getTodayString(): string {
  const today = new Date();
  return today.toISOString().split("T")[0];
}

/**
 * Helper to get current timestamp
 */
export function getCurrentTimestamp(): number {
  return Date.now();
}
