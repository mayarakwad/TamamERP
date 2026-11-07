import type { Metadata } from "next";
import { EditorPage } from "../../../_biz/editor-page";

export const metadata: Metadata = { title: "New" };

export default async function NewPurchaseOrderPage({ params, searchParams }: PageProps<"/w/[slug]/purchases/orders/new">) {
  const { slug } = await params;
  return <EditorPage slug={slug} kind="po" sp={await searchParams} />;
}
