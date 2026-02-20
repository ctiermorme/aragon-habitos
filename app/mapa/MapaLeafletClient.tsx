"use client";

import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CircleMarker, MapContainer, Popup, TileLayer } from "react-leaflet";
import { db } from "../../lib/db";

type MunicipalityView = {
  id: string;
  name: string;
  province: string;
  basePopulation: number;
  latitude: number;
  longitude: number;
  extraPopulation: number;
  totalPopulation: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getRadius(totalPopulation: number): number {
  return clamp(4 + Math.sqrt(Math.max(totalPopulation, 0)) / 30, 4, 30);
}

function getColorBand(totalPopulation: number): { color: string; label: string } {
  if (totalPopulation <= 1000) {
    return { color: "#bfdbfe", label: "0-1.000" };
  }
  if (totalPopulation <= 5000) {
    return { color: "#93c5fd", label: "1.001-5.000" };
  }
  if (totalPopulation <= 20000) {
    return { color: "#60a5fa", label: "5.001-20.000" };
  }
  if (totalPopulation <= 100000) {
    return { color: "#2563eb", label: "20.001-100.000" };
  }
  return { color: "#1e3a8a", label: "> 100.000" };
}

const LEGEND_BANDS = [
  { label: "0-1.000", color: "#bfdbfe" },
  { label: "1.001-5.000", color: "#93c5fd" },
  { label: "5.001-20.000", color: "#60a5fa" },
  { label: "20.001-100.000", color: "#2563eb" },
  { label: "> 100.000", color: "#1e3a8a" },
];

export default function MapaLeafletClient() {
  const municipalities = useLiveQuery(async (): Promise<MunicipalityView[]> => {
    const [allMunicipalities, allTransactions] = await Promise.all([
      db.municipalities.toArray(),
      db.populationTransactions.toArray(),
    ]);

    const extraByMunicipality = new Map<string, number>();

    for (const tx of allTransactions) {
      const current = extraByMunicipality.get(tx.municipalityId) ?? 0;
      extraByMunicipality.set(tx.municipalityId, current + tx.amount);
    }

    return allMunicipalities
      .filter((municipality) => !municipality.name.startsWith("__RESTO__"))
      .map((municipality) => {
        const rawExtra = extraByMunicipality.get(municipality.id) ?? 0;
        const extraPopulation = Math.max(rawExtra, 0);
        const totalPopulation = municipality.basePopulation + extraPopulation;

        return {
          id: municipality.id,
          name: municipality.name,
          province: municipality.province,
          basePopulation: municipality.basePopulation,
          latitude: municipality.latitude,
          longitude: municipality.longitude,
          extraPopulation,
          totalPopulation,
        };
      })
      .filter(
        (municipality) =>
          Number.isFinite(municipality.latitude) &&
          Number.isFinite(municipality.longitude)
      );
  }, []);

  const center = useMemo<[number, number]>(() => [41.65, -0.88], []);

  return (
    <div className="relative h-[78vh] min-h-[520px] w-full overflow-hidden rounded-xl border border-gray-200">
      <MapContainer center={center} zoom={8} className="h-full w-full" scrollWheelZoom>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {(municipalities ?? []).map((municipality) => {
          const band = getColorBand(municipality.totalPopulation);

          return (
            <CircleMarker
              key={municipality.id}
              center={[municipality.latitude, municipality.longitude]}
              radius={getRadius(municipality.totalPopulation)}
              pathOptions={{
                color: band.color,
                fillColor: band.color,
                fillOpacity: 0.65,
                weight: 1,
              }}
            >
              <Popup>
                <div className="text-sm leading-5 text-gray-800">
                  <div className="font-semibold">{municipality.name}</div>
                  <div className="text-xs text-gray-600">Provincia: {municipality.province}</div>
                  <div className="mt-1 text-xs text-gray-600">
                    Base: {municipality.basePopulation.toLocaleString("es-ES")}
                  </div>
                  <div className="text-xs text-gray-600">
                    Extra: {municipality.extraPopulation.toLocaleString("es-ES")}
                  </div>
                  <div className="mt-1 font-semibold text-blue-700">
                    Total: {municipality.totalPopulation.toLocaleString("es-ES")}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="absolute top-3 right-3 z-[1000] rounded-md border border-gray-200 bg-white p-3 text-sm text-gray-900 shadow-sm">
        <div className="mb-2 font-semibold text-black">Población total</div>
        <div className="space-y-1.5">
          {LEGEND_BANDS.map((band) => (
            <div key={band.label} className="flex items-center gap-2">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: band.color }}
              />
              <span className="font-medium text-gray-800">{band.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}