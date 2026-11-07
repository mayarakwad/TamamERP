import type { Metadata } from "next";
import { EditorPage } from "../../../_biz/editor-page";

export const metadata: Metadata = { title: "New" };

export default async function NewQuotationPage({ params, searchParams }: PageProps<"/w/[slug]/sales/quotations/new">) {
  const { slug } = await params;
  return <EditorPage slug={slug} kind="quote" sp={await searchParams} />;
}
