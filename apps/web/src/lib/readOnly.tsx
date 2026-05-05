"use client";

import { createContext, useContext, type ReactNode } from "react";

const ReadOnlyContext = createContext<boolean>(false);

/**
 * Marca tutto il sotto-tree come "sola visualizzazione".
 * I componenti UI (bottoni edit/delete/add/upload/note) controllano
 * `useIsReadOnly()` e si nascondono o si disabilitano.
 */
export function ReadOnlyProvider({
  value = true,
  children,
}: {
  value?: boolean;
  children: ReactNode;
}) {
  return (
    <ReadOnlyContext.Provider value={value}>
      {children}
    </ReadOnlyContext.Provider>
  );
}

export function useIsReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}
