import type { Metadata } from "next";
import { DocsPage } from "../../_biz/docs-page";

export const metadata: Metadata = { title: "Quotations" };

export default async function QuotationsPage({ params, searchParams }: PageProps<"/w/[slug]/sales/quotations">) {
  const { slug } = await params;
  return <DocsPage slug={slug} kind="quote" sp={await searchParams} />;
}
