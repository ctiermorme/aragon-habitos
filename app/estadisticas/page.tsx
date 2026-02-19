"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getTodayString } from "../../lib/db";
import SpendPointsForm from "../components/SpendPointsForm";
import rankingMunicipios from "../../data/rankingmunicipios.json";
import { computeAragonRanking } from "./ranking";

/**
 * Helper: Convert a Date object to ISO YYYY-MM-DD string
 */
function getISODateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

/**
 * Helper: Get an array of the last N dates (including today), in descending order
 */
function getLastNDates(n: number): string[] {
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(getISODateString(d));
  }
  return dates;
}

export default function EstadisticasPage() {
  const [rankingSortMode, setRankingSortMode] = useState<"total" | "puesto">("total");
  const today = getTodayString();
  const last7Dates = useMemo(() => getLastNDates(7), []);
  const last14Dates = useMemo(() => getLastNDates(14), []);

  // === Query all data ===
  const dailySummaries = useLiveQuery(
    async () => {
      const items = await db.dailySummaries.where("date").anyOf(last14Dates).toArray();
      return items;
    },
    [last14Dates],
    []
  );

  const habitLogs = useLiveQuery(
    async () => {
      const items = await db.habitLogs.where("date").anyOf(last14Dates).toArray();
      return items;
    },
    [last14Dates],
    []
  );

  const allHabits = useLiveQuery(async () => db.habits.toArray(), [], []);

  const municipalities = useLiveQuery(async () => db.municipalities.toArray(), [], []);

  const populationTransactions = useLiveQuery(
    async () => db.populationTransactions.toArray(),
    [],
    []
  );

  const habitMap = useMemo(() => {
    const map = new Map(allHabits.map((h) => [h.id, h.name]));
    return map;
  }, [allHabits]);

  // === Helper: Compute daily stats from habitLogs if dailySummaries is empty ===
  const dailyStatsFromLogs = useMemo(() => {
    if (dailySummaries && dailySummaries.length > 0) {
      return null; // Use dailySummaries instead
    }

    const map = new Map<string, { totalPoints: number; habitsLogged: number; habitsCompleted: number }>();
    for (const log of habitLogs) {
      if (!map.has(log.date)) {
        map.set(log.date, { totalPoints: 0, habitsLogged: 0, habitsCompleted: 0 });
      }
      const stats = map.get(log.date)!;
      stats.totalPoints += log.pointsEarned;
      if (log.status !== "null") {
        stats.habitsLogged += 1;
      }
      if (log.status === "yes") {
        stats.habitsCompleted += 1;
      }
    }
    return map;
  }, [dailySummaries, habitLogs]);

  // === Today's points ===
  const todaysPoints = useMemo(() => {
    if (dailySummaries.length > 0) {
      const today_summary = dailySummaries.find((s) => s.date === today);
      return today_summary?.totalPoints ?? 0;
    }

    // Compute from habitLogs
    return habitLogs
      .filter((log) => log.date === today)
      .reduce((sum, log) => sum + log.pointsEarned, 0);
  }, [dailySummaries, habitLogs, today]);

  // === Last 7 days points ===
  const last7Points = useMemo(() => {
    if (dailySummaries.length > 0) {
      return dailySummaries
        .filter((s) => last7Dates.includes(s.date))
        .reduce((sum, s) => sum + s.totalPoints, 0);
    }

    // Compute from habitLogs
    return habitLogs
      .filter((log) => last7Dates.includes(log.date))
      .reduce((sum, log) => sum + log.pointsEarned, 0);
  }, [dailySummaries, habitLogs, last7Dates]);

  // === Today's completion percentage ===
  const todaysCompletionPercent = useMemo(() => {
    if (dailySummaries.length > 0) {
      const today_summary = dailySummaries.find((s) => s.date === today);
      if (!today_summary || today_summary.habitsLogged === 0) {
        return 0;
      }
      return Math.round((today_summary.habitsCompleted / today_summary.habitsLogged) * 100);
    }

    // Compute from habitLogs
    const todayLogs = habitLogs.filter((log) => log.date === today);
    const logged = todayLogs.filter((log) => log.status !== "null").length;
    const completed = todayLogs.filter((log) => log.status === "yes").length;
    if (logged === 0) {
      return 0;
    }
    return Math.round((completed / logged) * 100);
  }, [dailySummaries, habitLogs, today]);

  // === Streak calculation ===
  const streak = useMemo(() => {
    let count = 0;
    for (const date of last14Dates) {
      let hasCompletion = false;

      if (dailySummaries.length > 0) {
        const summary = dailySummaries.find((s) => s.date === date);
        hasCompletion = (summary?.habitsCompleted ?? 0) > 0;
      } else {
        const logsForDate = habitLogs.filter((log) => log.date === date && log.status === "yes");
        hasCompletion = logsForDate.length > 0;
      }

      if (hasCompletion) {
        count++;
      } else {
        break;
      }
    }
    return count;
  }, [dailySummaries, habitLogs, last14Dates]);

  // === Last 14 days table data ===
  const last14Table = useMemo(() => {
    if (dailySummaries.length > 0) {
      return dailySummaries
        .filter((s) => last14Dates.includes(s.date))
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((s) => ({
          date: s.date,
          totalPoints: s.totalPoints,
          habitsLogged: s.habitsLogged,
          habitsCompleted: s.habitsCompleted,
        }));
    }

    // Compute from habitLogs
    const map = dailyStatsFromLogs ?? new Map();
    return Array.from(map.entries())
      .filter(([date]) => last14Dates.includes(date))
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, stats]) => ({
        date,
        ...stats,
      }));
  }, [dailySummaries, dailyStatsFromLogs, last14Dates]);

  // === Top 7-day habits ===
  const top7Habits = useMemo(() => {
    const habitStats = new Map<
      string,
      { yesCount: number; loggedCount: number; pointsEarned: number }
    >();

    for (const log of habitLogs.filter((h) => last7Dates.includes(h.date))) {
      if (!habitStats.has(log.habitId)) {
        habitStats.set(log.habitId, { yesCount: 0, loggedCount: 0, pointsEarned: 0 });
      }
      const stat = habitStats.get(log.habitId)!;
      stat.pointsEarned += log.pointsEarned;
      if (log.status !== "null") {
        stat.loggedCount += 1;
      }
      if (log.status === "yes") {
        stat.yesCount += 1;
      }
    }

    return Array.from(habitStats.entries())
      .map(([habitId, stat]) => ({
        habitId,
        habitName: habitMap.get(habitId) || "(deleted habit)",
        ...stat,
        yesRate: stat.loggedCount > 0 ? Math.round((stat.yesCount / stat.loggedCount) * 100) : 0,
      }))
      .sort((a, b) => b.pointsEarned - a.pointsEarned);
  }, [habitLogs, last7Dates, habitMap]);

  const rankingRows = useMemo(() => {
    const computed = computeAragonRanking(
      municipalities,
      populationTransactions,
      rankingMunicipios
    );

    if (rankingSortMode === "puesto") {
      return [...computed].sort((a, b) => {
        const aPuesto = a.puesto_nue ?? Number.MAX_SAFE_INTEGER;
        const bPuesto = b.puesto_nue ?? Number.MAX_SAFE_INTEGER;
        if (aPuesto !== bPuesto) {
          return aPuesto - bPuesto;
        }
        return b.total - a.total;
      });
    }

    return [...computed].sort((a, b) => b.total - a.total);
  }, [municipalities, populationTransactions, rankingSortMode]);

  return (
    <div className="space-y-8 p-8">
      <h1 className="text-3xl font-bold">Estadísticas</h1>

      {/* Saldo y Gastar puntos */}
      <SpendPointsForm />

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        {/* Card 1: Today's Points */}
        <div className="rounded border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold text-gray-600">Puntos hoy</div>
          <div className="mt-2 text-4xl font-bold text-blue-600">{todaysPoints}</div>
        </div>

        {/* Card 2: Last 7 Days Points */}
        <div className="rounded border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold text-gray-600">Puntos 7 días</div>
          <div className="mt-2 text-4xl font-bold text-green-600">{last7Points}</div>
        </div>

        {/* Card 3: Today's Completion % */}
        <div className="rounded border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold text-gray-600">% completados hoy</div>
          <div className="mt-2 text-4xl font-bold text-purple-600">{todaysCompletionPercent}%</div>
        </div>

        {/* Card 4: Streak */}
        <div className="rounded border border-gray-200 bg-white p-4">
          <div className="text-xs font-semibold text-gray-600">Racha</div>
          <div className="mt-2 text-4xl font-bold text-orange-600">{streak}</div>
        </div>
      </div>

      {/* Last 14 Days Table */}
      <div>
        <h2 className="mb-3 text-xl font-semibold">Últimos 14 días</h2>
        {last14Table.length > 0 ? (
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border-b border-gray-200 px-4 py-2 text-left">Fecha</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Puntos totales</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Hábitos registrados</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Completados</th>
                </tr>
              </thead>
              <tbody>
                {last14Table.map((row) => (
                  <tr key={row.date} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-2">{row.date}</td>
                    <td className="px-4 py-2 text-right font-semibold">{row.totalPoints}</td>
                    <td className="px-4 py-2 text-right">{row.habitsLogged}</td>
                    <td className="px-4 py-2 text-right">{row.habitsCompleted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded border border-gray-200 bg-gray-50 p-4 text-center text-gray-500">
            No hay datos todavía
          </div>
        )}
      </div>

      {/* Top 7-Day Habits */}
      <div>
        <h2 className="mb-3 text-xl font-semibold">Top hábitos (7 días)</h2>
        {top7Habits.length > 0 ? (
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border-b border-gray-200 px-4 py-2 text-left">Hábito</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Puntos</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Completados</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Registrados</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">% acierto</th>
                </tr>
              </thead>
              <tbody>
                {top7Habits.map((habit) => (
                  <tr key={habit.habitId} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-2">{habit.habitName}</td>
                    <td className="px-4 py-2 text-right font-semibold">{habit.pointsEarned}</td>
                    <td className="px-4 py-2 text-right">{habit.yesCount}</td>
                    <td className="px-4 py-2 text-right">{habit.loggedCount}</td>
                    <td className="px-4 py-2 text-right">{habit.yesRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded border border-gray-200 bg-gray-50 p-4 text-center text-gray-500">
            No hay datos todavía
          </div>
        )}
      </div>

      {/* Ranking municipios dinámico */}
      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">Ranking municipios (dinámico)</h2>
          <button
            type="button"
            onClick={() =>
              setRankingSortMode((prev) => (prev === "total" ? "puesto" : "total"))
            }
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Ordenar: {rankingSortMode === "total" ? "total ↓" : "puesto nuevo ↑"}
          </button>
        </div>

        {rankingRows.length > 0 ? (
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border-b border-gray-200 px-4 py-2 text-left">Municipio</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-left">Provincia</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Base</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Extra</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Total</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Puesto ant</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Puesto nue</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Diferencia</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Δ puesto</th>
                </tr>
              </thead>
              <tbody>
                {rankingRows.map((row) => (
                  <tr key={row.municipalityId} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-4 py-2">{row.name}</td>
                    <td className="px-4 py-2">{row.province}</td>
                    <td className="px-4 py-2 text-right">{row.base.toLocaleString("es-ES")}</td>
                    <td className="px-4 py-2 text-right">{row.extra.toLocaleString("es-ES")}</td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {row.total.toLocaleString("es-ES")}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {row.puesto_ant !== null ? row.puesto_ant.toLocaleString("es-ES") : "-"}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {row.puesto_nue !== null ? row.puesto_nue.toLocaleString("es-ES") : "-"}
                    </td>
                    <td className="px-4 py-2 text-right">{row.diferencia.toLocaleString("es-ES")}</td>
                    <td className="px-4 py-2 text-right">
                      {row.delta_puesto !== null ? row.delta_puesto.toLocaleString("es-ES") : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded border border-gray-200 bg-gray-50 p-4 text-center text-gray-500">
            No hay municipios en la base de datos todavía
          </div>
        )}
      </div>
    </div>
  );
}
