"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  db,
  getCurrentTimestamp,
  getTodayString,
  Habit,
  HabitLog,
  makeId,
} from "../../lib/db";

export default function HabitosPage() {
  const [pendingHabitId, setPendingHabitId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const handleLogHabit = async (
    habit: Habit,
    status: "yes" | "no" | "null"
  ) => {
    const now = getCurrentTimestamp();
    const pointsEarned =
      status === "yes" ? habit.pointsYes : status === "no" ? habit.pointsNo : 0;

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
              <th className="border border-gray-200 px-3 py-2 text-center text-black">Points Yes</th>
              <th className="border border-gray-200 px-3 py-2 text-center text-black">Points No</th>
              <th className="border border-gray-200 px-3 py-2 text-center text-black">Hoy</th>
              <th className="border border-gray-200 px-3 py-2 text-center text-black">Actions</th>
            </tr>
          </thead>
          <tbody>
            {habits?.length ? (
              habits.map((habit) => {
                const todayStatus = logsByHabitId.get(habit.id)?.status ?? "null";
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
                    <td className="border border-gray-200 px-3 py-2 text-center">
                      <div className="flex flex-wrap justify-center gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleLogHabit(habit, "yes")}
                          className={`rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50 ${
                            yesIsActive
                              ? "border-green-700 bg-green-700 text-white"
                              : "border-green-300 bg-green-50 text-green-700"
                          }`}
                        >
                          ✅ Yes
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleLogHabit(habit, "no")}
                          className={`rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50 ${
                            noIsActive
                              ? "border-red-700 bg-red-700 text-white"
                              : "border-red-300 bg-red-50 text-red-700"
                          }`}
                        >
                          ❌ No
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleLogHabit(habit, "null")}
                          className={`rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50 ${
                            nullIsActive
                              ? "border-gray-700 bg-gray-700 text-white"
                              : "border-gray-300 bg-gray-50 text-gray-700"
                          }`}
                        >
                          ➖ Null
                        </button>
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
