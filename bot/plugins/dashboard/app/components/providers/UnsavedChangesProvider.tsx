/**
 * UnsavedChangesProvider — blocks sidebar / back-button navigation
 * while a page has unsaved changes.
 *
 * Any page that supports batched editing can call `setDirty(true)` to
 * activate the guard and `setDirty(false)` after saving / cancelling.
 *
 * The Sidebar listens to `isDirty` and shows a browser confirm() before
 * navigating away.
 */
"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface UnsavedChangesContextValue {
  /** Whether the current page has unsaved changes */
  isDirty: boolean;
  /** Set by the page to indicate dirty state */
  setDirty: (dirty: boolean) => void;
  /**
   * Call before navigating. Returns `true` if navigation should proceed,
   * `false` if the user chose to stay.
   */
  confirmNavigation: () => boolean;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  isDirty: false,
  setDirty: () => {},
  confirmNavigation: () => true,
});

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}

export default function UnsavedChangesProvider({ children }: { children: React.ReactNode }) {
  const [isDirty, setDirty] = useState(false);

  const confirmNavigation = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm("You have unsaved changes. Are you sure you want to leave?");
  }, [isDirty]);

  return <UnsavedChangesContext.Provider value={{ isDirty, setDirty, confirmNavigation }}>{children}</UnsavedChangesContext.Provider>;
}
