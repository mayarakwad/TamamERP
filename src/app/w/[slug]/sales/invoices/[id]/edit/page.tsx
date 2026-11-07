import type { Metadata } from "next";
import { EditorPage } from "../../../../_biz/editor-page";

export const metadata: Metadata = { title: "Edit" };

export default async function EditInvoicePage({ params, searchParams }: PageProps<"/w/[slug]/sales/invoices/[id]/edit">) {
  const { slug, id } = await params;
  return <EditorPage slug={slug} kind="invoice" id={id} sp={await searchParams} />;
}
