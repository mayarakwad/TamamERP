import type { Metadata } from "next";
import { EditorPage } from "../../../../_biz/editor-page";

export const metadata: Metadata = { title: "Edit" };

export default async function EditQuotationPage({ params, searchParams }: PageProps<"/w/[slug]/sales/quotations/[id]/edit">) {
  const { slug, id } = await params;
  return <EditorPage slug={slug} kind="quote" id={id} sp={await searchParams} />;
}
