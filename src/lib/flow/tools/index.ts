import "server-only";
import type { Workspace } from "../../auth/dal";
import { READ_TOOLS } from "./read";
import { PROPOSE_TOOLS } from "./propose";
import { fillFormTool } from "./client";
import type { FlowTool } from "./define";

const ALL: FlowTool[] = [...(READ_TOOLS as FlowTool[]), ...(PROPOSE_TOOLS as FlowTool[]), fillFormTool as FlowTool];

/** Tools this person may use, in a fixed order (the list is frozen per conversation). */
export function toolsFor(ws: Workspace): FlowTool[] {
  return ALL.filter((t) => t.available(ws));
}

export function getTool(name: string): FlowTool | undefined {
  return ALL.find((t) => t.name === name);
}
