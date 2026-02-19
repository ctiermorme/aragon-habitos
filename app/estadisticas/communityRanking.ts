import { Municipality, PopulationTransaction } from "../../lib/db";
import { normalizeName } from "./provinceRanking";

export type BaseCommunityRankingEntry = {
  puesto: number;
  comunidad: string;
  poblacion: number;
  poblacion_ant?: number;
};

export type CommunityRankingRow = {
  comunidad: string;
  poblacion_ant: number;
  poblacion_nue: number;
  diferencia: number;
  puesto_ant: number;
  puesto_nue: number;
  delta_puesto: number;
};

export type CommunityContextRow = {
  comunidad: string;
  poblacion_nue: number;
  puesto_nue: number;
};

export type CommunityRankingResult = {
  aragonRow: CommunityRankingRow | null;
  contextAroundAragon: CommunityContextRow[];
};

type WorkingCommunityRow = {
  comunidad: string;
  poblacion: number;
  puesto_ant: number;
  poblacion_ant_base?: number;
};

const ARAGON_PROVINCES = ["zaragoza", "huesca", "teruel"];

/**
 * Compute rankings for a list of items with populations.
 * Returns a map of normalized name -> rank (1-based, higher population = lower rank number)
 */
function computeRankingsMap(
  items: Array<{ name: string; population: number }>
): Map<string, number> {
  const normalized = items.map((item) => ({
    key: normalizeName(item.name),
    name: item.name,
    population: item.population,
  }));

  const sorted = [...normalized].sort((a, b) => {
    if (b.population !== a.population) {
      return b.population - a.population;
    }
    return a.name.localeCompare(b.name, "es");
  });

  const rankingMap = new Map<string, number>();
  sorted.forEach((item, index) => {
    rankingMap.set(item.key, index + 1);
  });

  return rankingMap;
}

function computeAragonTotals(
  municipalities: Municipality[],
  transactions: PopulationTransaction[]
): { baseAragon: number; totalAragon: number } {
  const txSumByMunicipality = new Map<string, number>();
  for (const tx of transactions) {
    const current = txSumByMunicipality.get(tx.municipalityId) ?? 0;
    txSumByMunicipality.set(tx.municipalityId, current + tx.amount);
  }

  let baseAragon = 0;
  let totalAragon = 0;

  for (const municipality of municipalities) {
    const provinceKey = normalizeName(municipality.province);
    if (!ARAGON_PROVINCES.includes(provinceKey)) {
      continue;
    }

    const base = municipality.basePopulation;
    const extra = Math.max(0, txSumByMunicipality.get(municipality.id) ?? 0);
    baseAragon += base;
    totalAragon += base + extra;
  }

  return { baseAragon, totalAragon };
}

export function computeCommunityRankings(
  municipalities: Municipality[],
  transactions: PopulationTransaction[],
  baseRanking: BaseCommunityRankingEntry[]
): CommunityRankingResult {
  const { baseAragon, totalAragon } = computeAragonTotals(municipalities, transactions);

  // Compute puesto_ant using official base populations for ALL communities (not from JSON puesto field)
  const allCommunitiesForRankingAnt = baseRanking.map((entry) => ({
    name: entry.comunidad,
    population: (entry as any).poblacion_ant ?? entry.poblacion,
  }));
  const rankingAntMap = computeRankingsMap(allCommunitiesForRankingAnt);

  const workingRows: WorkingCommunityRow[] = baseRanking.map((entry) => {
    if (normalizeName(entry.comunidad) !== "aragon") {
      return {
        comunidad: entry.comunidad,
        poblacion: entry.poblacion,
        puesto_ant: rankingAntMap.get(normalizeName(entry.comunidad)) ?? entry.puesto,
      };
    }

    return {
      comunidad: entry.comunidad,
      poblacion: totalAragon,
      puesto_ant: rankingAntMap.get(normalizeName(entry.comunidad)) ?? entry.puesto,
      poblacion_ant_base: baseAragon,
    };
  });

  const sorted = [...workingRows].sort((a, b) => {
    if (b.poblacion !== a.poblacion) {
      return b.poblacion - a.poblacion;
    }
    return a.comunidad.localeCompare(b.comunidad, "es");
  });

  const puestoNuevoByCommunity = new Map<string, number>();
  sorted.forEach((row, index) => {
    puestoNuevoByCommunity.set(normalizeName(row.comunidad), index + 1);
  });

  const aragonWorkingRow = workingRows.find((row) => normalizeName(row.comunidad) === "aragon") ?? null;
  const aragonPuestoNuevo = aragonWorkingRow
    ? (puestoNuevoByCommunity.get(normalizeName(aragonWorkingRow.comunidad)) ?? aragonWorkingRow.puesto_ant)
    : null;

  const aragonRow: CommunityRankingRow | null = aragonWorkingRow
    ? {
        comunidad: aragonWorkingRow.comunidad,
        poblacion_ant: aragonWorkingRow.poblacion_ant_base ?? baseAragon,
        poblacion_nue: aragonWorkingRow.poblacion,
        diferencia:
          aragonWorkingRow.poblacion - (aragonWorkingRow.poblacion_ant_base ?? baseAragon),
        puesto_ant: aragonWorkingRow.puesto_ant,
        puesto_nue: aragonPuestoNuevo ?? aragonWorkingRow.puesto_ant,
        delta_puesto:
          (aragonPuestoNuevo ?? aragonWorkingRow.puesto_ant) - aragonWorkingRow.puesto_ant,
      }
    : null;

  const aragonIndex = sorted.findIndex((row) => normalizeName(row.comunidad) === "aragon");
  const contextAroundAragon: CommunityContextRow[] =
    aragonIndex >= 0
      ? sorted
          .slice(Math.max(0, aragonIndex - 3), Math.min(sorted.length, aragonIndex + 4))
          .map((row) => ({
            comunidad: row.comunidad,
            poblacion_nue: row.poblacion,
            puesto_nue: puestoNuevoByCommunity.get(normalizeName(row.comunidad)) ?? 0,
          }))
      : [];

  return {
    aragonRow,
    contextAroundAragon,
  };
}
