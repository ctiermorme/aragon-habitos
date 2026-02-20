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

type MunicipalityFormState = {
  id?: string;
  name: string;
  province: string;
  basePopulation: string;
  latitude: string;
  longitude: string;
};

const emptyForm: HabitFormState = {
  name: "",
  description: "",
  pointsYes: "0",
  pointsNo: "0",
  active: true,
};

const emptyMunicipalityForm: MunicipalityFormState = {
  name: "",
  province: "",
  basePopulation: "0",
  latitude: "",
  longitude: "",
};

export default function ConfiguracionPage() {
  const habits = useLiveQuery(
    () => db.habits.orderBy("name").toArray(),
    [],
    []
  );

  const municipalities = useLiveQuery(
    async () => {
      const items = await db.municipalities.orderBy("name").toArray();
      return items.filter((municipality) => !municipality.name.startsWith("__RESTO__"));
    },
    [],
    []
  );

  const [showHabitForm, setShowHabitForm] = useState(false);
  const [habitFormState, setHabitFormState] = useState<HabitFormState>(emptyForm);
  const [habitErrorMessage, setHabitErrorMessage] = useState<string | null>(null);

  const [showMunicipalityForm, setShowMunicipalityForm] = useState(false);
  const [municipalityFormState, setMunicipalityFormState] =
    useState<MunicipalityFormState>(emptyMunicipalityForm);
  const [municipalityErrorMessage, setMunicipalityErrorMessage] = useState<string | null>(null);

  const isEditingHabit = useMemo(() => Boolean(habitFormState.id), [habitFormState.id]);
  const isEditingMunicipality = useMemo(
    () => Boolean(municipalityFormState.id),
    [municipalityFormState.id]
  );

  const resetHabitForm = () => {
    setHabitFormState(emptyForm);
    setShowHabitForm(false);
    setHabitErrorMessage(null);
  };

  const resetMunicipalityForm = () => {
    setMunicipalityFormState(emptyMunicipalityForm);
    setShowMunicipalityForm(false);
    setMunicipalityErrorMessage(null);
  };

  const handleAddHabitClick = () => {
    setHabitFormState(emptyForm);
    setShowHabitForm(true);
    setHabitErrorMessage(null);
  };

  const handleEditHabitClick = (habit: {
    id: string;
    name: string;
    description?: string;
    pointsYes: number;
    pointsNo: number;
    active: boolean;
  }) => {
    setHabitFormState({
      id: habit.id,
      name: habit.name,
      description: habit.description ?? "",
      pointsYes: habit.pointsYes.toString(),
      pointsNo: habit.pointsNo.toString(),
      active: habit.active,
    });
    setShowHabitForm(true);
    setHabitErrorMessage(null);
  };

  const handleDeleteHabit = async (habitId: string) => {
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
      setHabitErrorMessage("Failed to delete habit.");
    }
  };

  const handleHabitSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setHabitErrorMessage(null);

    const trimmedName = habitFormState.name.trim();
    if (!trimmedName) {
      setHabitErrorMessage("Name is required.");
      return;
    }

    const pointsYes = Number(habitFormState.pointsYes);
    const pointsNo = Number(habitFormState.pointsNo);

    if (!Number.isFinite(pointsYes) || !Number.isFinite(pointsNo)) {
      setHabitErrorMessage("Points must be valid numbers.");
      return;
    }

    const now = getCurrentTimestamp();

    try {
      if (habitFormState.id) {
        await db.habits.update(habitFormState.id, {
          name: trimmedName,
          description: habitFormState.description.trim() || undefined,
          pointsYes,
          pointsNo,
          active: habitFormState.active,
          updatedAt: now,
        });
      } else {
        await db.habits.add({
          id: makeId(),
          name: trimmedName,
          description: habitFormState.description.trim() || undefined,
          pointsYes,
          pointsNo,
          active: habitFormState.active,
          createdAt: now,
          updatedAt: now,
        });
      }

      resetHabitForm();
    } catch (error) {
      console.error("Failed to save habit.", error);
      setHabitErrorMessage("Failed to save habit. Ensure the name is unique.");
    }
  };

  const handleAddMunicipalityClick = () => {
    setMunicipalityFormState(emptyMunicipalityForm);
    setShowMunicipalityForm(true);
    setMunicipalityErrorMessage(null);
  };

  const handleEditMunicipalityClick = (municipality: {
    id: string;
    name: string;
    province: string;
    basePopulation: number;
    latitude: number;
    longitude: number;
  }) => {
    setMunicipalityFormState({
      id: municipality.id,
      name: municipality.name,
      province: municipality.province,
      basePopulation: municipality.basePopulation.toString(),
      latitude: municipality.latitude.toString(),
      longitude: municipality.longitude.toString(),
    });
    setShowMunicipalityForm(true);
    setMunicipalityErrorMessage(null);
  };

  const handleDeleteMunicipality = async (municipalityId: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this municipality and its population history?"
    );
    if (!confirmed) {
      return;
    }

    try {
      await db.transaction(
        "rw",
        db.municipalities,
        db.populationTransactions,
        async () => {
          await db.populationTransactions
            .where("municipalityId")
            .equals(municipalityId)
            .delete();
          await db.municipalities.delete(municipalityId);
        }
      );
    } catch (error) {
      console.error("Failed to delete municipality.", error);
      setMunicipalityErrorMessage("Failed to delete municipality.");
    }
  };

  const handleMunicipalitySubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setMunicipalityErrorMessage(null);

    const trimmedName = municipalityFormState.name.trim();
    const trimmedProvince = municipalityFormState.province.trim();
    if (!trimmedName || !trimmedProvince) {
      setMunicipalityErrorMessage("Name and province are required.");
      return;
    }

    const basePopulation = Number(municipalityFormState.basePopulation);
    const latitude = Number(municipalityFormState.latitude);
    const longitude = Number(municipalityFormState.longitude);

    if (
      !Number.isFinite(basePopulation) ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      setMunicipalityErrorMessage("Population and coordinates must be valid numbers.");
      return;
    }

    const now = getCurrentTimestamp();

    try {
      if (municipalityFormState.id) {
        await db.municipalities.update(municipalityFormState.id, {
          name: trimmedName,
          province: trimmedProvince,
          basePopulation,
          latitude,
          longitude,
        });
      } else {
        await db.municipalities.add({
          id: makeId(),
          name: trimmedName,
          province: trimmedProvince,
          basePopulation,
          latitude,
          longitude,
          createdAt: now,
        });
      }

      resetMunicipalityForm();
    } catch (error) {
      console.error("Failed to save municipality.", error);
      setMunicipalityErrorMessage("Failed to save municipality. Ensure the name is unique.");
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">Configuración</h1>

      <section className="mt-8">
        <details className="rounded border border-gray-200" open>
          <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-2xl font-semibold">
            <span>Hábitos</span>
            <span className="text-base font-semibold text-white">Desplegar ▾</span>
          </summary>
          <div className="px-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Gestión de hábitos</h2>
              <button
                type="button"
                onClick={handleAddHabitClick}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Add habit
              </button>
            </div>

        {showHabitForm && (
          <form
            onSubmit={handleHabitSubmit}
            className="mt-6 grid gap-4 rounded border border-gray-200 p-4"
          >
            <div className="grid gap-2">
              <label className="text-sm font-semibold">Name</label>
              <input
                type="text"
                value={habitFormState.name}
                onChange={(event) =>
                  setHabitFormState((prev) => ({
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
                value={habitFormState.description}
                onChange={(event) =>
                  setHabitFormState((prev) => ({
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
                  value={habitFormState.pointsYes}
                  onChange={(event) =>
                    setHabitFormState((prev) => ({
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
                  value={habitFormState.pointsNo}
                  onChange={(event) =>
                    setHabitFormState((prev) => ({
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
                checked={habitFormState.active}
                onChange={(event) =>
                  setHabitFormState((prev) => ({
                    ...prev,
                    active: event.target.checked,
                  }))
                }
              />
              Active
            </label>

            {habitErrorMessage && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {habitErrorMessage}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {isEditingHabit ? "Save changes" : "Create habit"}
              </button>
              <button
                type="button"
                onClick={resetHabitForm}
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
                    <th className="border border-gray-200 px-3 py-2 text-center text-black">Nombre</th>
                    <th className="border border-gray-200 px-3 py-2 text-center text-black">
                      Puntos Sí
                    </th>
                    <th className="border border-gray-200 px-3 py-2 text-center text-black">
                      Puntos No
                    </th>
                    <th className="border border-gray-200 px-3 py-2 text-center text-black">
                      Activo
                    </th>
                    <th className="border border-gray-200 px-3 py-2 text-center text-black">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {habits?.length ? (
                    habits.map((habit) => (
                      <tr key={habit.id}>
                        <td className="border border-gray-200 px-3 py-2 text-center text-lg font-bold">
                          {habit.name}
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-center">
                          {habit.pointsYes}
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-center">
                          {habit.pointsNo}
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-center">
                          {habit.active ? "Yes" : "No"}
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-center">
                          <div className="flex flex-wrap justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditHabitClick(habit)}
                              className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteHabit(habit.id)}
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
          </div>
        </details>
      </section>

      <section className="mt-10">
        <details className="rounded border border-gray-200" open>
          <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-2xl font-semibold">
            <span>Municipios</span>
            <span className="text-base font-semibold text-white">Desplegar ▾</span>
          </summary>
          <div className="px-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-semibold">Gestión de municipios</h2>
              <button
                type="button"
                onClick={handleAddMunicipalityClick}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Añadir municipio
              </button>
            </div>

        {showMunicipalityForm && (
          <form
            onSubmit={handleMunicipalitySubmit}
            className="mt-6 grid gap-4 rounded border border-gray-200 p-4"
          >
            <div className="grid gap-2">
              <label className="text-sm font-semibold">Name</label>
              <input
                type="text"
                value={municipalityFormState.name}
                onChange={(event) =>
                  setMunicipalityFormState((prev) => ({
                    ...prev,
                    name: event.target.value,
                  }))
                }
                required
                className="rounded border border-gray-300 px-3 py-2"
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm font-semibold">Province</label>
              <select
                value={municipalityFormState.province}
                onChange={(event) =>
                  setMunicipalityFormState((prev) => ({
                    ...prev,
                    province: event.target.value,
                  }))
                }
                required
                className="rounded border border-gray-300 px-3 py-2 text-black"
              >
                <option value="">-- Selecciona una provincia --</option>
                <option value="Zaragoza">Zaragoza</option>
                <option value="Huesca">Huesca</option>
                <option value="Teruel">Teruel</option>
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <label className="text-sm font-semibold">Base Population</label>
                <input
                  type="number"
                  min="0"
                  value={municipalityFormState.basePopulation}
                  onChange={(event) =>
                    setMunicipalityFormState((prev) => ({
                      ...prev,
                      basePopulation: event.target.value,
                    }))
                  }
                  className="rounded border border-gray-300 px-3 py-2"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={municipalityFormState.latitude}
                  onChange={(event) =>
                    setMunicipalityFormState((prev) => ({
                      ...prev,
                      latitude: event.target.value,
                    }))
                  }
                  className="rounded border border-gray-300 px-3 py-2"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-sm font-semibold">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={municipalityFormState.longitude}
                  onChange={(event) =>
                    setMunicipalityFormState((prev) => ({
                      ...prev,
                      longitude: event.target.value,
                    }))
                  }
                  className="rounded border border-gray-300 px-3 py-2"
                />
              </div>
            </div>

            {municipalityErrorMessage && (
              <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {municipalityErrorMessage}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="submit"
                className="rounded bg-green-600 px-4 py-2 text-sm font-semibold text-white"
              >
                {isEditingMunicipality ? "Save changes" : "Create municipality"}
              </button>
              <button
                type="button"
                onClick={resetMunicipalityForm}
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
                    <th className="border border-gray-200 px-3 py-2 text-center text-black">Nombre</th>
                    <th className="border border-gray-200 px-3 py-2 text-center text-black">Provincia</th>
                    <th className="border border-gray-200 px-3 py-2 text-center text-black">
                      Poblacion base
                    </th>
                    <th className="border border-gray-200 px-3 py-2 text-center text-black">Latitud</th>
                    <th className="border border-gray-200 px-3 py-2 text-center text-black">Longitud</th>
                    <th className="border border-gray-200 px-3 py-2 text-center text-black">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {municipalities?.length ? (
                    municipalities.map((municipality) => (
                      <tr key={municipality.id}>
                        <td className="border border-gray-200 px-3 py-2 text-center text-lg font-bold">
                          {municipality.name}
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-center">
                          {municipality.province}
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-center">
                          {municipality.basePopulation}
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-center">
                          {municipality.latitude}
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-center">
                          {municipality.longitude}
                        </td>
                        <td className="border border-gray-200 px-3 py-2 text-center">
                          <div className="flex flex-wrap justify-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditMunicipalityClick(municipality)}
                              className="rounded border border-gray-300 px-2 py-1 text-xs font-semibold"
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteMunicipality(municipality.id)}
                              className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-700"
                            >
                              Eliminar
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={6}
                        className="border border-gray-200 px-3 py-6 text-center"
                      >
                        No municipalities yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}
