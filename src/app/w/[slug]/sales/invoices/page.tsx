import type { Metadata } from "next";
import { DocsPage } from "../../_biz/docs-page";

export const metadata: Metadata = { title: "Invoices" };

export default async function InvoicesPage({ params, searchParams }: PageProps<"/w/[slug]/sales/invoices">) {
  const { slug } = await params;
  return <DocsPage slug={slug} kind="invoice" sp={await searchParams} />;
}
