"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, FileText, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { Dialog } from "radix-ui";
import { useI18n } from "@/components/providers";
import { Button } from "@/components/ui/button";
import { uploadAttachments } from "@/lib/upload-client";

export interface GalleryFile {
  id: string;
  url: string;
  thumb: string | null;
  fileName: string;
  mimeType: string;
}

/** Receipt/photo gallery with a lightbox, upload and remove. */
export function Gallery({ slug, entityType, entityId, kind, files, canEdit, emptyLabel, addLabel }: { slug: string; entityType: string; entityId: string; kind: string; files: GalleryFile[]; canEdit: boolean; emptyLabel: string; addLabel: string }) {
  const { t, dir } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function add(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      await uploadAttachments(slug, entityType, entityId, kind, Array.from(list));
      router.refresh();
    } catch {
      toast.error(t("settings.uploadFailed"));
    }
    setBusy(false);
  }
  async function remove(id: string) {
    await fetch(`/api/w/${slug}/attachments/${id}`, { method: "DELETE" });
    setOpen(null);
    router.refresh();
  }

  const current = open !== null ? files[open] : null;
  const Prev = dir === "rtl" ? ChevronRight : ChevronLeft;
  const Next = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {files.map((f, i) => (
          <button key={f.id} type="button" onClick={() => setOpen(i)} className="lift group relative aspect-[3/4] overflow-hidden rounded-xl border border-line bg-sunken">
            {f.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={f.thumb} alt={f.fileName} loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
            ) : (
              <span className="grid size-full place-items-center text-muted">
                <FileText className="size-7" />
              </span>
            )}
          </button>
        ))}
        {canEdit && (
          <button type="button" onClick={() => input.current?.click()} disabled={busy} className="lift grid aspect-[3/4] place-items-center rounded-xl border-2 border-dashed border-line text-muted">
            <span className="flex flex-col items-center gap-1 text-xs font-medium">
              {busy ? <Loader2 className="size-6 animate-spin" /> : <ImagePlus className="size-6" />}
              {addLabel}
            </span>
          </button>
        )}
      </div>
      {files.length === 0 && !canEdit && <p className="text-sm text-muted">{emptyLabel}</p>}
      <input ref={input} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => (add(e.target.files), (e.target.value = ""))} />

      <Dialog.Root open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
          <Dialog.Content dir={dir} className="fixed inset-0 z-50 flex flex-col outline-none" onKeyDown={(e) => {
            if (open === null) return;
            if (e.key === (dir === "rtl" ? "ArrowLeft" : "ArrowRight")) setOpen((open + 1) % files.length);
            if (e.key === (dir === "rtl" ? "ArrowRight" : "ArrowLeft")) setOpen((open - 1 + files.length) % files.length);
          }}>
            <Dialog.Title className="sr-only">{current?.fileName}</Dialog.Title>
            <Dialog.Description className="sr-only">{current?.fileName}</Dialog.Description>
            <div className="flex items-center justify-between gap-2 p-3 text-white">
              <span className="truncate text-sm opacity-80">{current?.fileName}</span>
              <div className="flex items-center gap-1">
                {current && (
                  <a href={`${current.url}${current.url.includes("?") ? "&" : "?"}download`} className="grid size-9 place-items-center rounded-lg hover:bg-white/10" aria-label="Download">
                    <Download className="size-4" />
                  </a>
                )}
                {canEdit && current && (
                  <button type="button" onClick={() => remove(current.id)} className="grid size-9 place-items-center rounded-lg hover:bg-white/10" aria-label={t("claims.removeReceipt")}>
                    <Trash2 className="size-4" />
                  </button>
                )}
                <Dialog.Close className="grid size-9 place-items-center rounded-lg hover:bg-white/10" aria-label={t("common.close")}>
                  <X className="size-5" />
                </Dialog.Close>
              </div>
            </div>
            <div className="relative flex min-h-0 flex-1 items-center justify-center p-4" onClick={() => setOpen(null)}>
              {current &&
                (current.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={current.url} alt={current.fileName} className="max-h-full max-w-full rounded-lg object-contain shadow-2xl animate-[pop-in_200ms_ease-out]" onClick={(e) => e.stopPropagation()} />
                ) : (
                  <iframe src={current.url} title={current.fileName} className="size-full max-w-3xl rounded-lg bg-white" onClick={(e) => e.stopPropagation()} />
                ))}
              {files.length > 1 && open !== null && (
                <>
                  <Button variant="secondary" size="icon" className="absolute start-4" onClick={(e) => (e.stopPropagation(), setOpen((open - 1 + files.length) % files.length))} aria-label="Previous">
                    <Prev className="size-5" />
                  </Button>
                  <Button variant="secondary" size="icon" className="absolute end-4" onClick={(e) => (e.stopPropagation(), setOpen((open + 1) % files.length))} aria-label="Next">
                    <Next className="size-5" />
                  </Button>
                </>
              )}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
