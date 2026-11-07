"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import type { MessageKey } from "@/lib/i18n";
import { saveParty, type PartyInput } from "@/app/actions/biz";

export interface PartyData {
  id: string;
  name: string;
  nameAr: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  addressAr: string | null;
  crNumber: string | null;
  paymentTerms: number;
  creditLimit: number | null;
  notes: string | null;
}

/** Add or edit a customer / supplier. */
export function PartySheet({
  slug,
  open,
  onOpenChange,
  which,
  initial,
  defaultName,
  onSaved,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  which: "customer" | "supplier";
  initial?: PartyData;
  defaultName?: string;
  onSaved?: (id: string, name: string) => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const blank = (): PartyInput => ({
    name: initial?.name ?? defaultName ?? "",
    nameAr: initial?.nameAr ?? "",
    isCustomer: initial?.isCustomer ?? which === "customer",
    isSupplier: initial?.isSupplier ?? which === "supplier",
    contactName: initial?.contactName ?? "",
    phone: initial?.phone ?? "",
    email: initial?.email ?? "",
    address: initial?.address ?? "",
    addressAr: initial?.addressAr ?? "",
    crNumber: initial?.crNumber ?? "",
    paymentTerms: initial?.paymentTerms ?? 30,
    creditLimit: initial?.creditLimit ? String(initial.creditLimit / 100) : "",
    notes: initial?.notes ?? "",
  });
  const [form, setForm] = useState(blank);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(blank());
      setErrors({});
    }
  }
  const set = <K extends keyof PartyInput>(k: K, v: PartyInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = () =>
    start(async () => {
      const res = await saveParty(slug, initial?.id ?? null, form);
      if (!res.ok) {
        if (res.field) setErrors({ [res.field]: t(res.error as MessageKey) });
        else toast.error(t(res.error as MessageKey));
        return;
      }
      toast.success(t("common.saved"));
      onOpenChange(false);
      onSaved?.(res.id, form.name);
      router.refresh();
    });

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !pending && onOpenChange(o)}
      title={initial ? t("parties.edit") : t(which === "customer" ? "parties.newCustomer" : "parties.newSupplier")}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("parties.name")} error={errors.name} htmlFor="p-name">
            <Input id="p-name" value={form.name} onChange={(e) => set("name", e.target.value)} aria-invalid={!!errors.name} autoFocus />
          </Field>
          <Field label={t("parties.nameAr")} htmlFor="p-name-ar">
            <Input id="p-name-ar" dir="rtl" value={form.nameAr} onChange={(e) => set("nameAr", e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isCustomer} onChange={(e) => set("isCustomer", e.target.checked)} className="size-4 accent-[var(--accent)]" />
            {t("parties.isCustomer")}
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={form.isSupplier} onChange={(e) => set("isSupplier", e.target.checked)} className="size-4 accent-[var(--accent)]" />
            {t("parties.isSupplier")}
          </label>
          {errors.isCustomer && <p className="w-full text-xs text-danger">{errors.isCustomer}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("parties.contact")} htmlFor="p-contact">
            <Input id="p-contact" value={form.contactName} onChange={(e) => set("contactName", e.target.value)} />
          </Field>
          <Field label={t("parties.phone")} htmlFor="p-phone">
            <Input id="p-phone" dir="ltr" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+974 …" />
          </Field>
          <Field label={t("parties.email")} error={errors.email} htmlFor="p-email">
            <Input id="p-email" dir="ltr" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label={t("parties.cr")} htmlFor="p-cr">
            <Input id="p-cr" dir="ltr" value={form.crNumber} onChange={(e) => set("crNumber", e.target.value)} />
          </Field>
        </div>
        <Field label={t("parties.address")} htmlFor="p-address">
          <Input id="p-address" value={form.address} onChange={(e) => set("address", e.target.value)} placeholder={t("ws.addressPlaceholder")} />
        </Field>
        <Field label={t("parties.addressAr")} htmlFor="p-address-ar">
          <Input id="p-address-ar" dir="rtl" value={form.addressAr} onChange={(e) => set("addressAr", e.target.value)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t("parties.terms")} hint={t("parties.termsHint")} htmlFor="p-terms">
            <Input id="p-terms" type="number" min={0} max={365} dir="ltr" value={form.paymentTerms} onChange={(e) => set("paymentTerms", Math.max(0, Math.min(365, Number(e.target.value) || 0)))} />
          </Field>
          {form.isCustomer && (
            <Field label={t("parties.creditLimit")} hint={t("common.optional")} htmlFor="p-limit">
              <Input id="p-limit" dir="ltr" inputMode="decimal" value={form.creditLimit} onChange={(e) => set("creditLimit", e.target.value)} />
            </Field>
          )}
        </div>
        <Field label={t("parties.notes")} htmlFor="p-notes">
          <Textarea id="p-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Sheet>
  );
}
