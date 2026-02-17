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

type HabitLogWithPoints = HabitLog & {
  pointsEarned?: number;
};

export default function HabitosPage() {
  const [pendingHabitId, setPendingHabitId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const today = getTodayString();

  const habits = useLiveQuery(async () => {
    const allHabits = await db.habits.orderBy("name").toArray();
    return allHabits.filter((habit) => habit.active);
  }, []);

  const todayLogs = useLiveQuery(
    async () => (await db.habitLogs.where("date").equals(today).toArray()) as HabitLogWithPoints[],
    [today],
    []
  );

  const logsByHabitId = useMemo(() => {
    const map = new Map<string, HabitLogWithPoints>();
    for (const log of todayLogs) {
      map.set(log.habitId, log);
    }
    return map;
  }, [todayLogs]);

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
        const existingLog = (await db.habitLogs
          .where("[date+habitId]")
          .equals([today, habit.id])
          .first()) as HabitLogWithPoints | undefined;

        if (existingLog) {
          await db.habitLogs.update(existingLog.id, {
            status,
            pointsEarned,
            updatedAt: now,
          } as Partial<HabitLogWithPoints>);
        } else {
          await db.habitLogs.add({
            id: makeId(),
            date: today,
            habitId: habit.id,
            status,
            pointsEarned,
            createdAt: now,
            updatedAt: now,
          } as HabitLogWithPoints);
        }

        const todaysLogs = (await db.habitLogs
          .where("date")
          .equals(today)
          .toArray()) as HabitLogWithPoints[];

        const totalPoints = todaysLogs.reduce(
          (accumulator, log) => accumulator + (log.pointsEarned ?? 0),
          0
        );
        const habitsCompleted = todaysLogs.filter((log) => log.status === "yes").length;
        const habitsLogged = todaysLogs.length;

        await db.dailySummaries.put({
          date: today,
          totalPoints,
          habitsCompleted,
          habitsLogged,
          updatedAt: now,
        });

        await db.ledger.add({
          id: makeId(),
          type: "EARN",
          amount: pointsEarned,
          description: `Habit: ${habit.name}`,
          date: today,
          createdAt: now,
        });
      });
    } catch (error) {
      console.error("Failed to store habit log.", error);
      setErrorMessage("Failed to store habit log.");
    } finally {
      setPendingHabitId(null);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Hábitos</h1>

      <p className="mt-2 text-sm text-gray-600">Fecha de hoy: {today}</p>

      {errorMessage && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-200 text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="border border-gray-200 px-3 py-2 text-left">Name</th>
              <th className="border border-gray-200 px-3 py-2 text-left">Points Yes</th>
              <th className="border border-gray-200 px-3 py-2 text-left">Points No</th>
              <th className="border border-gray-200 px-3 py-2 text-left">Today</th>
              <th className="border border-gray-200 px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {habits?.length ? (
              habits.map((habit) => {
                const todayStatus = logsByHabitId.get(habit.id)?.status ?? "-";
                const isPending = pendingHabitId === habit.id;

                return (
                  <tr key={habit.id}>
                    <td className="border border-gray-200 px-3 py-2">{habit.name}</td>
                    <td className="border border-gray-200 px-3 py-2">{habit.pointsYes}</td>
                    <td className="border border-gray-200 px-3 py-2">{habit.pointsNo}</td>
                    <td className="border border-gray-200 px-3 py-2">{todayStatus}</td>
                    <td className="border border-gray-200 px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleLogHabit(habit, "yes")}
                          className="rounded border border-green-300 bg-green-50 px-2 py-1 text-xs font-semibold text-green-700 disabled:opacity-50"
                        >
                          ✅ Yes
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleLogHabit(habit, "no")}
                          className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-50"
                        >
                          ❌ No
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleLogHabit(habit, "null")}
                          className="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-xs font-semibold text-gray-700 disabled:opacity-50"
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
