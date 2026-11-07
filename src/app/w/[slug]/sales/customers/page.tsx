import type { Metadata } from "next";
import { PartiesPage } from "../../_biz/parties-page";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({ params, searchParams }: PageProps<"/w/[slug]/sales/customers">) {
  const { slug } = await params;
  return <PartiesPage slug={slug} which="customer" sp={await searchParams} />;
}
