import { Municipality, PopulationTransaction } from "../../lib/db";

export type BaseRankingEntry = {
  puesto: number;
  municipio: string;
  poblacion: number;
  provincia?: string;
};

export type AragonRankingRow = {
  municipalityId: string;
  name: string;
  province: string;
  base: number;
  extra: number;
  total: number;
  puesto_ant: number | null;
  puesto_nue: number | null;
  diferencia: number;
  delta_puesto: number | null;
};

type WorkingEntry = {
  id: string;
  municipio: string;
  provincia: string;
  poblacion: number;
};

const warnedFallbacks = new Set<string>();

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function warnFallbackOnce(messageKey: string, message: string): void {
  if (warnedFallbacks.has(messageKey)) {
    return;
  }
  warnedFallbacks.add(messageKey);
  console.warn(message);
}

export function computeAragonRanking(
  municipalities: Municipality[],
  transactions: PopulationTransaction[],
  baseRanking: BaseRankingEntry[]
): AragonRankingRow[] {
  const extraByMunicipality = new Map<string, number>();
  for (const tx of transactions) {
    const current = extraByMunicipality.get(tx.municipalityId) ?? 0;
    extraByMunicipality.set(tx.municipalityId, current + tx.amount);
  }

  const baseByName = new Map<string, BaseRankingEntry[]>();
  for (const entry of baseRanking) {
    const key = normalizeName(entry.municipio);
    const list = baseByName.get(key) ?? [];
    list.push(entry);
    baseByName.set(key, list);
  }

  const working: WorkingEntry[] = baseRanking.map((entry, index) => ({
    id: `base:${index}`,
    municipio: entry.municipio,
    provincia: entry.provincia ?? "",
    poblacion: entry.poblacion,
  }));

  const workingByBaseEntry = new Map<BaseRankingEntry, WorkingEntry>();
  baseRanking.forEach((entry, index) => {
    workingByBaseEntry.set(entry, working[index]);
  });

  const rowDrafts = municipalities.map((municipality) => {
    const base = municipality.basePopulation;
    const extra = Math.max(extraByMunicipality.get(municipality.id) ?? 0, 0);
    const total = base + extra;
    const normalizedName = normalizeName(municipality.name);
    const normalizedProvince = normalizeName(municipality.province ?? "");

    const candidates = baseByName.get(normalizedName) ?? [];

    let matchedBaseEntry: BaseRankingEntry | null = null;
    if (candidates.length > 0) {
      matchedBaseEntry =
        candidates.find((entry) => normalizeName(entry.provincia ?? "") === normalizedProvince) ?? null;

      if (!matchedBaseEntry) {
        matchedBaseEntry = candidates[0];
        const fallbackKey = `${normalizedName}|${normalizedProvince}`;
        warnFallbackOnce(
          fallbackKey,
          `[ranking] Fallback de provincia para municipio "${municipality.name}" (${municipality.province}). Se usa coincidencia solo por nombre.`
        );
      }
    }

    const puesto_ant = matchedBaseEntry?.puesto ?? null;

    let workingEntry: WorkingEntry | null = null;
    if (matchedBaseEntry) {
      workingEntry = workingByBaseEntry.get(matchedBaseEntry) ?? null;
      if (workingEntry) {
        workingEntry.poblacion = total;
      }
    } else if (total >= 5000) {
      workingEntry = {
        id: `ar:${municipality.id}`,
        municipio: municipality.name,
        provincia: municipality.province,
        poblacion: total,
      };
      working.push(workingEntry);
    }

    return {
      municipalityId: municipality.id,
      name: municipality.name,
      province: municipality.province,
      base,
      extra,
      total,
      puesto_ant,
      workingEntryId: workingEntry?.id ?? null,
    };
  });

  const sortedWorking = [...working].sort((a, b) => {
    if (b.poblacion !== a.poblacion) {
      return b.poblacion - a.poblacion;
    }
    return a.municipio.localeCompare(b.municipio, "es");
  });

  const puestoByWorkingId = new Map<string, number>();
  sortedWorking.forEach((entry, index) => {
    puestoByWorkingId.set(entry.id, index + 1);
  });

  return rowDrafts.map((row) => {
    const puesto_nue =
      row.total < 5000 || !row.workingEntryId
        ? null
        : (puestoByWorkingId.get(row.workingEntryId) ?? null);
    const diferencia = row.total - row.base;
    const delta_puesto =
      row.puesto_ant !== null && puesto_nue !== null ? row.puesto_ant - puesto_nue : null;

    return {
      municipalityId: row.municipalityId,
      name: row.name,
      province: row.province,
      base: row.base,
      extra: row.extra,
      total: row.total,
      puesto_ant: row.puesto_ant,
      puesto_nue,
      diferencia,
      delta_puesto,
    };
  });
}