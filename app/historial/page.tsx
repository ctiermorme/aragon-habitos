"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getTodayString } from "../../lib/db";

const CHART_DAYS = 90;

type PointsSeriesItem = {
  date: string;
  points: number;
  avgPoints: number;
};

function addDays(isoDate: string, days: number): string {
  // Keep calculations in UTC to avoid timezone/DST date drift.
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().split("T")[0];
}

export default function HistorialPage() {
  const [selectedDateState, setSelectedDateState] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const today = getTodayString();

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setRefreshToken((prev) => prev + 1);
    }, 1500);

    const handleFocus = () => {
      setRefreshToken((prev) => prev + 1);
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, []);

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
  }, [refreshToken]);

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
    [selectedDate, refreshToken],
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
    [selectedDate, refreshToken]
  );

  const pointsSeries = useLiveQuery(
    async (): Promise<PointsSeriesItem[]> => {
      const endDate = today;
      const startDate = addDays(endDate, -(CHART_DAYS - 1));
      const allDates = Array.from({ length: CHART_DAYS }, (_, index) =>
        addDays(startDate, index)
      );

      const summaries = await db.dailySummaries
        .where("date")
        .between(startDate, endDate, true, true)
        .toArray();
      const summaryMap = new Map(summaries.map((summary) => [summary.date, summary.totalPoints]));

      const logs = await db.habitLogs
        .where("date")
        .between(startDate, endDate, true, true)
        .toArray();
      const logsTotalMap = new Map<string, number>();

      for (const log of logs) {
        logsTotalMap.set(log.date, (logsTotalMap.get(log.date) ?? 0) + (log.pointsEarned ?? 0));
      }

      const withPoints = allDates.map((date) => ({
        date,
        points: summaryMap.get(date) ?? logsTotalMap.get(date) ?? 0,
      }));

      return withPoints.map((item, index) => {
        const from = Math.max(0, index - 6);
        const window = withPoints.slice(from, index + 1);
        const avgPoints = window.reduce((sum, row) => sum + row.points, 0) / window.length;

        return {
          ...item,
          avgPoints,
        };
      });
    },
    [today, refreshToken],
    []
  );

  const chart = useMemo(() => {
    if (!pointsSeries.length) {
      return null;
    }

    const width = 1100;
    const height = 320;
    const paddingTop = 20;
    const paddingRight = 22;
    const paddingBottom = 44;
    const paddingLeft = 58;
    const values = pointsSeries.map((item) => item.points);
    const maxAbsBase = Math.max(...values.map((value) => Math.abs(value)), 1);
    const extra = Math.max(10, maxAbsBase * 0.15);
    const maxValue = Math.ceil(maxAbsBase + extra);
    const minValue = -maxValue;
    const range = Math.max(1, maxValue - minValue);

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    const toX = (index: number) =>
      paddingLeft + (index / Math.max(1, pointsSeries.length - 1)) * chartWidth;
    const toY = (value: number) => paddingTop + ((maxValue - value) / range) * chartHeight;

    const points = pointsSeries
      .map((item, index) => {
        const x = toX(index);
        const y = toY(item.points);
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");

    const avgPoints = pointsSeries
      .map((item, index) => `${toX(index).toFixed(2)},${toY(item.avgPoints).toFixed(2)}`)
      .join(" ");

    const areaPoints = [
      `${toX(0).toFixed(2)},${toY(0).toFixed(2)}`,
      points,
      `${toX(pointsSeries.length - 1).toFixed(2)},${toY(0).toFixed(2)}`,
    ].join(" ");

    const zeroY = toY(0);

    const yTicks = Array.from({ length: 7 }, (_, idx) => {
      const ratio = idx / 6;
      const value = Math.round(maxValue - ratio * range);
      const y = toY(value);
      return { value, y };
    });

    const xTickIndexes = [
      0,
      Math.floor((pointsSeries.length - 1) / 4),
      Math.floor((pointsSeries.length - 1) / 2),
      Math.floor(((pointsSeries.length - 1) * 3) / 4),
      pointsSeries.length - 1,
    ];
    const xTicks = xTickIndexes.map((index) => ({
      x: toX(index),
      label: pointsSeries[index]?.date,
    }));

    const positiveDays = pointsSeries.filter((item) => item.points > 0).length;
    const negativeDays = pointsSeries.filter((item) => item.points < 0).length;
    const neutralDays = pointsSeries.length - positiveDays - negativeDays;

    return {
      width,
      height,
      paddingLeft,
      paddingRight,
      paddingTop,
      paddingBottom,
      chartWidth,
      chartHeight,
      points,
      avgPoints,
      areaPoints,
      minValue,
      maxValue,
      zeroY,
      yTicks,
      xTicks,
      firstDate: pointsSeries[0]?.date,
      lastDate: pointsSeries[pointsSeries.length - 1]?.date,
      lastValue: pointsSeries[pointsSeries.length - 1]?.points ?? 0,
      positiveDays,
      negativeDays,
      neutralDays,
      lastPointX: toX(pointsSeries.length - 1),
      lastPointY: toY(pointsSeries[pointsSeries.length - 1]?.points ?? 0),
    };
  }, [pointsSeries]);

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

      <div className="mt-6 rounded-2xl border border-white/20 bg-gradient-to-b from-slate-900/80 to-slate-950/80 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.3)]">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Evolución de puntos (últimos {CHART_DAYS} días)</h2>
            <p className="text-sm text-slate-300">Línea azul: puntos diarios. Línea verde: tendencia (media móvil 7 días). Escala centrada en 0.</p>
          </div>
          {chart && (
            <div className="text-right text-sm text-slate-200">
              <div>
                Último valor: <span className="font-bold">{chart.lastValue}</span>
              </div>
              <div className="text-xs text-slate-400">
                Min {chart.minValue} / Max {chart.maxValue}
              </div>
            </div>
          )}
        </div>

        {chart ? (
          <div className="overflow-x-auto rounded-xl border border-white/10 bg-slate-900/60 p-3">
            <svg
              viewBox={`0 0 ${chart.width} ${chart.height}`}
              className="h-72 min-w-[900px] w-full"
              role="img"
              aria-label={`Gráfica de evolución de puntos de los últimos ${CHART_DAYS} días`}
            >
              <defs>
                <linearGradient id="pointsAreaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                </linearGradient>
              </defs>
              <rect x="0" y="0" width={chart.width} height={chart.height} fill="#0f172a" />

              {chart.yTicks.map((tick) => (
                <g key={`y-${tick.value}`}>
                  <line
                    x1={chart.paddingLeft}
                    y1={tick.y}
                    x2={chart.width - chart.paddingRight}
                    y2={tick.y}
                    stroke="rgba(148,163,184,0.25)"
                    strokeWidth="1"
                  />
                  <text x={8} y={tick.y + 4} fill="#94a3b8" fontSize="12">
                    {tick.value}
                  </text>
                </g>
              ))}

              <line
                x1={chart.paddingLeft}
                y1={chart.zeroY}
                x2={chart.width - chart.paddingRight}
                y2={chart.zeroY}
                stroke="#94a3b8"
                strokeWidth="1.25"
                strokeDasharray="5 4"
              />

              <polyline
                fill="url(#pointsAreaGradient)"
                stroke="none"
                points={chart.areaPoints}
              />

              <polyline
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={chart.points}
              />

              <polyline
                fill="none"
                stroke="#22c55e"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                points={chart.avgPoints}
              />

              <line
                x1={chart.lastPointX}
                y1={chart.paddingTop}
                x2={chart.lastPointX}
                y2={chart.height - chart.paddingBottom}
                stroke="rgba(56,189,248,0.45)"
                strokeWidth="1"
                strokeDasharray="3 4"
              />

              <circle
                cx={chart.lastPointX}
                cy={chart.lastPointY}
                r="3.5"
                fill="#38bdf8"
                stroke="#e2e8f0"
                strokeWidth="1"
              />

              {chart.xTicks.map((tick) => (
                <text
                  key={`x-${tick.label}`}
                  x={tick.x}
                  y={chart.height - 10}
                  fill="#94a3b8"
                  fontSize="12"
                  textAnchor="middle"
                >
                  {tick.label}
                </text>
              ))}
            </svg>

            <div className="mt-3 grid gap-2 text-sm text-slate-300 md:grid-cols-3">
              <div className="rounded border border-sky-400/30 bg-sky-500/10 px-3 py-2">
                Días en positivo: <span className="font-semibold text-sky-300">{chart.positiveDays}</span>
              </div>
              <div className="rounded border border-red-400/30 bg-red-500/10 px-3 py-2">
                Días en negativo: <span className="font-semibold text-red-300">{chart.negativeDays}</span>
              </div>
              <div className="rounded border border-slate-300/30 bg-slate-500/10 px-3 py-2">
                Días neutrales: <span className="font-semibold text-slate-200">{chart.neutralDays}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded border border-dashed border-slate-500 bg-slate-900/60 p-6 text-center text-sm text-slate-300">
            No hay datos suficientes para construir la gráfica.
          </div>
        )}
      </div>

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
