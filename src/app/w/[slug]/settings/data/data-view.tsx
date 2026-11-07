"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CopyPlus, DatabaseBackup, Download, FlaskConical, Link2, Loader2, RotateCcw, Sprout, Upload, X } from "lucide-react";
import { useI18n } from "@/components/providers";
import { Card } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/controls";
import { PageHeader } from "@/components/ui/page-header";
import { pick, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/cn";
import { duplicateWorkspace } from "@/app/actions/workspace";
import { revokeShareLink } from "@/app/actions/share";

interface Link {
  id: string;
  title: string;
  views: number;
  createdAt: string;
  expiresAt: string | null;
  state: string;
  by: string;
  byAr: string | null;
}

function Choice({ active, onClick, icon, title, desc }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; desc: string }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("flex items-start gap-3 rounded-2xl border p-3.5 text-start transition", active ? "border-accent bg-accent-soft/50 ring-4 ring-[var(--ring)]/10" : "border-line hover:bg-sunken")}>
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", active ? "bg-accent text-accent-fg" : "bg-sunken text-muted")}>{icon}</span>
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
    </button>
  );
}

async function saveBlob(res: Response, fallback: string) {
  const blob = await res.blob();
  const name = res.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? fallback;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function DataView({ slug, orgName, now, links }: { slug: string; orgName: string; now: string; links: Link[] }) {
  const { t, fmt, locale } = useI18n();
  const router = useRouter();
  // Backup
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);
  const [backingUp, setBackingUp] = useState(false);
  // Restore
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [restorePassword, setRestorePassword] = useState("");
  const [mode, setMode] = useState<"new" | "replace">("new");
  const [confirm, setConfirm] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restored, setRestored] = useState<{ slug: string; name: string } | null>(null);
  // Duplicate
  const [dupMode, setDupMode] = useState<"sandbox" | "structure">("sandbox");
  const [dupName, setDupName] = useState(`${orgName} (sandbox)`);
  const [duplicating, startDup] = useTransition();
  const [duplicated, setDuplicated] = useState<{ slug: string; name: string } | null>(null);
  const [, startRevoke] = useTransition();

  async function backup(pw?: string) {
    setBackingUp(true);
    const body = new FormData();
    if (pw) body.append("password", pw);
    body.append("includeFiles", String(includeFiles));
    const res = await fetch(`/api/w/${slug}/backup`, { method: "POST", body });
    setBackingUp(false);
    if (!res.ok) return void toast.error(t("errors.generic"));
    await saveBlob(res, `${slug}.tamam`);
  }

  async function restore() {
    if (!file) return;
    setRestoring(true);
    setRestoreError(null);
    if (mode === "replace") await backup(); // safety copy on this device too
    const body = new FormData();
    body.append("file", file);
    body.append("password", restorePassword);
    body.append("mode", mode);
    body.append("confirm", confirm);
    const res = await fetch(`/api/w/${slug}/restore`, { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    setRestoring(false);
    if (!res.ok) return setRestoreError(t((json.error ?? "errors.generic") as MessageKey));
    setRestored(json);
    toast.success(t("data.restored", { name: json.name }));
    if (mode === "replace") router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title={t("data.title")} subtitle={t("data.subtitle")} className="mb-2" />

      <Card className="p-[var(--pad)] sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <DatabaseBackup className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">{t("data.backupTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted">{t("data.backupBody")}</p>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          <Switch label={t("data.password")} checked={usePassword} onChange={setUsePassword} />
          {usePassword && (
            <Field label={t("auth.password")} hint={t("data.passwordHint")} htmlFor="bk-pw">
              <Input id="bk-pw" type="password" autoComplete="new-password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} className="max-w-sm" />
            </Field>
          )}
          <Switch label={t("data.includeFiles")} checked={includeFiles} onChange={setIncludeFiles} />
          <Button onClick={() => backup(usePassword ? password : undefined)} disabled={backingUp || (usePassword && password.length < 6)}>
            {backingUp ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />} {backingUp ? t("data.preparing") : t("data.download")}
          </Button>
        </div>
      </Card>

      <Card className="p-[var(--pad)] sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <RotateCcw className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">{t("data.restoreTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted">{t("data.restoreBody")}</p>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" /> {t("data.chooseFile")}
            </Button>
            {file && (
              <span className="text-sm text-muted" dir="ltr">
                {file.name} · {fmt.number(Math.round(file.size / 1024))} KB
              </span>
            )}
            <input ref={fileRef} type="file" accept=".tamam,application/zip,application/octet-stream" hidden onChange={(e) => (setFile(e.target.files?.[0] ?? null), setRestored(null), setRestoreError(null), (e.target.value = ""))} />
          </div>
          {file && (
            <>
              <Field label={`${t("auth.password")} (${t("common.optional")})`} htmlFor="rs-pw">
                <Input id="rs-pw" type="password" dir="ltr" value={restorePassword} onChange={(e) => setRestorePassword(e.target.value)} className="max-w-sm" />
              </Field>
              <div className="grid gap-2 sm:grid-cols-2">
                <Choice active={mode === "new"} onClick={() => setMode("new")} icon={<CopyPlus className="size-4" />} title={t("data.asNew")} desc={t("data.asNewDesc")} />
                <Choice active={mode === "replace"} onClick={() => setMode("replace")} icon={<RotateCcw className="size-4" />} title={t("data.replace")} desc={t("data.replaceDesc")} />
              </div>
              {mode === "replace" && (
                <Field label={t("data.typeToConfirm", { name: orgName })} htmlFor="rs-confirm">
                  <Input id="rs-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="max-w-sm" />
                </Field>
              )}
              {restoreError && <p className="text-sm text-danger">{restoreError}</p>}
              <Button variant={mode === "replace" ? "danger" : "primary"} onClick={restore} disabled={restoring || (mode === "replace" && confirm.trim() !== orgName)}>
                {restoring ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} {restoring ? t("data.restoring") : t("data.restore")}
              </Button>
              {restored && (
                <p className="text-sm text-success">
                  {t("data.restored", { name: restored.name })} ·{" "}
                  <Link href={`/w/${restored.slug}`} className="font-medium underline">
                    {t("data.open")}
                  </Link>
                </p>
              )}
            </>
          )}
        </div>
      </Card>

      <Card className="p-[var(--pad)] sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <CopyPlus className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">{t("data.duplicateTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted">{t("data.duplicateBody")}</p>
          </div>
        </div>
        <div className="mt-5 space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <Choice active={dupMode === "sandbox"} onClick={() => (setDupMode("sandbox"), setDupName(`${orgName} (sandbox)`))} icon={<FlaskConical className="size-4" />} title={t("data.sandbox")} desc={t("data.sandboxDesc")} />
            <Choice active={dupMode === "structure"} onClick={() => (setDupMode("structure"), setDupName(`${orgName} ${new Date(now).getFullYear() + 1}`))} icon={<Sprout className="size-4" />} title={t("data.structure")} desc={t("data.structureDesc")} />
          </div>
          <Field label={t("data.newName")} htmlFor="dup-name">
            <Input id="dup-name" value={dupName} onChange={(e) => setDupName(e.target.value)} className="max-w-sm" />
          </Field>
          <Button
            onClick={() =>
              startDup(async () => {
                const res = await duplicateWorkspace(slug, dupMode, dupName);
                if (res.ok) {
                  setDuplicated(res);
                  toast.success(t("data.duplicated", { name: res.name }));
                } else toast.error(t(res.error as MessageKey));
              })
            }
            disabled={duplicating}
          >
            {duplicating ? <Loader2 className="size-4 animate-spin" /> : <CopyPlus className="size-4" />} {duplicating ? t("data.duplicating") : t("data.duplicate")}
          </Button>
          {duplicated && (
            <Link href={`/w/${duplicated.slug}`} className={buttonClass("soft", "sm")}>
              {t("data.open")}: {duplicated.name}
            </Link>
          )}
        </div>
      </Card>

      <Card className="p-[var(--pad)] sm:p-7">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Link2 className="size-5" />
          </span>
          <div>
            <h2 className="font-semibold">{t("data.linksTitle")}</h2>
            <p className="mt-0.5 text-sm text-muted">{t("data.linksBody")}</p>
          </div>
        </div>
        {links.length === 0 ? (
          <p className="mt-4 text-sm text-muted">{t("data.noLinks")}</p>
        ) : (
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-3.5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.title}</p>
                  <p className="text-xs text-muted">
                    {pick(locale, l.by, l.byAr)} · {fmt.relative(l.createdAt, new Date(now))} · {t("data.views", { count: fmt.number(l.views) })} · {l.expiresAt ? t("share.expiresOn", { date: fmt.date(l.expiresAt) }) : t("data.neverExpires")}
                  </p>
                </div>
                <Badge tone={l.state === "active" ? "success" : "neutral"}>{l.state === "active" ? t("data.active") : l.state === "expired" ? t("data.expired") : t("data.revokedState")}</Badge>
                {l.state === "active" && (
                  <Button variant="ghost" size="sm" onClick={() => startRevoke(async () => void ((await revokeShareLink(slug, l.id)).ok && toast.success(t("members.revoked"))))}>
                    <X className="size-3.5" /> {t("members.revoke")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
