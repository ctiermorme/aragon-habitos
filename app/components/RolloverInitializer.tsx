"use client";

import { useEffect } from "react";
import { getTodayString } from "../../lib/db";
import { applyDebtIfNeeded } from "../../lib/debt";

/**
 * RolloverInitializer: Runs once per day and applies the debt rule if needed.
 */
export default function RolloverInitializer() {
  useEffect(() => {
    const runRollover = async () => {
      try {
        const today = getTodayString();
        console.log("[rollover] Starting daily rollover check...");

        await applyDebtIfNeeded(today);

        console.log(`[rollover] Rollover complete for ${today}`);
      } catch (error) {
        console.error("[rollover] Error during rollover:", error);
      }
    };

    runRollover();
  }, []);

  return null;
}
