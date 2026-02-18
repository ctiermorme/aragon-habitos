"use client";

import { useEffect } from "react";
import { db, makeId, getCurrentTimestamp, getTodayString } from "../../lib/db";

/**
 * RolloverInitializer: Runs ONCE per day to handle negative point balance.
 *
 * Rules:
 * - If balance < 0, compute extra population per municipality and greedily reduce it.
 * - 1 point == 1 inhabitant
 * - Insert populationTransactions and ledger entries to record the repayment.
 * - Store last rollover date in localStorage to avoid running multiple times per day.
 */
export default function RolloverInitializer() {
  useEffect(() => {
    const runRollover = async () => {
      try {
        const today = getTodayString();
        const lastRolloverDate = localStorage.getItem("aragonhabitos:lastRolloverDate");

        // Only run once per day
        if (lastRolloverDate === today) {
          console.log("[rollover] Already ran today, skipping.");
          return;
        }

        console.log("[rollover] Starting daily rollover check...");

        // === Step 1: Compute total balance from ledger ===
        const ledgerEntries = await db.ledger.toArray();
        const earnings = ledgerEntries
          .filter((e) => e.type === "EARN")
          .reduce((sum, e) => sum + e.amount, 0);
        const spendings = ledgerEntries
          .filter((e) => e.type === "SPEND")
          .reduce((sum, e) => sum + e.amount, 0);
        const balance = earnings - spendings;

        console.log(`[rollover] Balance: ${balance} (earnings: ${earnings}, spendings: ${spendings})`);

        // === Step 2: If balance is negative, initiate debt repayment ===
        if (balance < 0) {
          const debt = Math.abs(balance);
          console.log(`[rollover] Negative balance detected. Debt: ${debt}`);

          // === Step 3: Compute extra population per municipality ===
          const municipalities = await db.municipalities.toArray();
          const extra = new Map<string, number>();

          for (const municipality of municipalities) {
            const transactions = await db.populationTransactions
              .where("municipalityId")
              .equals(municipality.id)
              .toArray();

            const totalAdjustment = transactions.reduce((sum, tx) => sum + tx.amount, 0);
            const extraPopulation = Math.max(0, totalAdjustment);

            extra.set(municipality.id, extraPopulation);
            console.log(
              `[rollover] Municipality "${municipality.name}": extra = ${extraPopulation}`
            );
          }

          // === Step 4: Greedy repayment loop ===
          let remainingDebt = debt;
          const now = getCurrentTimestamp();

          while (remainingDebt > 0) {
            // Find municipality with max extra population
            let maxMunicipality: string | null = null;
            let maxExtra = 0;

            for (const [muniId, extraPop] of extra.entries()) {
              if (extraPop > maxExtra) {
                maxExtra = extraPop;
                maxMunicipality = muniId;
              }
            }

            // No more extra population available
            if (maxMunicipality === null || maxExtra === 0) {
              console.log(
                `[rollover] No more extra population available. Remaining debt: ${remainingDebt}`
              );
              break;
            }

            // Repay from this municipality
            const repayAmount = Math.min(remainingDebt, maxExtra);
            const municipality = municipalities.find((m) => m.id === maxMunicipality);

            console.log(
              `[rollover] Repaying ${repayAmount} from "${municipality?.name}" (max extra: ${maxExtra})`
            );

            // Insert population transaction
            await db.populationTransactions.add({
              id: makeId(),
              municipalityId: maxMunicipality,
              date: today,
              amount: -repayAmount,
              reason: "Debt repayment",
              createdAt: now,
            });

            // Insert ledger entry
            await db.ledger.add({
              id: makeId(),
              type: "EARN",
              amount: repayAmount,
              date: today,
              description: "Debt repaid by reducing population",
              createdAt: now,
            });

            // Update state
            extra.set(maxMunicipality, maxExtra - repayAmount);
            remainingDebt -= repayAmount;
          }

          console.log(`[rollover] Debt repayment complete. Remaining debt: ${remainingDebt}`);
        } else {
          console.log("[rollover] Balance is positive, no repayment needed.");
        }

        // === Step 5: Mark rollover as complete for today ===
        localStorage.setItem("aragonhabitos:lastRolloverDate", today);
        console.log(`[rollover] Rollover complete for ${today}`);
      } catch (error) {
        console.error("[rollover] Error during rollover:", error);
      }
    };

    runRollover();
  }, []);

  return null; // This component doesn't render anything
}
