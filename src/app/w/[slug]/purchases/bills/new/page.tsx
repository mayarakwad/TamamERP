import type { Metadata } from "next";
import { EditorPage } from "../../../_biz/editor-page";

export const metadata: Metadata = { title: "New" };

export default async function NewSupplierBillPage({ params, searchParams }: PageProps<"/w/[slug]/purchases/bills/new">) {
  const { slug } = await params;
  return <EditorPage slug={slug} kind="bill" sp={await searchParams} />;
}
