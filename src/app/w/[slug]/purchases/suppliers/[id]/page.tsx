import type { Metadata } from "next";
import { PartyPage } from "../../../_biz/party-page";

export const metadata: Metadata = { title: "Supplier" };

export default async function SupplierPage({ params }: PageProps<"/w/[slug]/purchases/suppliers/[id]">) {
  const { slug, id } = await params;
  return <PartyPage slug={slug} id={id} which="supplier" />;
}
