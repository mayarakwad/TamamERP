import type { Metadata } from "next";
import { DocPage } from "../../../_biz/doc-page";

export const metadata: Metadata = { title: "PurchaseOrder" };

export default async function PurchaseOrderPage({ params }: PageProps<"/w/[slug]/purchases/orders/[id]">) {
  const { slug, id } = await params;
  return <DocPage slug={slug} kind="po" id={id} />;
}
