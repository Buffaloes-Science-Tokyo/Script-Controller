"use client";

import { createContext, useContext, useMemo, useState } from "react";

// Tabs stay mounted once opened (see app/page.tsx), so their loaded data acts
// as a cache. These counters are how one tab tells the others that data they
// may be showing changed: tabs re-fetch in the background when a version they
// depend on moves, instead of on every tab switch.
type DataVersion = {
  /** Bumped when a play is registered, edited or deleted. */
  playsVersion: number;
  /** Bumped when attribute definitions change. */
  schemaVersion: number;
  playsChanged: () => void;
  schemaChanged: () => void;
};

const DataVersionContext = createContext<DataVersion | null>(null);

export function DataVersionProvider({ children }: { children: React.ReactNode }) {
  const [playsVersion, setPlaysVersion] = useState(0);
  const [schemaVersion, setSchemaVersion] = useState(0);

  const value = useMemo<DataVersion>(
    () => ({
      playsVersion,
      schemaVersion,
      playsChanged: () => setPlaysVersion((v) => v + 1),
      // Renaming or deleting an attribute changes how every play displays.
      schemaChanged: () => {
        setSchemaVersion((v) => v + 1);
        setPlaysVersion((v) => v + 1);
      },
    }),
    [playsVersion, schemaVersion]
  );

  return <DataVersionContext.Provider value={value}>{children}</DataVersionContext.Provider>;
}

export function useDataVersion(): DataVersion {
  const value = useContext(DataVersionContext);
  if (!value) throw new Error("useDataVersion must be used inside DataVersionProvider");
  return value;
}
