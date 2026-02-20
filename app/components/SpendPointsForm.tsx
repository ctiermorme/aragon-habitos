"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, makeId, getCurrentTimestamp, getTodayString } from "../../lib/db";

export default function SpendPointsForm() {
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
    <div className="space-y-4 rounded border border-gray-200 bg-white p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold">Saldo y Gastar puntos</h2>
        </div>
      </div>

      {/* Saldo actual card */}
      <div className="rounded border border-gray-200 bg-blue-50 p-4">
        <div className="text-sm font-semibold text-gray-600">Saldo actual</div>
        <div className={`mt-2 text-4xl font-bold ${balance < 0 ? "text-red-600" : "text-blue-600"}`}>
          {balance}
        </div>
        {balance < 0 && (
          <div className="mt-2 text-xs text-red-700">
            Saldo negativo: no puedes aumentar población hasta volver a &ge; 0
          </div>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-3">
        {errorMessage && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Municipality dropdown */}
        <div>
          <label htmlFor="municipality" className="block text-sm font-medium text-gray-700">
            Municipio
          </label>
          <select
            id="municipality"
            value={selectedMunicipalityId}
            onChange={(e) => setSelectedMunicipalityId(e.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="">-- Selecciona un municipio --</option>
            {municipalities.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        {/* Amount input */}
        <div>
          <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
            Puntos a gastar (mín. 1)
          </label>
          <input
            id="amount"
            type="number"
            min="1"
            max={balance}
            value={amountToSpend}
            onChange={(e) => setAmountToSpend(e.target.value)}
            className="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
            disabled={isSubmitting}
          />
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={!isValid || isSubmitting}
          className="w-full rounded border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 disabled:opacity-50"
        >
          {isSubmitting ? "Procesando..." : "Aumentar población"}
        </button>
      </form>

      {/* Population display */}
      {selectedMunicipality && (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
          <div className="text-gray-600">
            Población actual del municipio <strong>{selectedMunicipality.name}</strong>:
          </div>
          <div className="mt-1 space-y-1 text-xs text-gray-600">
            <div>Base: {selectedMunicipality.basePopulation}</div>
            <div>Extra: {extraPopulation}</div>
            <div className="font-semibold text-gray-800">Total: {totalPopulation}</div>
          </div>
        </div>
      )}
    </div>
  );
}
