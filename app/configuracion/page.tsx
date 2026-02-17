"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getCurrentTimestamp, makeId } from "../../lib/db";

type HabitFormState = {
  id?: string;
  name: string;
  description: string;
  pointsYes: string;
  pointsNo: string;
  active: boolean;
};

const emptyForm: HabitFormState = {
  name: "",
  description: "",
  pointsYes: "0",
  pointsNo: "0",
  active: true,
};

export default function ConfiguracionPage() {
  const habits = useLiveQuery(
    () => db.habits.orderBy("name").toArray(),
    [],
    []
  );

  const [showForm, setShowForm] = useState(false);
  const [formState, setFormState] = useState<HabitFormState>(emptyForm);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isEditing = useMemo(() => Boolean(formState.id), [formState.id]);

  const resetForm = () => {
    setFormState(emptyForm);
    setShowForm(false);
    setErrorMessage(null);
  };

  const handleAddClick = () => {
    setFormState(emptyForm);
    setShowForm(true);
    setErrorMessage(null);
  };

  const handleEditClick = (habit: {
    id: string;
    name: string;
    description?: string;
    pointsYes: number;
    pointsNo: number;
    active: boolean;
  }) => {
    setFormState({
      id: habit.id,
      name: habit.name,
      description: habit.description ?? "",
      pointsYes: habit.pointsYes.toString(),
      pointsNo: habit.pointsNo.toString(),
      active: habit.active,
    });
    setShowForm(true);
    setErrorMessage(null);
  };

  const handleDelete = async (habitId: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this habit and its logs?"
    );
    if (!confirmed) {
      return;
    }

    try {
      await db.transaction("rw", db.habits, db.habitLogs, async () => {
        await db.habitLogs.where("habitId").equals(habitId).delete();
        await db.habits.delete(habitId);
      });
    } catch (error) {
      console.error("Failed to delete habit.", error);
      setErrorMessage("Failed to delete habit.");
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);

    const trimmedName = formState.name.trim();
    if (!trimmedName) {
      setErrorMessage("Name is required.");
      return;
    }

    const pointsYes = Number(formState.pointsYes);
    const pointsNo = Number(formState.pointsNo);

    if (!Number.isFinite(pointsYes) || !Number.isFinite(pointsNo)) {
      setErrorMessage("Points must be valid numbers.");
      return;
    }

    const now = getCurrentTimestamp();

    try {
      if (formState.id) {
        await db.habits.update(formState.id, {
          name: trimmedName,
          description: formState.description.trim() || undefined,
          pointsYes,
          pointsNo,
          active: formState.active,
          updatedAt: now,
        });
      } else {
        await db.habits.add({
          id: makeId(),
          name: trimmedName,
          description: formState.description.trim() || undefined,
          pointsYes,
          pointsNo,
          active: formState.active,
          createdAt: now,
          updatedAt: now,
        });
      }

      resetForm();
    } catch (error) {
      console.error("Failed to save habit.", error);
      setErrorMessage("Failed to save habit. Ensure the name is unique.");
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Configuración</h1>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-2xl font-semibold">Habits</h2>
          <button
            type="button"
            onClick={handleAddClick}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Add habit
          </button>
        </div>

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mt-6 grid gap-4 rounded border border-gray-200 p-4"
          >
            <div className="grid gap-2">
              <label className="text-sm font-semibold">Name</label>
              <input
                type="text"
                value={formState.name}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                required
                className="rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-semibold">Description</label>
              <textarea
                value={formState.description}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    description: event.target.value,
                  }))
                }
                className="rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <label className="text-sm font-semibold">Points Yes</label>
                <input
                  type="number"
                  value={formState.pointsYes}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      pointsYes: event.target.value,
                    }))
                  }
                  className="rounded border border-gray-300 px-3 py-2"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold">Points No</label>
                <input
                  type="number"
                  value={formState.pointsNo}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      pointsNo: event.target.value,
                    }))
                  }
                  className="rounded border border-gray-300 px-3 py-2"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={formState.active}
                onChange={(event) =>
                  setFormState((prev) => ({
                    ...prev,
                    active: event.target.checked,
                  }))
                }
              />
              Active
            </label>

            {errorMessage && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {isEditing ? "Save changes" : "Create habit"}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded border border-gray-300 px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full border-collapse border border-gray-200 text-sm">
            <thead className="bg-gray-100">
              <tr>
                <th className="border border-gray-200 px-3 py-2 text-left">Name</th>
                <th className="border border-gray-200 px-3 py-2 text-left">
                  Points Yes
                </th>
                <th className="border border-gray-200 px-3 py-2 text-left">
                  Points No
                </th>
                <th className="border border-gray-200 px-3 py-2 text-left">
                  Active
                </th>
                <th className="border border-gray-200 px-3 py-2 text-left">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {habits?.length ? (
                habits.map((habit) => (
                  <tr key={habit.id}>
                    <td className="border border-gray-200 px-3 py-2">
                      {habit.name}
                    </td>
                    <td className="border border-gray-200 px-3 py-2">
                      {habit.pointsYes}
                    </td>
                    <td className="border border-gray-200 px-3 py-2">
                      {habit.pointsNo}
                    </td>
                    <td className="border border-gray-200 px-3 py-2">
                      {habit.active ? "Yes" : "No"}
                    </td>
                    <td className="border border-gray-200 px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleEditClick(habit)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(habit.id)}
                          className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="border border-gray-200 px-3 py-6 text-center"
                  >
                    No habits yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
