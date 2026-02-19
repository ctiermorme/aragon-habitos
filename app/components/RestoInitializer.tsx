"use client";

import { useEffect, useState } from "react";
import { db, makeId, getCurrentTimestamp } from "../../lib/db";
import rankingProvincias from "../../data/rankingprovincias.json";

function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * RESTO Initializer: Creates hidden municipalities for uncovered populations per province
 * to keep official base populations stable while supporting partial coverage.
 */
async function initializeRestoIfNeeded(): Promise<void> {
  try {
    // Map of province name (normalized) to official base population from rankingprovincias.json
    const officialProvinceBase = new Map<string, number>();

    // Extract Zaragoza, Huesca, Teruel from rankingprovincias.json
    for (const entry of rankingProvincias) {
      const provinceKey = normalizeName(entry.provincia);
      if (["zaragoza", "huesca", "teruel"].includes(provinceKey)) {
        // If poblacion_ant exists, use it (alternative base); otherwise use poblacion
        const basePopulation = (entry as any).poblacion_ant ?? entry.poblacion;
        officialProvinceBase.set(provinceKey, basePopulation);
      }
    }

    // Read existing municipalities
    const allMunicipalities = await db.municipalities.toArray();

    // Compute sum per province (excluding existing RESTO entries)
    const coveredByProvince = new Map<string, number>();
    for (const municipality of allMunicipalities) {
      if (municipality.name.startsWith("__RESTO__")) {
        continue;
      }
      const provinceKey = normalizeName(municipality.province);
      const current = coveredByProvince.get(provinceKey) ?? 0;
      coveredByProvince.set(provinceKey, current + municipality.basePopulation);
    }

    // Determine which RESTO entries to create/update
    const now = getCurrentTimestamp();
    const restoProvincies = ["zaragoza", "huesca", "teruel"];

    for (const provinceKey of restoProvincies) {
      const officialBase = officialProvinceBase.get(provinceKey) ?? 0;
      const covered = coveredByProvince.get(provinceKey) ?? 0;
      const restoPopulation = Math.max(0, officialBase - covered);

      // Map normalized key back to display name
      const displayProvinceName = allMunicipalities
        .find((m) => normalizeName(m.province) === provinceKey)
        ?.province;

      if (!displayProvinceName) {
        console.warn(`[resto] Could not find display name for province: ${provinceKey}`);
        continue;
      }

      const restoName = `__RESTO__ ${displayProvinceName}`;

      // Check if RESTO entry already exists for this province
      const existingResto = allMunicipalities.find(
        (m) =>
          m.name === restoName &&
          normalizeName(m.province) === provinceKey
      );

      if (existingResto) {
        // Update if basePopulation changed
        if (existingResto.basePopulation !== restoPopulation) {
          await db.municipalities.update(existingResto.id, {
            basePopulation: restoPopulation,
          });
          console.info(
            `[resto] updated ${restoName}: ${existingResto.basePopulation} -> ${restoPopulation}`
          );
        }
      } else {
        // Create new RESTO entry
        // Use province capital coords or Aragón center (not used for map since RESTO is hidden)
        const coords: Record<string, [number, number]> = {
          zaragoza: [41.6561, -0.8773],      // Zaragoza city center
          huesca: [42.1396, -0.4057],        // Huesca city center
          teruel: [40.3444, -1.1069],        // Teruel city center
        };

        const [lat, lon] = coords[provinceKey] || [41.65, -0.88];

        await db.municipalities.add({
          id: makeId(),
          name: restoName,
          province: displayProvinceName,
          basePopulation: restoPopulation,
          latitude: lat,
          longitude: lon,
          createdAt: now,
        });

        console.info(`[resto] created ${restoName}: ${restoPopulation}`);
      }
    }
  } catch (error) {
    console.error("[resto] Initialization failed:", error);
  }
}

export default function RestoInitializer() {
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let isMounted = true;

    initializeRestoIfNeeded().finally(() => {
      if (isMounted) {
        setIsInitializing(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (isInitializing) {
    return null;
  }

  return null;
}
