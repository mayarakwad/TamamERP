import type { Metadata } from "next";
import { PartyPage } from "../../../_biz/party-page";

export const metadata: Metadata = { title: "Customer" };

export default async function CustomerPage({ params }: PageProps<"/w/[slug]/sales/customers/[id]">) {
  const { slug, id } = await params;
  return <PartyPage slug={slug} id={id} which="customer" />;
}
