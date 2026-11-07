import "server-only";
import type { ExportDoc } from "./doc";

// Replaced by the payroll module.
export async function renderPayslip(doc: ExportDoc, orgId: string, id: string, mode: "print" | "pdf"): Promise<string> {
  void orgId;
  void id;
  void mode;
  return `<!doctype html><title>${doc.title}</title>`;
}
