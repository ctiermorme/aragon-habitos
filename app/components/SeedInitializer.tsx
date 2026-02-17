"use client";

import { useEffect, useState } from "react";
import { seedIfNeeded } from "../../lib/seed";

export default function SeedInitializer() {
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    let isMounted = true;

    seedIfNeeded().finally(() => {
      if (isMounted) {
        setIsInitializing(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (isInitializing) {
    return <div>Initializing...</div>;
  }

  return null;
}
