import "server-only";
import type { Workspace } from "../auth/dal";
import type { Dataset } from "./types";
import { claimsDataset } from "./claims";

// Every exportable table in the app. Add new datasets here.
const DATASETS: Record<string, Dataset<Workspace>> = {
  claims: claimsDataset,
};

export function getDataset(id: string): Dataset<Workspace> | undefined {
  return DATASETS[id];
}

export function registerDataset(d: Dataset<Workspace>) {
  DATASETS[d.id] = d;
}
