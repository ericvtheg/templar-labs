import type { Workspace } from "./model.ts";
import { workspaceSchema } from "./model.ts";

export const STORAGE_KEY = "confer.workspace.v1";
const MAX_WORKSPACE_BYTES = 12_000_000;
export type WorkspaceStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadWorkspace(storage: WorkspaceStorage): Workspace | null {
  const value = storage.getItem(STORAGE_KEY);
  if (!value) {
    return null;
  }
  if (value.length > MAX_WORKSPACE_BYTES) {
    throw new Error("The saved workspace exceeds the size limit.");
  }
  return workspaceSchema.parse(JSON.parse(value));
}

export function saveWorkspace(storage: WorkspaceStorage, workspace: Workspace): void {
  const value = JSON.stringify(workspaceSchema.parse(workspace));
  if (value.length > MAX_WORKSPACE_BYTES) {
    throw new Error(
      "The workspace is too large to save on this device. Export drafts and source text before closing.",
    );
  }
  storage.setItem(STORAGE_KEY, value);
}

export function forgetWorkspace(storage: WorkspaceStorage): void {
  storage.removeItem(STORAGE_KEY);
}
