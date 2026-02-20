"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../lib/db";

export default function HistorialPage() {
  const [selectedDateState, setSelectedDateState] = useState<string | null>(null);

  // Get all available dates from dailySummaries (desc), or derive from habitLogs
  const availableDates = useLiveQuery(async () => {
    const summaries = await db.dailySummaries.orderBy("date").reverse().toArray();
    if (summaries.length > 0) {
      return summaries.map((s) => s.date);
    }

    // Fallback: distinct dates from habitLogs
    const logs = await db.habitLogs.toArray();
    const dateSet = new Set(logs.map((log) => log.date));
    return Array.from(dateSet).sort().reverse();
  }, []);

  // Derive selectedDate: use selectedDateState if set, otherwise first available
  const selectedDate = useMemo(() => {
    if (selectedDateState) {
      return selectedDateState;
    }
    return availableDates && availableDates.length > 0 ? availableDates[0] : null;
  }, [selectedDateState, availableDates]);

  // Get all habits for mapping habitId -> name
  const habitMap = useLiveQuery(
    async () => {
      const habits = await db.habits.toArray();
      const map = new Map(habits.map((h) => [h.id, h.name]));
      return map;
    },
    [],
    new Map()
  );

  // Get habitLogs for selected date
  const todaysLogs = useLiveQuery(
    async () => {
      if (!selectedDate) {
        return [];
      }
      return await db.habitLogs.where("date").equals(selectedDate).toArray();
    },
    [selectedDate],
    []
  );

  // Get daily summary for selected date
  const dailySummary = useLiveQuery(
    async () => {
      if (!selectedDate) {
        return null;
      }
      return await db.dailySummaries.get(selectedDate);
    },
    [selectedDate]
  );

  // Compute totals if no dailySummary exists
  const computedTotals = useMemo(() => {
    const totalPoints = todaysLogs.reduce(
      (sum, log) => sum + (log.pointsEarned ?? 0),
      0
    );
    const habitsLogged = todaysLogs.filter((log) => log.status !== "null").length;
    const habitsCompleted = todaysLogs.filter((log) => log.status === "yes").length;

    return { totalPoints, habitsLogged, habitsCompleted };
  }, [todaysLogs]);

  const totals = dailySummary || computedTotals;

  // Navigation
  const selectedIndex = selectedDate ? availableDates?.indexOf(selectedDate) ?? -1 : -1;
  const canGoPrev = selectedIndex > 0;
  const canGoNext = selectedIndex >= 0 && selectedIndex < (availableDates?.length ?? 0) - 1;

  const goPrevDay = () => {
    if (canGoPrev && availableDates) {
      setSelectedDateState(availableDates[selectedIndex - 1]);
    }
  };

  const goNextDay = () => {
    if (canGoNext && availableDates) {
      setSelectedDateState(availableDates[selectedIndex + 1]);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Historial</h1>

      <div className="mt-6 flex gap-6">
        {/* Left: Date list */}
        <div className="w-40 flex-shrink-0">
          <h2 className="mb-3 text-lg font-semibold">Fechas</h2>
          <div className="max-h-96 overflow-y-auto rounded border border-gray-300 bg-gray-50">
            {availableDates && availableDates.length > 0 ? (
              <ul className="divide-y divide-gray-200">
                {availableDates.map((date) => (
                  <li key={date}>
                    <button
                      type="button"
                      onClick={() => setSelectedDateState(date)}
                      className={`block w-full px-3 py-2 text-left text-sm text-black ${
                        selectedDate === date
                          ? "bg-blue-100 font-semibold text-blue-800"
                          : "hover:bg-gray-100"
                      }`}
                    >
                      {date}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-3 text-center text-sm text-gray-500">No hay datos</div>
            )}
          </div>
        </div>

        {/* Right: Detail view */}
        <div className="flex-1">
          {selectedDate ? (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-black">{selectedDate}</h2>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!canGoPrev}
                    onClick={goPrevDay}
                    className="rounded border border-gray-300 bg-gray-100 px-3 py-1 text-sm text-black disabled:opacity-50"
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    disabled={!canGoNext}
                    onClick={goNextDay}
                    className="rounded border border-gray-300 bg-gray-100 px-3 py-1 text-sm text-black disabled:opacity-50"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>

              <div className="mb-4 rounded border border-gray-200 bg-gray-50 p-3">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-700">Puntos Totales</div>
                    <div
                      className={`text-3xl font-bold ${
                        totals.totalPoints > 0
                          ? "text-green-600"
                          : totals.totalPoints < 0
                          ? "text-red-600"
                          : "text-black"
                      }`}
                    >
                      {totals.totalPoints}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-700">Hábitos Registrados</div>
                    <div className="text-3xl text-black">{totals.habitsLogged}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-gray-700">Hábitos Completados</div>
                    <div className="text-3xl text-black">{totals.habitsCompleted}</div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded border border-gray-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="border-b border-gray-200 px-4 py-2 text-left text-black">Hábito</th>
                      <th className="border-b border-gray-200 px-4 py-2 text-left text-black">Estado</th>
                      <th className="border-b border-gray-200 px-4 py-2 text-right text-black">Puntos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {todaysLogs.length > 0 ? (
                      todaysLogs.map((log) => {
                        const habitName = habitMap?.get(log.habitId) || "(deleted habit)";
                        const statusDisplay =
                          log.status === "yes" ? "✅" : log.status === "no" ? "❌" : "➖";

                        return (
                          <tr key={log.id} className="border-b border-gray-200 hover:bg-gray-50">
                            <td className="px-4 py-2">{habitName}</td>
                            <td className="px-4 py-2">{statusDisplay}</td>
                            <td className="px-4 py-2 text-right font-semibold">
                              {log.pointsEarned}
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                          No logs for this date.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex h-96 items-center justify-center rounded border border-gray-200 bg-gray-50">
              <p className="text-gray-500">Selecciona una fecha para ver detalles.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
