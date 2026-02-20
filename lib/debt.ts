import { db, getCurrentTimestamp, makeId } from "./db";

const DEBT_SINCE_KEY = "debtSinceDate";
const DEBT_LAST_APPLIED_KEY = "debtLastAppliedDate";

async function getAppStateValue(key: string): Promise<string | null> {
  const row = await db.appState.get(key);
  return row?.value ?? null;
}

async function setAppStateValue(key: string, value: string): Promise<void> {
  await db.appState.put({ key, value });
}

export async function getBalance(): Promise<number> {
  const entries = await db.ledger.toArray();

  return entries.reduce((sum, entry) => {
    if (entry.type === "SPEND") {
      return sum - entry.amount;
    }
    return sum + entry.amount;
  }, 0);
}

export async function getDebtSinceDate(): Promise<string | null> {
  return getAppStateValue(DEBT_SINCE_KEY);
}

export async function setDebtSinceDate(date: string): Promise<void> {
  await setAppStateValue(DEBT_SINCE_KEY, date);
}

export async function clearDebtSinceDate(): Promise<void> {
  await db.appState.delete(DEBT_SINCE_KEY);
}

export async function getDebtLastAppliedDate(): Promise<string | null> {
  return getAppStateValue(DEBT_LAST_APPLIED_KEY);
}

export async function setDebtLastAppliedDate(date: string): Promise<void> {
  await setAppStateValue(DEBT_LAST_APPLIED_KEY, date);
}

export async function clearDebtLastAppliedDate(): Promise<void> {
  await db.appState.delete(DEBT_LAST_APPLIED_KEY);
}

export async function applyDebtIfNeeded(today: string): Promise<void> {
  const balance = await getBalance();

  if (balance >= 0) {
    await clearDebtSinceDate();
    await clearDebtLastAppliedDate();
    return;
  }

  const debtSinceDate = await getDebtSinceDate();

  if (!debtSinceDate) {
    await setDebtSinceDate(today);
    return;
  }

  if (debtSinceDate >= today) {
    return;
  }

  const lastAppliedDate = await getDebtLastAppliedDate();
  if (lastAppliedDate === today) {
    return;
  }

  const municipalities = await db.municipalities.toArray();
  const transactions = await db.populationTransactions.toArray();
  const extraByMunicipality = new Map<string, number>();

  for (const tx of transactions) {
    const current = extraByMunicipality.get(tx.municipalityId) ?? 0;
    extraByMunicipality.set(tx.municipalityId, current + tx.amount);
  }

  const ordered = municipalities
    .map((municipality) => ({
      municipality,
      extraPopulation: Math.max(0, extraByMunicipality.get(municipality.id) ?? 0),
    }))
    .filter((item) => item.extraPopulation > 0)
    .sort((a, b) => b.extraPopulation - a.extraPopulation);

  let remainingDebt = Math.abs(balance);
  const now = getCurrentTimestamp();

  await db.transaction(
    "rw",
    db.populationTransactions,
    db.ledger,
    db.appState,
    async () => {
      for (const item of ordered) {
        if (remainingDebt <= 0) {
          break;
        }

        const removeAmount = Math.min(item.extraPopulation, remainingDebt);

        await db.populationTransactions.add({
          id: makeId(),
          municipalityId: item.municipality.id,
          date: today,
          amount: -removeAmount,
          reason: "Debt repayment",
          createdAt: now,
        });

        await db.ledger.add({
          id: makeId(),
          type: "debt_repay_population",
          amount: removeAmount,
          date: today,
          description: "Debt repaid by reducing population",
          metadata: {
            municipalityId: item.municipality.id,
            municipalityName: item.municipality.name,
          },
          createdAt: now,
          updatedAt: now,
        });

        remainingDebt -= removeAmount;
      }

      await setDebtLastAppliedDate(today);
    }
  );

  if (remainingDebt <= 0) {
    await clearDebtSinceDate();
  }
}
