import "server-only";
import type { Workspace } from "../auth/dal";
import type { Dataset } from "./types";
import { claimsDataset } from "./claims";
import { billsDataset, budgetsDataset, possessionsDataset, summaryDataset } from "./home";
import { activityDataset } from "./activity";
import { billsDocDataset, customersDataset, invoicesDataset, paymentsInDataset, paymentsOutDataset, purchaseOrdersDataset, quotationsDataset, suppliersDataset } from "./sales";
import { itemsDataset, stockDataset, stockMovesDataset } from "./inventory";

// Every exportable table in the app. Add new datasets here.
const DATASETS: Record<string, Dataset<Workspace>> = {
  claims: claimsDataset,
  budgets: budgetsDataset,
  bills: billsDataset,
  possessions: possessionsDataset,
  summary: summaryDataset,
  activity: activityDataset,
  customers: customersDataset,
  suppliers: suppliersDataset,
  quotations: quotationsDataset,
  invoices: invoicesDataset,
  "purchase-orders": purchaseOrdersDataset,
  "supplier-bills": billsDocDataset,
  "payments-in": paymentsInDataset,
  "payments-out": paymentsOutDataset,
  items: itemsDataset,
  stock: stockDataset,
  "stock-moves": stockMovesDataset,
};

export function getDataset(id: string): Dataset<Workspace> | undefined {
  return DATASETS[id];
}

export function registerDataset(d: Dataset<Workspace>) {
  DATASETS[d.id] = d;
}
