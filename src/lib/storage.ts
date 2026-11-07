import "server-only";
import path from "node:path";
import { mkdir } from "node:fs/promises";

// Uploaded files live on local disk under STORAGE_DIR. Paths are always built
// from server-generated names, never from user input.

export const STORAGE_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.STORAGE_DIR ?? "./storage");

export async function ensureDir(...parts: string[]) {
  const dir = path.join(/*turbopackIgnore: true*/ STORAGE_DIR, ...parts);
  await mkdir(dir, { recursive: true });
  return dir;
}

/** Resolve a path inside STORAGE_DIR, refusing anything that escapes it. */
export function storagePath(...parts: string[]) {
  const full = path.resolve(/*turbopackIgnore: true*/ STORAGE_DIR, ...parts);
  if (!full.startsWith(STORAGE_DIR + path.sep)) throw new Error("Invalid storage path");
  return full;
}
