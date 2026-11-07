import type { Metadata } from "next";
import { EditorPage } from "../../../../_biz/editor-page";

export const metadata: Metadata = { title: "Edit" };

export default async function EditSupplierBillPage({ params, searchParams }: PageProps<"/w/[slug]/purchases/bills/[id]/edit">) {
  const { slug, id } = await params;
  return <EditorPage slug={slug} kind="bill" id={id} sp={await searchParams} />;
}
