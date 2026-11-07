import type { Metadata } from "next";
import { PartiesPage } from "../../_biz/parties-page";

export const metadata: Metadata = { title: "Suppliers" };

export default async function SuppliersPage({ params, searchParams }: PageProps<"/w/[slug]/purchases/suppliers">) {
  const { slug } = await params;
  return <PartiesPage slug={slug} which="supplier" sp={await searchParams} />;
}
