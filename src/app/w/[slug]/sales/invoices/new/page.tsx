import type { Metadata } from "next";
import { EditorPage } from "../../../_biz/editor-page";

export const metadata: Metadata = { title: "New" };

export default async function NewInvoicePage({ params, searchParams }: PageProps<"/w/[slug]/sales/invoices/new">) {
  const { slug } = await params;
  return <EditorPage slug={slug} kind="invoice" sp={await searchParams} />;
}
