import type { Metadata } from "next";
import { EditorPage } from "../../../../_biz/editor-page";

export const metadata: Metadata = { title: "Edit" };

export default async function EditPurchaseOrderPage({ params, searchParams }: PageProps<"/w/[slug]/purchases/orders/[id]/edit">) {
  const { slug, id } = await params;
  return <EditorPage slug={slug} kind="po" id={id} sp={await searchParams} />;
}
