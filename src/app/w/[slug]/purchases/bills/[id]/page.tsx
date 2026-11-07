import type { Metadata } from "next";
import { DocPage } from "../../../_biz/doc-page";

export const metadata: Metadata = { title: "SupplierBill" };

export default async function SupplierBillPage({ params }: PageProps<"/w/[slug]/purchases/bills/[id]">) {
  const { slug, id } = await params;
  return <DocPage slug={slug} kind="bill" id={id} />;
}
