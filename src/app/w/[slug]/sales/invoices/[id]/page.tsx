import type { Metadata } from "next";
import { DocPage } from "../../../_biz/doc-page";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoicePage({ params }: PageProps<"/w/[slug]/sales/invoices/[id]">) {
  const { slug, id } = await params;
  return <DocPage slug={slug} kind="invoice" id={id} />;
}
