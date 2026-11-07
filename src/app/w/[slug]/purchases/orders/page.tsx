import type { Metadata } from "next";
import { DocsPage } from "../../_biz/docs-page";

export const metadata: Metadata = { title: "Purchase orders" };

export default async function PurchaseOrdersPage({ params, searchParams }: PageProps<"/w/[slug]/purchases/orders">) {
  const { slug } = await params;
  return <DocsPage slug={slug} kind="po" sp={await searchParams} />;
}
