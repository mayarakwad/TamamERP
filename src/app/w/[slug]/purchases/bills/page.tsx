import type { Metadata } from "next";
import { DocsPage } from "../../_biz/docs-page";

export const metadata: Metadata = { title: "Supplier bills" };

export default async function SupplierBillsPage({ params, searchParams }: PageProps<"/w/[slug]/purchases/bills">) {
  const { slug } = await params;
  return <DocsPage slug={slug} kind="bill" sp={await searchParams} />;
}
