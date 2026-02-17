import { db, makeId } from "./db";

type MunicipalitySeedRow = {
  ciudad?: string;
  provincia?: string;
  antiguo?: number | string;
  latitud?: number | string;
  latitude?: number | string;
  longitud?: number | string;
  longitude?: number | string;
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function seedIfNeeded(): Promise<void> {
  try {
    const existingCount = await db.municipalities.count();
    if (existingCount > 0) {
      console.info("[seed] Municipalities already seeded.");
      return;
    }

    console.info("[seed] Seeding municipalities...");

    const dataModule = await import("../data/municipiosaragon.json");
    const rows = Array.isArray(dataModule.default)
      ? (dataModule.default as MunicipalitySeedRow[])
      : [];

    const now = Date.now();
    const records = rows
      .map((row, index) => {
        const name = row.ciudad?.trim();
        const province = row.provincia?.trim();
        const basePopulation = toNumber(row.antiguo);
        const latitude = toNumber(row.latitud ?? row.latitude);
        const longitude = toNumber(row.longitud ?? row.longitude);

        if (!name || !province) {
          console.warn(`[seed] Skipping row ${index}: missing name or province.`);
          return null;
        }

        if (basePopulation === null || latitude === null || longitude === null) {
          console.warn(`[seed] Skipping row ${index}: invalid numeric fields.`);
          return null;
        }

        return {
          id: makeId(),
          name,
          province,
          basePopulation,
          latitude,
          longitude,
          createdAt: now,
        };
      })
      .filter((record) => record !== null);

    if (records.length === 0) {
      console.warn("[seed] No valid municipality records found.");
      return;
    }

    await db.municipalities.bulkAdd(records);
    console.info(`[seed] Seeded ${records.length} municipalities.`);
  } catch (error) {
    console.error("[seed] Failed to seed municipalities.", error);
  }
}
