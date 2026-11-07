"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, FileText, ImagePlus, Loader2, X } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented } from "@/components/ui/controls";
import { CategoryIcon } from "@/components/ui/category-icon";
import { pick, type MessageKey } from "@/lib/i18n";
import { parseMoney } from "@/lib/money";
import { cn } from "@/lib/cn";
import { uploadAttachments } from "@/lib/upload-client";
import { createClaim, updateClaim, type ClaimInput } from "@/app/actions/claims";

export interface CategoryOption {
  id: string;
  key: string;
  name: string;
  nameAr: string | null;
  icon: string;
}

export interface ClaimInitial {
  id: string;
  amount: string;
  merchant: string;
  categoryId: string;
  spentOn: string;
  paidWith: "cash" | "card" | "transfer";
  note: string;
}

const todayInDoha = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Qatar" }).format(new Date());

export function ClaimSheet({
  slug,
  open,
  onOpenChange,
  categories,
  merchants,
  canApprove,
  initial,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  categories: CategoryOption[];
  merchants: string[];
  canApprove: boolean;
  initial?: ClaimInitial;
}) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  const editing = !!initial;
  const blank = (): ClaimInput & { categoryId: string } => ({
    amount: initial?.amount ?? "",
    merchant: initial?.merchant ?? "",
    categoryId: initial?.categoryId ?? categories[0]?.id ?? "",
    spentOn: initial?.spentOn ?? todayInDoha(),
    paidWith: initial?.paidWith ?? "card",
    note: initial?.note ?? "",
    askApproval: false,
  });
  const [form, setForm] = useState(blank);
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<"idle" | "saving" | "uploading">("idle");
  const cameraRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  // Fresh form each time the sheet opens.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(blank());
      setFiles([]);
      setErrors({});
    }
  }

  const previews = useMemo(() => files.map((f) => ({ name: f.name, url: f.type.startsWith("image/") ? URL.createObjectURL(f) : null })), [files]);
  useEffect(() => () => previews.forEach((p) => p.url && URL.revokeObjectURL(p.url)), [previews]);

  const amountValue = parseMoney(form.amount);
  const hijri = useMemo(() => {
    try {
      return fmt.hijri(new Date(`${form.spentOn}T12:00:00+03:00`));
    } catch {
      return "";
    }
  }, [form.spentOn, fmt]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    setFiles((f) => [...f, ...Array.from(list)].slice(0, 10));
  };

  async function submit() {
    const e: Record<string, string> = {};
    if (!amountValue || amountValue <= 0) e.amount = t("claims.amountInvalid");
    if (!form.merchant.trim()) e.merchant = t("errors.required");
    if (!form.categoryId) e.categoryId = t("errors.required");
    setErrors(e);
    if (Object.keys(e).length) return;

    setPhase("saving");
    const res: { ok: true; id?: string; number?: string; status?: string } | { ok: false; error: string; field?: string } = editing
      ? await updateClaim(slug, initial!.id, form)
      : await createClaim(slug, form);
    if (!res.ok) {
      setPhase("idle");
      if (res.field) setErrors({ [res.field]: t(res.error as MessageKey) });
      else toast.error(t(res.error as MessageKey));
      return;
    }
    const id = editing ? initial!.id : res.id!;
    if (files.length) {
      setPhase("uploading");
      try {
        await uploadAttachments(slug, "claim", id, "receipt", files);
      } catch {
        toast.error(t("settings.uploadFailed"));
      }
    }
    setPhase("idle");
    onOpenChange(false);
    if (editing) {
      toast.success(t("claims.updated"));
      router.refresh();
    } else {
      toast.success(res.status === "approved" ? t("claims.autoApproved", { number: res.number! }) : t("claims.submitted", { number: res.number! }));
      router.push(`/w/${slug}/claims/${id}`);
    }
  }

  const busy = phase !== "idle";

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={editing ? t("claims.edit") : t("claims.new")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            {phase === "uploading" ? t("claims.uploadingReceipts") : phase === "saving" ? t("claims.submitting") : editing ? t("claims.saveChanges") : t("claims.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Receipts first: snapping a photo is the fastest way to start. */}
        <section>
          <p className="text-sm font-medium">{t("claims.receipts")}</p>
          <p className="mb-2 text-xs text-muted">{t("claims.receiptsHint")}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {previews.map((p, i) => (
              <div key={i} className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-line bg-sunken">
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.url} alt="" className="size-full object-cover" />
                ) : (
                  <span className="grid size-full place-items-center text-muted">
                    <FileText className="size-6" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                  className="absolute end-1 top-1 grid size-6 place-items-center rounded-full bg-black/60 text-white"
                  aria-label={t("claims.removeReceipt")}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => cameraRef.current?.click()} className="lift grid aspect-[3/4] place-items-center rounded-xl border-2 border-dashed border-accent-line bg-accent-soft/50 text-accent">
              <span className="flex flex-col items-center gap-1 text-xs font-medium">
                <Camera className="size-6" />
                {t("claims.takePhoto")}
              </span>
            </button>
            <button type="button" onClick={() => uploadRef.current?.click()} className="lift grid aspect-[3/4] place-items-center rounded-xl border-2 border-dashed border-line text-muted">
              <span className="flex flex-col items-center gap-1 text-xs font-medium">
                <ImagePlus className="size-6" />
                {t("claims.uploadFiles")}
              </span>
            </button>
          </div>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
          <input ref={uploadRef} type="file" accept="image/*,application/pdf" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
        </section>

        <Field label={t("claims.amount")} error={errors.amount} htmlFor="c-amount">
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 start-3.5 flex items-center text-sm font-medium text-subtle">{fmt.config.currency ?? "QAR"}</span>
            <Input
              id="c-amount"
              inputMode="decimal"
              autoComplete="off"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              placeholder="0.00"
              dir="ltr"
              className="h-14 ps-14 text-2xl font-semibold tabular"
              aria-invalid={!!errors.amount}
            />
          </div>
        </Field>

        <Field label={t("claims.merchant")} error={errors.merchant} htmlFor="c-merchant">
          <Input id="c-merchant" list="c-merchants" value={form.merchant} onChange={(e) => setForm({ ...form, merchant: e.target.value })} placeholder={t("claims.merchantPlaceholder")} aria-invalid={!!errors.merchant} />
          <datalist id="c-merchants">
            {merchants.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </Field>

        <div>
          <p className="mb-1.5 text-sm font-medium">{t("claims.category")}</p>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
            {categories.map((c) => {
              const active = form.categoryId === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setForm({ ...form, categoryId: c.id })}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center text-xs transition-colors",
                    active ? "border-accent bg-accent-soft font-medium text-accent" : "border-line hover:bg-sunken",
                  )}
                >
                  <CategoryIcon icon={c.icon} className="size-5" />
                  <span className="line-clamp-2">{pick(locale, c.name, c.nameAr)}</span>
                </button>
              );
            })}
          </div>
          {errors.categoryId && <p className="mt-1 text-xs text-danger">{errors.categoryId}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("claims.date")} hint={hijri ? t("claims.hijriOn", { date: hijri }) : undefined} htmlFor="c-date">
            <Input id="c-date" type="date" value={form.spentOn} max={todayInDoha()} onChange={(e) => setForm({ ...form, spentOn: e.target.value })} />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium">{t("claims.paidWith")}</p>
            <Segmented
              label={t("claims.paidWith")}
              value={form.paidWith}
              onChange={(paidWith) => setForm({ ...form, paidWith })}
              options={[
                { value: "card", label: t("claims.card") },
                { value: "cash", label: t("claims.cash") },
                { value: "transfer", label: t("claims.transfer") },
              ]}
            />
          </div>
        </div>

        <Field label={<>{t("claims.note")} <span className="font-normal text-subtle">({t("common.optional")})</span></>} htmlFor="c-note">
          <Textarea id="c-note" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t("claims.notePlaceholder")} />
        </Field>

        {canApprove && !editing && (
          <div className="rounded-xl bg-sunken/70 p-3 text-sm">
            <p className="text-muted">{t("claims.autoApprove")}</p>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={form.askApproval} onChange={(e) => setForm({ ...form, askApproval: e.target.checked })} className="size-4 accent-[var(--accent)]" />
              {t("claims.askApproval")}
            </label>
          </div>
        )}
      </div>
    </Sheet>
  );
}
