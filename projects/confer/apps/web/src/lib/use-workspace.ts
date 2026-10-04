import { useCallback, useEffect, useState } from "react";
import { createDemoWorkspace } from "./demo.ts";
import type { Matter, Workspace } from "./model.ts";
import { forgetWorkspace, loadWorkspace, saveWorkspace } from "./storage.ts";

function initialState() {
  try {
    const saved = loadWorkspace(window.localStorage);
    return { workspace: saved ?? createDemoWorkspace(), persistent: saved !== null, error: "" };
  } catch {
    return {
      workspace: createDemoWorkspace(),
      persistent: false,
      error:
        "Saved data could not be opened, or browser storage is unavailable. This session is not being saved. Existing saved data has not been changed.",
    };
  }
}

export function useWorkspace() {
  const [initial] = useState(initialState);
  const [workspace, setWorkspace] = useState<Workspace>(initial.workspace);
  const [persistent, setPersistent] = useState(initial.persistent);
  const [storageError, setStorageError] = useState(initial.error);

  useEffect(() => {
    if (!persistent) {
      return;
    }
    try {
      saveWorkspace(window.localStorage, workspace);
      setStorageError("");
    } catch {
      setStorageError(
        "Changes could not be saved. Browser storage may be full or blocked. Keep this tab open and export your drafts and workspace before closing.",
      );
    }
  }, [workspace, persistent]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      const hasRealMatter = workspace.matters.some((matter) => !matter.isDemo);
      const hasDrafts = workspace.matters.some((matter) => matter.drafts.length > 0);
      if ((!persistent || storageError) && (hasRealMatter || hasDrafts)) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [workspace, persistent, storageError]);

  const setPersistence = (enabled: boolean) => {
    try {
      if (enabled) {
        saveWorkspace(window.localStorage, workspace);
      } else {
        forgetWorkspace(window.localStorage);
      }
      setPersistent(enabled);
      setStorageError("");
      return true;
    } catch {
      setStorageError(
        enabled
          ? "Could not save this workspace. Browser storage may be full or blocked."
          : "Could not remove saved data. Check browser storage settings; saved data may still exist.",
      );
      return false;
    }
  };

  const updateMatter = useCallback((id: string, update: (matter: Matter) => Matter) => {
    setWorkspace((current) => ({
      ...current,
      matters: current.matters.map((matter) => (matter.id === id ? update(matter) : matter)),
    }));
  }, []);

  const activeMatter =
    workspace.matters.find((matter) => matter.id === workspace.activeMatterId) ??
    workspace.matters[0];
  if (!activeMatter) {
    throw new Error("A workspace must contain a matter.");
  }
  return {
    workspace,
    setWorkspace,
    activeMatter,
    updateMatter,
    persistent,
    setPersistence,
    storageError,
  };
}
