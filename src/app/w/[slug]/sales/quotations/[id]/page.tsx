import type { Metadata } from "next";
import { DocPage } from "../../../_biz/doc-page";

export const metadata: Metadata = { title: "Quotation" };

export default async function QuotationPage({ params }: PageProps<"/w/[slug]/sales/quotations/[id]">) {
  const { slug, id } = await params;
  return <DocPage slug={slug} kind="quote" id={id} />;
}
