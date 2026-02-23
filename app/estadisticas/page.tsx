"use client";

import { Fragment, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../../lib/db";
import SpendPointsForm from "../components/SpendPointsForm";
import rankingMunicipios from "../../data/rankingmunicipios.json";
import rankingProvincias from "../../data/rankingprovincias.json";
import rankingComunidades from "../../data/rankingcomunidades.json";
import { computeAragonRanking, AragonRankingRow } from "./ranking";

const ARAGON_PROVINCES = ["zaragoza", "huesca", "teruel"];

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export default function EstadisticasPage() {
  const [searchAragon, setSearchAragon] = useState("");
  const [searchProvince, setSearchProvince] = useState("");

  const municipalities = useLiveQuery(async () => db.municipalities.toArray(), [], []);
  const populationTransactions = useLiveQuery(
    async () => db.populationTransactions.toArray(),
    [],
    []
  );

  const extraByMunicipality = useMemo(() => {
    const map = new Map<string, number>();
    for (const tx of populationTransactions) {
      const current = map.get(tx.municipalityId) ?? 0;
      map.set(tx.municipalityId, current + tx.amount);
    }
    return map;
  }, [populationTransactions]);

  const baseByProvince = useMemo(() => {
    const map = new Map<string, number>();
    for (const municipality of municipalities) {
      const key = normalizeName(municipality.province);
      map.set(key, (map.get(key) ?? 0) + municipality.basePopulation);
    }
    return map;
  }, [municipalities]);

  const totalByProvince = useMemo(() => {
    const map = new Map<string, number>();
    for (const municipality of municipalities) {
      const key = normalizeName(municipality.province);
      const extra = Math.max(0, extraByMunicipality.get(municipality.id) ?? 0);
      map.set(key, (map.get(key) ?? 0) + municipality.basePopulation + extra);
    }
    return map;
  }, [municipalities, extraByMunicipality]);

  const aragonRankingRows = useMemo(() => {
    const computed = computeAragonRanking(
      municipalities,
      populationTransactions,
      rankingMunicipios
    );
    const sorted = [...computed].sort((a, b) => b.total - a.total);
    
    // Add Aragon ranking position (1st, 2nd, 3rd, etc.)
    return sorted.map((row, index) => ({
      ...row,
      aragonRanking: index + 1,
    }));
  }, [municipalities, populationTransactions]);

  const aragonByProvince = useMemo(() => {
    const groups: Record<string, AragonRankingRow[]> = {
      zaragoza: [],
      huesca: [],
      teruel: [],
    };

    for (const row of aragonRankingRows) {
      const key = normalizeName(row.province);
      if (groups[key]) {
        groups[key].push(row);
      }
    }

    // Assign provincial rankings within each province
    Object.values(groups).forEach((rows) => {
      rows.sort((a, b) => b.total - a.total);
      rows.forEach((row, index) => {
        (row as any).provincialRanking = index + 1;
      });
    });

    return groups;
  }, [aragonRankingRows]);

  const provinceTableRows = useMemo(() => {
    const rows = rankingProvincias.map((entry) => {
      const key = normalizeName(entry.provincia);
      const isAragonProvince = ARAGON_PROVINCES.includes(key);
      const baseOfficial = (entry as any).poblacion_ant ?? entry.poblacion;
      const baseAragon = baseByProvince.get(key) ?? baseOfficial;
      const total = isAragonProvince ? (totalByProvince.get(key) ?? baseAragon) : entry.poblacion;

      return {
        provincia: entry.provincia,
        poblacion: total,
        poblacionBaseAragon: isAragonProvince ? baseAragon : undefined,
      };
    });

    const sorted = rows.sort((a, b) => {
      if (b.poblacion !== a.poblacion) {
        return b.poblacion - a.poblacion;
      }
      return a.provincia.localeCompare(b.provincia, "es");
    });

    return sorted.map((row, index) => ({
      ...row,
      puesto: index + 1,
    }));
  }, [baseByProvince, totalByProvince]);

  const communityTableRows = useMemo(() => {
    let baseAragon = 0;
    let totalAragon = 0;

    for (const municipality of municipalities) {
      const provinceKey = normalizeName(municipality.province);
      if (!ARAGON_PROVINCES.includes(provinceKey)) {
        continue;
      }
      const extra = Math.max(0, extraByMunicipality.get(municipality.id) ?? 0);
      baseAragon += municipality.basePopulation;
      totalAragon += municipality.basePopulation + extra;
    }

    const rows = rankingComunidades.map((entry) => {
      if (normalizeName(entry.comunidad) !== "aragon") {
        return {
          comunidad: entry.comunidad,
          poblacion: entry.poblacion,
        };
      }

      return {
        comunidad: entry.comunidad,
        poblacion: totalAragon,
        poblacionBaseAragon: baseAragon,
      };
    });

    const sorted = rows.sort((a, b) => {
      if (b.poblacion !== a.poblacion) {
        return b.poblacion - a.poblacion;
      }
      return a.comunidad.localeCompare(b.comunidad, "es");
    });

    return sorted.map((row, index) => ({
      ...row,
      puesto: index + 1,
    }));
  }, [municipalities, extraByMunicipality]);

  return (
    <div className="space-y-12 p-8 pb-96">
      <h1 className="text-3xl font-bold">Estadísticas</h1>

      <SpendPointsForm />

      <details className="rounded border border-gray-200" open>
        <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-xl font-semibold">
          <span>Municipios de Aragón (ordenados por población)</span>
          <span className="text-base font-semibold text-white">Desplegar ▾</span>
        </summary>
        <div className="px-4 pb-4">
          <div className="mb-4">
            <input
              type="text"
              placeholder="Buscar municipio..."
              value={searchAragon}
              onChange={(e) => setSearchAragon(e.target.value)}
              className="w-full rounded border border-gray-300 bg-gray-800 px-4 py-2 text-white placeholder-gray-400 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
            />
          </div>
          {aragonRankingRows.length > 0 ? (
            <div className="overflow-x-auto rounded border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 text-black">
                  <tr>
                    <th className="border-b border-gray-200 px-4 py-2 text-left">Puesto</th>
                    <th className="border-b border-gray-200 px-4 py-2 text-left">Municipio</th>
                    <th className="border-b border-gray-200 px-4 py-2 text-right">Población</th>
                    <th className="border-b border-gray-200 px-4 py-2 text-center">Puesto Nacional</th>
                    <th className="border-b border-gray-200 px-4 py-2 text-left">Provincia</th>
                  </tr>
                </thead>
                <tbody>
                  {aragonRankingRows
                    .filter((row) => normalizeName(row.name).includes(normalizeName(searchAragon)))
                    .map((row) => (
                    <tr key={row.municipalityId} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-2">{row.aragonRanking}</td>
                      <td className="px-4 py-2">{row.name}</td>
                      <td className="px-4 py-2 text-right font-semibold text-yellow-200">
                        {row.total.toLocaleString("es-ES")}
                      </td>
                      <td className="px-4 py-2 text-center font-semibold text-yellow-200 italic">
                        {row.puesto_nue !== null ? row.puesto_nue.toLocaleString("es-ES") : "-"}
                      </td>
                      <td className="px-4 py-2">{row.province}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded border border-gray-200 bg-gray-50 p-4 text-center text-gray-500">
              No hay municipios en la base de datos todavía
            </div>
          )}
        </div>
      </details>

      <details className="rounded border border-gray-200" open>
        <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-xl font-semibold">
          <span>Municipios por provincia (ordenados por población)</span>
          <span className="text-base font-semibold text-white">Desplegar ▾</span>
        </summary>
        <div className="px-4 pb-4">
          <div className="mb-4">
            <input
              type="text"
              placeholder="Buscar municipio..."
              value={searchProvince}
              onChange={(e) => setSearchProvince(e.target.value)}
              className="w-full rounded border border-gray-300 bg-gray-800 px-4 py-2 text-white placeholder-gray-400 focus:border-yellow-500 focus:outline-none focus:ring-1 focus:ring-yellow-500"
            />
          </div>
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-black">
                <tr>
                  <th className="border-b border-gray-200 px-4 py-2 text-left">Municipio</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Población Nueva</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-center">Puesto Nuevo</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Población Base</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-center">Puesto Antiguo</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {(["zaragoza", "huesca", "teruel"] as const).map((provinceKey, provinceIndex) => {
                  const rows = aragonByProvince[provinceKey] ?? [];

                  return (
                    <Fragment key={provinceKey}>
                      {rows.length > 0 ? (
                        rows
                          .filter((row) => normalizeName(row.name).includes(normalizeName(searchProvince)))
                          .map((row) => {
                          const extraPopulation = Math.max(0, row.total - row.base);
                          const differenceDisplay =
                            extraPopulation > 0
                              ? `+${extraPopulation.toLocaleString("es-ES")}`
                              : "—";
                          const isCapital = ["Zaragoza", "Huesca", "Teruel"].includes(row.name);
                          return (
                            <tr key={row.municipalityId} className="border-b border-gray-200 hover:bg-gray-50">
                              <td className={`px-4 py-2 ${isCapital ? "font-extrabold text-white" : ""}`}>{row.name}</td>
                              <td className="px-4 py-2 text-right font-semibold text-yellow-200">
                                {row.total.toLocaleString("es-ES")}
                              </td>
                              <td className="px-4 py-2 text-center text-yellow-200 italic">
                                {row.puesto_nue !== null ? row.puesto_nue.toLocaleString("es-ES") : "-"}
                              </td>
                              <td className="px-4 py-2 text-right">
                                {row.base.toLocaleString("es-ES")}
                              </td>
                              <td className="px-4 py-2 text-center italic">
                                {row.puesto_ant !== null ? row.puesto_ant.toLocaleString("es-ES") : "-"}
                              </td>
                              <td
                                className={`px-4 py-2 text-right ${
                                  differenceDisplay === "—" ? "" : "text-[#34a853]"
                                }`}
                              >
                                {differenceDisplay}
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td className="px-4 py-2 text-gray-500" colSpan={6}>
                            Sin municipios
                          </td>
                        </tr>
                      )}
                      {/* Añadir separación después de Zaragoza y Huesca */}
                      {provinceIndex < 2 && (
                        <tr className="h-12">
                          <td colSpan={6} className="bg-gray-700/50"></td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <details className="rounded border border-gray-200" open>
        <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-xl font-semibold">
          <span>Provincias de España (ordenadas por población)</span>
          <span className="text-base font-semibold text-white">Desplegar ▾</span>
        </summary>
        <div className="px-4 pb-4">
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-black">
                <tr>
                  <th className="border-b border-gray-200 px-4 py-2 text-center">Provincia</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-center">Población</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-center">Puesto</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {provinceTableRows.map((row) => {
                  const isAragonProvince = row.poblacionBaseAragon !== undefined;
                  const rowClass = isAragonProvince
                    ? "border-b border-gray-200 hover:bg-gray-50 bg-white/10 text-white font-extrabold"
                    : "border-b border-gray-200 hover:bg-gray-50";
                  
                  return (
                    <tr key={row.provincia} className={rowClass}>
                      <td className="px-4 py-2 text-center">{row.provincia}</td>
                      <td className="px-4 py-2 text-center font-semibold text-yellow-200">
                        {row.poblacion.toLocaleString("es-ES")}
                      </td>
                      <td className="px-4 py-2 text-center italic">{row.puesto.toLocaleString("es-ES")}</td>
                      <td className="px-4 py-2 text-center font-semibold">
                        {row.poblacionBaseAragon !== undefined
                          ? row.poblacionBaseAragon.toLocaleString("es-ES")
                          : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      <details className="rounded border border-gray-200" open>
        <summary className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3 text-xl font-semibold">
          <span>Comunidades autónomas (ordenadas por población)</span>
          <span className="text-base font-semibold text-white">Desplegar ▾</span>
        </summary>
        <div className="px-4 pb-4">
          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 text-black">
                <tr>
                  <th className="border-b border-gray-200 px-4 py-2 text-center">Comunidad</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-center">Población</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-center">Puesto</th>
                  <th className="border-b border-gray-200 px-4 py-2 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {communityTableRows.map((row) => {
                  const isAragon = row.poblacionBaseAragon !== undefined;
                  const communityNameClass = isAragon ? "px-4 py-2 text-center font-bold" : "px-4 py-2 text-center";
                  const puestoClass = isAragon
                    ? "px-4 py-2 text-center font-bold italic"
                    : "px-4 py-2 text-center italic";
                  const rowClass = isAragon
                    ? "border-b border-gray-200 hover:bg-gray-50 bg-white/10 text-white font-extrabold"
                    : "border-b border-gray-200 hover:bg-gray-50";
                  
                  return (
                    <tr key={row.comunidad} className={rowClass}>
                      <td className={communityNameClass}>{row.comunidad}</td>
                      <td className="px-4 py-2 text-center font-semibold text-yellow-200">
                        {row.poblacion.toLocaleString("es-ES")}
                      </td>
                      <td className={puestoClass}>{row.puesto.toLocaleString("es-ES")}</td>
                      <td className="px-4 py-2 text-center font-semibold">
                        {row.poblacionBaseAragon !== undefined
                          ? row.poblacionBaseAragon.toLocaleString("es-ES")
                          : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </details>
    </div>
  );
}
