"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  getCurrentTimestamp,
  getTodayString,
  Habit,
  HabitLog,
  makeId,
} from "../../lib/db";

const PREVIOUS_DAY_NULL_CHECK_KEY = "previousDayNullCheckDate";

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().split("T")[0];
}

export default function HabitosPage() {
  const [pendingHabitId, setPendingHabitId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [habitMultipliers, setHabitMultipliers] = useState<Record<string, string>>({});

  const today = getTodayString();

  const habits = useLiveQuery(async () => {
    const allHabits = await db.habits.orderBy("name").toArray();
    return allHabits.filter((habit) => habit.active);
  }, []);

  const todayLogs = useLiveQuery(
    async () => await db.habitLogs.where("date").equals(today).toArray(),
    [today],
    []
  );

  const todaySummary = useLiveQuery(async () => await db.dailySummaries.get(today), [today]);

  const logsByHabitId = useMemo(() => {
    const map = new Map<string, HabitLog>();
    for (const log of todayLogs) {
      map.set(log.habitId, log);
    }
    return map;
  }, [todayLogs]);

  const computedTotalPoints = useMemo(() => {
    if (!habits?.length || !todayLogs.length) {
      return 0;
    }

    const habitById = new Map<string, Habit>(habits.map((habit) => [habit.id, habit]));

    return todayLogs.reduce((accumulator, log) => {
      if (typeof log.pointsEarned === "number") {
        return accumulator + log.pointsEarned;
      }

      const habit = habitById.get(log.habitId);
      if (!habit) {
        return accumulator;
      }

      if (log.status === "yes") {
        return accumulator + habit.pointsYes;
      }

      if (log.status === "no") {
        return accumulator + habit.pointsNo;
      }

      return accumulator;
    }, 0);
  }, [habits, todayLogs]);

  const todayTotalPoints = todaySummary?.totalPoints ?? computedTotalPoints;

  useEffect(() => {
    if (!habits) {
      return;
    }

    let cancelled = false;

    const checkPreviousDayAllNull = async () => {
      try {
        const yesterday = addDays(today, -1);

        await db.transaction(
          "rw",
          db.habitLogs,
          db.dailySummaries,
          db.ledger,
          db.appState,
          async () => {
            const checkState = await db.appState.get(PREVIOUS_DAY_NULL_CHECK_KEY);
            if (checkState?.value === today) {
              return;
            }

            const activeHabits = habits.filter((habit) => habit.active);
            if (activeHabits.length === 0) {
              await db.appState.put({ key: PREVIOUS_DAY_NULL_CHECK_KEY, value: today });
              return;
            }

            const previousDayLogs = await db.habitLogs.where("date").equals(yesterday).toArray();
            const logByHabitId = new Map(previousDayLogs.map((log) => [log.habitId, log]));

            const allWereNull = activeHabits.every((habit) => {
              const log = logByHabitId.get(habit.id);
              return !log || log.status === "null";
            });

            if (allWereNull) {
              const now = getCurrentTimestamp();
              const previousSummary = await db.dailySummaries.get(yesterday);
              const previousTotalPoints =
                previousSummary?.totalPoints ??
                previousDayLogs.reduce((sum, log) => sum + (log.pointsEarned ?? 0), 0);

              for (const habit of activeHabits) {
                const existingLog = logByHabitId.get(habit.id);

                if (existingLog) {
                  await db.habitLogs.update(existingLog.id, {
                    status: "no",
                    pointsEarned: habit.pointsNo,
                    updatedAt: now,
                  });
                } else {
                  await db.habitLogs.add({
                    id: makeId(),
                    date: yesterday,
                    habitId: habit.id,
                    status: "no",
                    pointsEarned: habit.pointsNo,
                    createdAt: now,
                    updatedAt: now,
                  });
                }
              }

              const updatedLogs = await db.habitLogs.where("date").equals(yesterday).toArray();
              const totalPoints = updatedLogs.reduce(
                (sum, log) => sum + (log.pointsEarned ?? 0),
                0
              );
              const habitsCompleted = updatedLogs.filter((log) => log.status === "yes").length;
              const habitsLogged = updatedLogs.filter((log) => log.status !== "null").length;

              await db.dailySummaries.put({
                date: yesterday,
                totalPoints,
                habitsCompleted,
                habitsLogged,
                updatedAt: now,
              });

              const delta = totalPoints - previousTotalPoints;

              if (delta !== 0) {
                await db.ledger.add({
                  id: makeId(),
                  type: "EARN",
                  amount: delta,
                  date: yesterday,
                  description: "Auto NO for previous empty day",
                  createdAt: now,
                });
              }
            }

            await db.appState.put({ key: PREVIOUS_DAY_NULL_CHECK_KEY, value: today });
          }
        );
      } catch {
        if (!cancelled) {
          setErrorMessage("Failed to verify previous day habits.");
        }
      }
    };

    checkPreviousDayAllNull();

    return () => {
      cancelled = true;
    };
  }, [habits, today]);

  const getMultiplierValue = (habitId: string): number => {
    const raw = habitMultipliers[habitId] ?? "1";
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 1) {
      return 1;
    }
    return parsed;
  };

  const handleMultiplierChange = (habitId: string, value: string) => {
    if (value === "") {
      setHabitMultipliers((prev) => ({ ...prev, [habitId]: "" }));
      return;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return;
    }

    setHabitMultipliers((prev) => ({
      ...prev,
      [habitId]: String(Math.max(1, parsed)),
    }));
  };

  const incrementMultiplier = (habitId: string) => {
    const nextValue = getMultiplierValue(habitId) + 1;
    setHabitMultipliers((prev) => ({ ...prev, [habitId]: String(nextValue) }));
  };

  const decrementMultiplier = (habitId: string) => {
    const nextValue = Math.max(1, getMultiplierValue(habitId) - 1);
    setHabitMultipliers((prev) => ({ ...prev, [habitId]: String(nextValue) }));
  };

  const handleLogHabit = async (
    habit: Habit,
    status: "yes" | "no" | "null",
    multiplier = 1
  ) => {
    const now = getCurrentTimestamp();
    const safeMultiplier = Math.max(1, Math.floor(multiplier));
    const pointsEarned =
      status === "yes"
        ? habit.pointsYes * safeMultiplier
        : status === "no"
        ? habit.pointsNo * safeMultiplier
        : 0;

    setErrorMessage(null);
    setPendingHabitId(habit.id);

    try {
      await db.transaction("rw", db.habitLogs, db.dailySummaries, db.ledger, async () => {
        const previousSummary = await db.dailySummaries.get(today);
        const previousTotalPoints = previousSummary?.totalPoints ?? 0;

        const existingLog = await db.habitLogs
          .where("[date+habitId]")
          .equals([today, habit.id])
          .first();

        if (existingLog) {
          await db.habitLogs.update(existingLog.id, {
            status,
            pointsEarned,
            updatedAt: now,
          });
        } else {
          await db.habitLogs.add({
            id: makeId(),
            date: today,
            habitId: habit.id,
            status,
            pointsEarned,
            createdAt: now,
            updatedAt: now,
          });
        }

        const todaysLogs = await db.habitLogs.where("date").equals(today).toArray();

        const totalPoints = todaysLogs.reduce(
          (accumulator, log) => accumulator + log.pointsEarned,
          0
        );
        const habitsCompleted = todaysLogs.filter((log) => log.status === "yes").length;
        const habitsLogged = todaysLogs.filter((log) => log.status !== "null").length;

        await db.dailySummaries.put({
          date: today,
          totalPoints,
          habitsCompleted,
          habitsLogged,
          updatedAt: now,
        });

        const delta = totalPoints - previousTotalPoints;

        if (delta !== 0) {
          await db.ledger.add({
            id: makeId(),
            type: "EARN",
            amount: delta,
            date: today,
            description: "Daily habit total adjustment",
            createdAt: now,
          });
        }
      });
    } catch {
      setErrorMessage("Failed to store habit log.");
    } finally {
      setPendingHabitId(null);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Hábitos</h1>

      <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-white">
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/80">Fecha de hoy</span>
          <span className="text-lg font-bold">{today}</span>
        </div>
        <div className="h-10 w-px bg-white/30" aria-hidden="true" />
        <div className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/80">Puntos ganados hoy</span>
          <span
            className={`text-2xl font-extrabold ${
              todayTotalPoints > 0
                ? "text-green-400"
                : todayTotalPoints < 0
                ? "text-red-400"
                : "text-white"
            }`}
          >
            {todayTotalPoints}
          </span>
        </div>
      </div>

      {errorMessage && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-200 text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border border-gray-200 px-3 py-2 text-center text-black">Nombre</th>
              <th className="border border-gray-200 px-3 py-2 text-center text-black">Puntos Sí</th>
              <th className="border border-gray-200 px-3 py-2 text-center text-black">Puntos No</th>
              <th className="border border-gray-200 px-3 py-2 text-center text-black">Hoy</th>
              <th className="border border-gray-200 px-3 py-2 text-center text-black">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {habits?.length ? (
              habits.map((habit) => {
                const todayStatus = logsByHabitId.get(habit.id)?.status ?? "null";
                const multiplierValue = getMultiplierValue(habit.id);
                const isPending = pendingHabitId === habit.id;
                const yesIsActive = todayStatus === "yes";
                const noIsActive = todayStatus === "no";
                const nullIsActive = todayStatus === "null";
                const todayStatusIcon =
                  todayStatus === "yes" ? "✅" : todayStatus === "no" ? "❌" : "➖";
                const todayStatusColorClass =
                  todayStatus === "yes"
                    ? "text-green-600"
                    : todayStatus === "no"
                    ? "text-red-600"
                    : "text-gray-500";

                return (
                  <tr key={habit.id}>
                    <td className="border border-gray-200 px-3 py-2 text-center text-lg font-bold">{habit.name}</td>
                    <td className="border border-gray-200 px-3 py-2 text-center">{habit.pointsYes}</td>
                    <td className="border border-gray-200 px-3 py-2 text-center">{habit.pointsNo}</td>
                    <td className={`border border-gray-200 px-3 py-2 text-center text-lg ${todayStatusColorClass}`}>
                      {todayStatusIcon}
                    </td>
                    <td className="border border-gray-200 px-3 py-2">
                      <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <div aria-hidden="true" />
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleLogHabit(habit, "yes", multiplierValue)}
                            className={`rounded-md border border-transparent px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                              yesIsActive
                                ? "bg-emerald-200 text-emerald-800 ring-1 ring-inset ring-emerald-400/80"
                                : "bg-emerald-100 text-emerald-700 ring-1 ring-inset ring-emerald-300/80 hover:bg-emerald-200"
                            }`}
                          >
                            ✅ Sí
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleLogHabit(habit, "no", multiplierValue)}
                            className={`rounded-md border border-transparent px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                              noIsActive
                                ? "bg-red-200 text-red-800 ring-1 ring-inset ring-red-400/80"
                                : "bg-red-100 text-red-700 ring-1 ring-inset ring-red-300/80 hover:bg-red-200"
                            }`}
                          >
                            ❌ No
                          </button>
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => handleLogHabit(habit, "null")}
                            className={`rounded-md border border-transparent px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                              nullIsActive
                                ? "bg-slate-600 text-slate-100 ring-1 ring-inset ring-slate-400/90"
                                : "bg-slate-700 text-slate-100 ring-1 ring-inset ring-slate-500/90 hover:bg-slate-600"
                            }`}
                          >
                            ➖ Null
                          </button>
                        </div>

                        <div className="ml-auto flex items-center gap-2 justify-self-end">
                          <div className="flex items-center gap-2 rounded-lg border border-blue-500/60 bg-gradient-to-r from-blue-950 to-blue-900 px-3 py-1.5 shadow-[0_0_0_1px_rgba(59,130,246,0.15)]">
                          <span className="text-xs font-bold text-blue-100">x</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            disabled={isPending}
                            value={habitMultipliers[habit.id] ?? "1"}
                            onChange={(event) =>
                              handleMultiplierChange(
                                habit.id,
                                event.target.value.replace(/[^0-9]/g, "")
                              )
                            }
                            onBlur={() => {
                              const normalized = String(getMultiplierValue(habit.id));
                              setHabitMultipliers((prev) => ({ ...prev, [habit.id]: normalized }));
                            }}
                            className="w-14 rounded-md border border-blue-400/40 bg-blue-800/60 px-2 py-1 text-center text-xs font-semibold text-blue-100 outline-none ring-0 focus:border-blue-300"
                            aria-label={`Multiplicador para ${habit.name}`}
                          />
                          </div>
                          <div className="flex flex-col gap-1">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => incrementMultiplier(habit.id)}
                              className="h-4 w-4 rounded-sm bg-green-600/90 text-[10px] leading-none text-white transition hover:bg-green-500 disabled:opacity-50"
                              aria-label={`Subir multiplicador de ${habit.name}`}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => decrementMultiplier(habit.id)}
                              className="h-4 w-4 rounded-sm bg-red-600/90 text-[10px] leading-none text-white transition hover:bg-red-500 disabled:opacity-50"
                              aria-label={`Bajar multiplicador de ${habit.name}`}
                            >
                              ▼
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={5} className="border border-gray-200 px-3 py-6 text-center">
                  No active habits found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
