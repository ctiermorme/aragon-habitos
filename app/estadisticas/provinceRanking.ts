import { Municipality, PopulationTransaction } from "../../lib/db";

export type BaseProvinceRankingEntry = {
  puesto: number;
  provincia: string;
  poblacion: number;
  poblacion_ant?: number;
};

export type ProvinceRankingRow = {
  provincia: string;
  poblacion_nue: number;
  poblacion_ant: number;
  diferencia: number;
  puesto_ant: number;
  puesto_nue: number;
  delta_puesto: number;
};

export type ProvinceContextRow = {
  provincia: string;
  poblacion_nue: number;
  puesto_nue: number;
};

export type ProvinceRankingResult = {
  aragonRows: ProvinceRankingRow[];
  top5: ProvinceContextRow[];
};

type WorkingProvinceRow = {
  provincia: string;
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

export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function sumByMunicipalityExtra(transactions: PopulationTransaction[]): Map<string, number> {
  const extraByMunicipality = new Map<string, number>();
  for (const tx of transactions) {
    const current = extraByMunicipality.get(tx.municipalityId) ?? 0;
    extraByMunicipality.set(tx.municipalityId, current + tx.amount);
  }
  return extraByMunicipality;
}

function computeProvinceTotals(
  municipalities: Municipality[],
  transactions: PopulationTransaction[]
): {
  baseByProvince: Map<string, number>;
  totalByProvince: Map<string, number>;
  displayNameByProvince: Map<string, string>;
} {
  const extraByMunicipality = sumByMunicipalityExtra(transactions);
  const baseByProvince = new Map<string, number>();
  const totalByProvince = new Map<string, number>();
  const displayNameByProvince = new Map<string, string>();

  for (const municipality of municipalities) {
    const provinceKey = normalizeName(municipality.province);
    const base = municipality.basePopulation;
    const rawExtra = extraByMunicipality.get(municipality.id) ?? 0;
    const extra = Math.max(0, rawExtra);
    const total = base + extra;

    displayNameByProvince.set(provinceKey, municipality.province);
    baseByProvince.set(provinceKey, (baseByProvince.get(provinceKey) ?? 0) + base);
    totalByProvince.set(provinceKey, (totalByProvince.get(provinceKey) ?? 0) + total);
  }

  return { baseByProvince, totalByProvince, displayNameByProvince };
}

export function computeProvinceRankings(
  municipalities: Municipality[],
  transactions: PopulationTransaction[],
  baseRanking: BaseProvinceRankingEntry[]
): ProvinceRankingResult {
  const { baseByProvince, totalByProvince } = computeProvinceTotals(municipalities, transactions);

  // Compute puesto_ant using official base populations for ALL provinces (not from JSON puesto field)
  const allProvincesForRankingAnt = baseRanking.map((entry) => ({
    name: entry.provincia,
    population: (entry as any).poblacion_ant ?? entry.poblacion,
  }));
  const rankingAntMap = computeRankingsMap(allProvincesForRankingAnt);

  const workingRows: WorkingProvinceRow[] = baseRanking.map((entry) => {
    const provinceKey = normalizeName(entry.provincia);
    const isAragonProvince = ARAGON_PROVINCES.includes(provinceKey);
    if (!isAragonProvince) {
      return {
        provincia: entry.provincia,
        poblacion: entry.poblacion,
        puesto_ant: rankingAntMap.get(provinceKey) ?? entry.puesto,
      };
    }

    const baseProvincePopulation = baseByProvince.get(provinceKey) ?? entry.poblacion;
    const totalProvincePopulation = totalByProvince.get(provinceKey) ?? baseProvincePopulation;

    return {
      provincia: entry.provincia,
      poblacion: totalProvincePopulation,
      puesto_ant: rankingAntMap.get(provinceKey) ?? entry.puesto,
      poblacion_ant_base: baseProvincePopulation,
    };
  });

  const sorted = [...workingRows].sort((a, b) => {
    if (b.poblacion !== a.poblacion) {
      return b.poblacion - a.poblacion;
    }
    return a.provincia.localeCompare(b.provincia, "es");
  });

  const puestoNuevoByProvince = new Map<string, number>();
  sorted.forEach((row, index) => {
    puestoNuevoByProvince.set(normalizeName(row.provincia), index + 1);
  });

  const aragonRows: ProvinceRankingRow[] = workingRows
    .filter((row) => ARAGON_PROVINCES.includes(normalizeName(row.provincia)))
    .map((row) => {
      const provinceKey = normalizeName(row.provincia);
      const poblacion_ant = row.poblacion_ant_base ?? (baseByProvince.get(provinceKey) ?? row.poblacion);
      const poblacion_nue = row.poblacion;
      const puesto_nue = puestoNuevoByProvince.get(provinceKey) ?? row.puesto_ant;
      const puesto_ant = row.puesto_ant;

      return {
        provincia: row.provincia,
        poblacion_ant,
        poblacion_nue,
        diferencia: poblacion_nue - poblacion_ant,
        puesto_ant,
        puesto_nue,
        delta_puesto: puesto_nue - puesto_ant,
      };
    })
    .sort((a, b) => a.puesto_nue - b.puesto_nue);

  const top5: ProvinceContextRow[] = sorted.slice(0, 5).map((row) => ({
    provincia: row.provincia,
    poblacion_nue: row.poblacion,
    puesto_nue: puestoNuevoByProvince.get(normalizeName(row.provincia)) ?? 0,
  }));

  return {
    aragonRows,
    top5,
  };
}
