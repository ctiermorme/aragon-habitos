"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, makeId, getCurrentTimestamp, getTodayString } from "../../lib/db";

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function SpendPointsForm() {
  const [selectedProvince, setSelectedProvince] = useState<string>("");
  const [selectedMunicipalityId, setSelectedMunicipalityId] = useState<string>("");
  const [amountToSpend, setAmountToSpend] = useState<string>("1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Get current balance from ledger
  const ledgerEntries = useLiveQuery(async () => db.ledger.toArray(), [], []);

  const balance = useMemo(() => {
    const earnings = ledgerEntries
      .filter((e) => e.type === "EARN" || e.type === "debt_repay_population")
      .reduce((sum, e) => sum + e.amount, 0);
    const spendings = ledgerEntries
      .filter((e) => e.type === "SPEND")
      .reduce((sum, e) => sum + e.amount, 0);
    return earnings - spendings;
  }, [ledgerEntries]);

  // Get all municipalities ordered by name (excluding RESTO entries)
  const municipalities = useLiveQuery(
    async () => {
      const items = await db.municipalities.orderBy("name").toArray();
      return items.filter((m) => !m.name.startsWith("__RESTO__"));
    },
    [],
    []
  );

  // Get population transactions for selected municipality
  const populationTransactions = useLiveQuery(
    async () => {
      if (!selectedMunicipalityId) {
        return [];
      }
      return db.populationTransactions
        .where("municipalityId")
        .equals(selectedMunicipalityId)
        .toArray();
    },
    [selectedMunicipalityId],
    []
  );

  // Get selected municipality details
  const selectedMunicipality = municipalities.find((m) => m.id === selectedMunicipalityId);

  // Filter municipalities by selected province
  const filteredMunicipalities = useMemo(() => {
    if (!selectedProvince) {
      return [];
    }
    return municipalities.filter((m) => normalizeName(m.province) === normalizeName(selectedProvince));
  }, [municipalities, selectedProvince]);

  // Compute population
  const extraPopulation = useMemo(() => {
    const total = populationTransactions.reduce((sum, tx) => sum + tx.amount, 0);
    return Math.max(0, total);
  }, [populationTransactions]);

  const totalPopulation = useMemo(() => {
    if (!selectedMunicipality) {
      return 0;
    }
    return selectedMunicipality.basePopulation + extraPopulation;
  }, [selectedMunicipality, extraPopulation]);

  // Validation
  const amount = parseInt(amountToSpend, 10) || 0;
  const isValid =
    selectedMunicipalityId !== "" &&
    amount > 0 &&
    amount <= balance &&
    balance >= 0;

  const handleProvinceChange = (province: string) => {
    setSelectedProvince(province);
    setSelectedMunicipalityId(""); // Reset municipality when province changes
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || !selectedMunicipalityId) {
      setErrorMessage("Invalid input");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const now = getCurrentTimestamp();
      const today = getTodayString();

      await db.transaction("rw", db.populationTransactions, db.ledger, async () => {
        // Insert population transaction
        await db.populationTransactions.add({
          id: makeId(),
          municipalityId: selectedMunicipalityId,
          date: today,
          amount: amount,
          reason: "Manual spend",
          createdAt: now,
        });

        // Insert ledger entry
        await db.ledger.add({
          id: makeId(),
          date: today,
          type: "SPEND",
          amount: amount,
          description: "Spent on municipality population",
          createdAt: now,
        });
      });

      // Reset amount but keep municipality selected
      setAmountToSpend("1");
    } catch (error) {
      console.error("Failed to spend points:", error);
      setErrorMessage("Failed to spend points");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      {/* Saldo destacado */}
      <div className={`mb-5 rounded-lg p-5 text-center ${balance < 0 ? "bg-gradient-to-r from-red-50 to-red-100" : "bg-gradient-to-r from-blue-50 to-blue-100"}`}>
        <div className="mb-1 text-sm font-semibold uppercase tracking-wider text-gray-600">Saldo actual</div>
        <div className={`text-6xl font-black ${balance < 0 ? "text-red-600" : "text-blue-600"}`}>
          {balance}
        </div>
        {balance < 0 && (
          <div className="mt-2 text-sm font-medium text-red-700">
            ⚠️ Saldo negativo: no puedes aumentar población
          </div>
        )}
      </div>

      <h2 className="mb-4 text-2xl font-bold text-black">Gastar puntos</h2>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {errorMessage && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Province selection */}
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Provincia
          </label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleProvinceChange("Zaragoza")}
              className={`rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${
                selectedProvince === "Zaragoza"
                  ? "border-blue-500 bg-blue-500 text-white shadow-md"
                  : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100"
              }`}
            >
              Zaragoza
            </button>
            <button
              type="button"
              onClick={() => handleProvinceChange("Huesca")}
              className={`rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${
                selectedProvince === "Huesca"
                  ? "border-blue-500 bg-blue-500 text-white shadow-md"
                  : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100"
              }`}
            >
              Huesca
            </button>
            <button
              type="button"
              onClick={() => handleProvinceChange("Teruel")}
              className={`rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-all ${
                selectedProvince === "Teruel"
                  ? "border-blue-500 bg-blue-500 text-white shadow-md"
                  : "border-gray-200 bg-gray-50 text-gray-700 hover:border-gray-300 hover:bg-gray-100"
              }`}
            >
              Teruel
            </button>
          </div>
        </div>

        {/* Municipality and Amount in grid */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* Municipality selection */}
          <div className="md:col-span-2">
            <label htmlFor="municipality" className="mb-2 block text-sm font-medium text-gray-700">
              Municipio
            </label>
            <select
              id="municipality"
              value={selectedMunicipalityId}
              onChange={(e) => setSelectedMunicipalityId(e.target.value)}
              disabled={!selectedProvince}
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-black shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:bg-gray-100 disabled:text-gray-500"
            >
              <option value="">
                {selectedProvince ? "-- Selecciona un municipio --" : "-- Primero selecciona provincia --"}
              </option>
              {filteredMunicipalities.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount input */}
          <div>
            <label htmlFor="amount" className="mb-2 block text-sm font-medium text-gray-700">
              Puntos
            </label>
            <input
              id="amount"
              type="number"
              min="1"
              max={balance}
              value={amountToSpend}
              onChange={(e) => setAmountToSpend(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-black shadow-sm transition focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="w-full rounded-lg bg-green-600 px-4 py-3 text-base font-semibold text-white shadow-md transition hover:bg-green-700 hover:shadow-lg disabled:opacity-50 disabled:shadow-none disabled:hover:bg-green-600"
        >
          {isSubmitting ? "Procesando..." : "Aumentar población"}
        </button>
      </form>

      {/* Population display */}
      {selectedMunicipality && (
        <div className="rounded-lg border border-gray-200 bg-gradient-to-r from-gray-50 to-gray-100 p-3 text-sm">
          <div className="font-medium text-gray-700">
            📊 <strong className="text-gray-900">{selectedMunicipality.name}</strong>
          </div>
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-600">
            <div>
              <span className="text-gray-500">Base:</span> <span className="font-medium">{selectedMunicipality.basePopulation.toLocaleString("es-ES")}</span>
            </div>
            <div>
              <span className="text-gray-500">Extra:</span> <span className="font-medium text-green-600">+{extraPopulation.toLocaleString("es-ES")}</span>
            </div>
            <div>
              <span className="text-gray-500">Total:</span> <span className="font-semibold text-gray-900">{totalPopulation.toLocaleString("es-ES")}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
