"use client";

import { useMemo, useState, useTransition } from "react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { Activity, Check, ExternalLink, Eye, EyeOff, KeyRound, Loader2, PlugZap, ShieldCheck, Sparkles, Users, Wallet } from "lucide-react";
import { useI18n } from "@/components/providers";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Segmented, Switch } from "@/components/ui/controls";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { FlowAvatar } from "@/components/flow/avatar";
import { DataToolbar } from "@/components/data/toolbar";
import type { DatasetResult } from "@/lib/datasets/types";
import { cn } from "@/lib/cn";
import type { MessageKey } from "@/lib/i18n";
import type { Role } from "@/lib/rbac";
import { CLAUDE_MODELS, FLOW_AVATARS, FLOW_PROVIDERS, FLOW_TONES, PROVIDERS, microsToDirhams, type FlowAvatar as AvatarId, type FlowEffort, type FlowTone } from "@/lib/flow/models";
import { removeFlowKey, saveFlowKey, saveFlowSettings, testFlowConnection, type TestResult } from "@/app/actions/flow-settings";

interface Config {
  enabled: boolean;
  provider: string;
  model: string;
  baseUrl: string;
  hasKey: boolean;
  keyHint: string | null;
  keySetAt: string | null;
  keySetBy: string | null;
  effort: FlowEffort;
  priceIn: number | null;
  priceOut: number | null;
  monthlyLimit: number | null;
  roles: Role[];
  name: string;
  avatar: AvatarId;
  tone: FlowTone;
}

interface Usage {
  month: string;
  nextMonth: string;
  micros: number;
  unpriced: number;
  daily: { day: number; micros: number }[];
  people: { id: string; name: string; color: string | null; steps: number; chats: number; tokensIn: number; tokensOut: number; micros: number }[];
  models: { model: string; steps: number; micros: number }[];
  months: { month: string; micros: number }[];
}

export function FlowSettingsView({ slug, config, usage, roles, scripted, secretOk, usageTable, usageQuery, canShare }: { slug: string; config: Config; usage: Usage; roles: Role[]; scripted: boolean; secretOk: boolean; usageTable: DatasetResult; usageQuery: string; canShare: boolean }) {
  const { t, fmt } = useI18n();
  const usd = (micros: number) => `$${fmt.number(micros / 1_000_000, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const qar = (micros: number) => fmt.money(microsToDirhams(micros), { decimals: true });
  const status = !config.enabled ? "off" : config.hasKey ? "on" : "nokey";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <FlowAvatar avatar={config.avatar} className="size-10 rounded-xl" />
            {t("flowSettings.title")}
            <Badge tone={status === "on" ? "success" : status === "off" ? "neutral" : "warning"}>{t(status === "on" ? "flowSettings.statusOn" : status === "off" ? "flowSettings.statusOff" : "flowSettings.statusNoKey")}</Badge>
          </span>
        }
        subtitle={t("flowSettings.subtitle")}
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Connection slug={slug} config={config} scripted={scripted} secretOk={secretOk} />
          <Spending slug={slug} config={config} usage={usage} usd={usd} qar={qar} toolbar={<DataToolbar slug={slug} dataset="flow-usage" query={usageQuery} result={usageTable} canShare={canShare} />} />
        </div>
        <div className="space-y-6">
          <OnOff slug={slug} enabled={config.enabled} />
          <Access slug={slug} config={config} roles={roles} />
          <Persona slug={slug} config={config} />
          <Privacy provider={config.provider} />
        </div>
      </div>
    </div>
  );
}

function useSave(slug: string) {
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const save = (patch: Parameters<typeof saveFlowSettings>[1], quiet = false) =>
    start(async () => {
      const r = await saveFlowSettings(slug, patch);
      if (r.ok) {
        if (!quiet) toast.success(t("flowSettings.saved"));
      }
      else toast.error(t(r.error as MessageKey));
    });
  return { pending, save };
}

// ───────────────────────── Connection ─────────────────────────

function Connection({ slug, config, scripted, secretOk }: { slug: string; config: Config; scripted: boolean; secretOk: boolean }) {
  const { t, fmt } = useI18n();
  const [provider, setProvider] = useState(config.provider);
  const [model, setModel] = useState(config.model);
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [effort, setEffort] = useState<FlowEffort>(config.effort);
  const [customPrices, setCustomPrices] = useState(config.priceIn != null);
  const [priceIn, setPriceIn] = useState(config.priceIn?.toString() ?? "");
  const [priceOut, setPriceOut] = useState(config.priceOut?.toString() ?? "");
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, startTest] = useTransition();
  const [keyPending, startKey] = useTransition();
  const { pending, save } = useSave(slug);

  const isClaude = provider === "anthropic";
  const info = provider in PROVIDERS ? PROVIDERS[provider as keyof typeof PROVIDERS] : null;
  const knownClaude = CLAUDE_MODELS.find((m) => m.id === model);
  const needsPrices = !isClaude || !knownClaude || customPrices;
  const switching = provider !== config.provider;
  const keySaved = config.hasKey && !switching && !replacing;

  const changeProvider = (p: string) => {
    setProvider(p);
    setTest(null);
    setModels([]);
    if (p === "anthropic") setModel(config.provider === "anthropic" ? config.model : PROVIDERS.anthropic.defaultModel);
    else if (p === "scripted") setModel("test-model");
    else setModel(p === config.provider ? config.model : "");
  };

  const runTest = () =>
    startTest(async () => {
      const r = await testFlowConnection(slug, { provider, baseUrl, key: key || undefined, model });
      setTest(r);
      if (r.ok) setModels(r.models);
    });

  const storeKey = () =>
    startKey(async () => {
      if (switching) {
        // Save the provider first: switching clears the old provider's key.
        const r0 = await saveFlowSettings(slug, { provider, model: model || PROVIDERS.anthropic.defaultModel, baseUrl });
        if (!r0.ok) return void toast.error(t("errors.generic"));
      }
      const r = await saveFlowKey(slug, key);
      if (!r.ok) return void toast.error(t(r.error as MessageKey));
      setKey("");
      setReplacing(false);
      toast.success(t("flowSettings.keyStored"));
    });

  const saveAll = () => {
    if (!model.trim()) return toast.error(t("errors.required"));
    const pin = needsPrices && priceIn !== "" ? Number(priceIn) : null;
    const pout = needsPrices && priceOut !== "" ? Number(priceOut) : null;
    save({ provider, model: model.trim(), baseUrl: provider === "compatible" ? baseUrl : "", effort, priceIn: pin, priceOut: pout });
  };

  const providerOptions = [...FLOW_PROVIDERS, ...(scripted ? (["scripted"] as const) : [])];

  return (
    <Card>
      <CardHeader title={t("flowSettings.connection")} icon={<PlugZap className="size-4" />} />
      <CardBody className="space-y-5">
        <p className="-mt-2 text-sm text-muted">{t("flowSettings.connectionHint")}</p>
        {!secretOk && <p className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm">{t("flowSettings.keyNeedSecret")}</p>}

        <Field label={t("flowSettings.provider")}>
          <div className="grid gap-2 sm:grid-cols-2">
            {providerOptions.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => changeProvider(p)}
                aria-pressed={provider === p}
                className={cn("flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-start text-sm transition", provider === p ? "border-accent-line bg-accent-soft font-medium" : "border-line hover:bg-sunken")}
              >
                <span className={cn("grid size-5 place-items-center rounded-full border", provider === p ? "border-accent bg-accent text-accent-fg" : "border-line")}>{provider === p && <Check className="size-3" />}</span>
                {p === "scripted" ? "Test provider (scripted, no AI)" : PROVIDERS[p as keyof typeof PROVIDERS].label}
              </button>
            ))}
          </div>
        </Field>

        {provider === "compatible" && (
          <Field label={t("flowSettings.baseUrl")} hint={t("flowSettings.baseUrlHint")} htmlFor="fs-base">
            <Input id="fs-base" dir="ltr" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="https://…/v1" />
          </Field>
        )}

        {provider !== "scripted" && (
          <Field label={t("flowSettings.key")} hint={t("flowSettings.keySafe")} htmlFor="fs-key">
            {keySaved ? (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-sunken/50 px-3.5 py-2.5">
                <KeyRound className="size-4 text-success" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium" dir="ltr">
                    {t("flowSettings.keySaved", { hint: config.keyHint ?? "…" })}
                  </div>
                  {config.keySetBy && config.keySetAt && <div className="text-xs text-muted">{t("flowSettings.keySetBy", { name: config.keySetBy, date: fmt.date(config.keySetAt) })}</div>}
                </div>
                <Button size="sm" variant="secondary" onClick={() => setReplacing(true)}>
                  {t("flowSettings.keyReplace")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (!confirm(t("flowSettings.keyRemoveConfirm"))) return;
                    startKey(async () => {
                      await removeFlowKey(slug);
                      toast.success(t("flowSettings.keyRemoved"));
                    });
                  }}
                >
                  {t("flowSettings.keyRemove")}
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input id="fs-key" dir="ltr" type={showKey ? "text" : "password"} autoComplete="off" spellCheck={false} value={key} onChange={(e) => setKey(e.target.value)} placeholder={info?.keyPlaceholder ?? t("flowSettings.keyPlaceholder")} className="pe-10 font-mono" />
                  <button type="button" onClick={() => setShowKey(!showKey)} className="absolute inset-y-0 end-0 grid w-10 place-items-center text-muted" aria-label={showKey ? "Hide" : "Show"}>
                    {showKey ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                <Button onClick={storeKey} disabled={key.trim().length < 8 || keyPending || !secretOk}>
                  {keyPending && <Loader2 className="size-4 animate-spin" />} {t("flowSettings.save")}
                </Button>
              </div>
            )}
            {info?.keysUrl && !keySaved && (
              <a href={info.keysUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                {t("flowSettings.keyLink")} <ExternalLink className="size-3" />
              </a>
            )}
          </Field>
        )}

        {isClaude ? (
          <Field label={t("flowSettings.model")}>
            <div className="space-y-1.5">
              {CLAUDE_MODELS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setModel(m.id)}
                  aria-pressed={model === m.id}
                  className={cn("flex w-full items-center gap-3 rounded-xl border px-3.5 py-2.5 text-start transition", model === m.id ? "border-accent-line bg-accent-soft" : "border-line hover:bg-sunken")}
                >
                  <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border", model === m.id ? "border-accent bg-accent" : "border-line")}>{model === m.id && <span className="size-1.5 rounded-full bg-accent-fg" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {m.label}
                      {m.note && <Badge tone={m.note === "recommended" ? "accent" : "neutral"}>{t(`flowSettings.note_${m.note}`)}</Badge>}
                    </span>
                    <span className="block text-xs text-muted" dir="ltr">
                      {m.id} · {t("flowSettings.perMillion", { in: fmt.number(m.priceIn / 1e6, { maximumFractionDigits: 2 }), out: fmt.number(m.priceOut / 1e6, { maximumFractionDigits: 2 }) })}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Field>
        ) : (
          <Field label={t("flowSettings.modelCustom")} hint={t("flowSettings.modelCustomHint")} htmlFor="fs-model">
            <div className="flex gap-2">
              <Input id="fs-model" dir="ltr" list="fs-models" value={model} onChange={(e) => setModel(e.target.value)} className="font-mono" />
              <datalist id="fs-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <Button variant="secondary" onClick={runTest} disabled={testing}>
                {testing && <Loader2 className="size-4 animate-spin" />} {t("flowSettings.loadModels")}
              </Button>
            </div>
            {models.length > 0 && <p className="text-xs text-muted">{t("flowSettings.modelsLoaded", { count: fmt.number(models.length) })}</p>}
          </Field>
        )}

        {isClaude && knownClaude?.adaptive && (
          <Field label={t("flowSettings.effort")} hint={t("flowSettings.effortHint")}>
            <Segmented value={effort} onChange={setEffort} label={t("flowSettings.effort")} options={(["low", "medium", "high"] as const).map((e) => ({ value: e, label: t(`flowSettings.effort_${e}`) }))} />
          </Field>
        )}

        {provider !== "scripted" && (
          <div className="space-y-2">
            {isClaude && knownClaude && <Switch checked={customPrices} onChange={setCustomPrices} label={t("flowSettings.customPrices")} />}
            {needsPrices && (
              <div className="rounded-xl border border-line p-3.5">
                <div className="text-sm font-medium">{t("flowSettings.prices")}</div>
                <p className="mt-0.5 text-xs text-muted">{t("flowSettings.pricesHint")}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label={t("flowSettings.priceIn")} htmlFor="fs-pin">
                    <Input id="fs-pin" dir="ltr" inputMode="decimal" value={priceIn} onChange={(e) => setPriceIn(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" />
                  </Field>
                  <Field label={t("flowSettings.priceOut")} htmlFor="fs-pout">
                    <Input id="fs-pout" dir="ltr" inputMode="decimal" value={priceOut} onChange={(e) => setPriceOut(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0.00" />
                  </Field>
                </div>
                {info?.pricingUrl && (
                  <a href={info.pricingUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                    {t("flowSettings.pricesLink")} <ExternalLink className="size-3" />
                  </a>
                )}
              </div>
            )}
          </div>
        )}

        {test && (
          <div className={cn("flex items-start gap-2 rounded-xl px-3 py-2 text-sm", test.ok ? (test.hasModel ? "bg-success/10" : "bg-warning/10") : "bg-danger/10")}>
            {test.ok ? <Check className="mt-0.5 size-4 text-success" /> : <PlugZap className="mt-0.5 size-4 text-danger" />}
            <span>
              {test.ok
                ? test.hasModel
                  ? model
                    ? t("flowSettings.testOkModel")
                    : t("flowSettings.testOk", { count: fmt.number(test.models.length) })
                  : t("flowSettings.testMissingModel", { model })
                : test.code === "nokey"
                  ? t("flowSettings.needKey")
                  : test.code === "auth"
                    ? t("flowSettings.testFail_auth")
                    : test.code === "network"
                      ? t("flowSettings.testFail_network")
                      : test.code === "model"
                        ? t("flowSettings.testFail_model")
                        : t("flowSettings.testFail_other", { message: test.message ?? "" })}
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-4">
          <Button variant="secondary" onClick={runTest} disabled={testing}>
            {testing ? <Loader2 className="size-4 animate-spin" /> : <PlugZap className="size-4" />} {testing ? t("flowSettings.testing") : t("flowSettings.test")}
          </Button>
          <Button onClick={saveAll} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} {t("flowSettings.save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

// ───────────────────────── Spending ─────────────────────────

function Spending({ slug, config, usage, usd, qar, toolbar }: { slug: string; config: Config; usage: Usage; usd: (m: number) => string; qar: (m: number) => string; toolbar: React.ReactNode }) {
  const { t, fmt } = useI18n();
  const [limit, setLimit] = useState(config.monthlyLimit?.toString() ?? "");
  const [none, setNone] = useState(config.monthlyLimit == null);
  const { pending, save } = useSave(slug);
  const limitMicros = config.monthlyLimit != null ? config.monthlyLimit * 1_000_000 : null;
  const pct = limitMicros ? Math.min(100, (usage.micros / limitMicros) * 100) : 0;
  const maxDay = Math.max(1, ...usage.daily.map((d) => d.micros));
  const maxMonth = Math.max(1, ...usage.months.map((m) => m.micros));
  const nonClaudeNoPrices = (config.provider !== "anthropic" || !CLAUDE_MODELS.some((m) => m.id === config.model)) && config.priceIn == null && config.provider !== "scripted";
  const limitNum = Number(limit || 0);

  return (
    <Card>
      <CardHeader title={t("flowSettings.spending")} icon={<Wallet className="size-4" />} />
      <CardBody className="space-y-6">
        <p className="-mt-2 text-sm text-muted">{t("flowSettings.spendingHint")}</p>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="text-xs font-medium tracking-wide text-muted uppercase">{t("flowSettings.thisMonth")}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{usd(usage.micros)}</span>
              <span className="text-sm text-muted">{t("flowSettings.approxQar", { amount: qar(usage.micros) })}</span>
            </div>
            {limitMicros != null ? (
              <>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-sunken">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: "easeOut" }} className={cn("h-full rounded-full", pct >= 100 ? "bg-danger" : pct >= 80 ? "bg-warning" : "bg-accent")} />
                </div>
                <div className="mt-1.5 flex justify-between text-xs text-muted">
                  <span>{t("flowSettings.ofLimit", { limit: usd(limitMicros) })}</span>
                  <span>{t("flowSettings.resets", { date: fmt.date(usage.nextMonth) })}</span>
                </div>
              </>
            ) : (
              <p className="mt-2 text-xs text-muted">{t("flowSettings.noLimitSet")}</p>
            )}
            {usage.unpriced > 0 && <p className="mt-2 text-xs text-warning">{t("flowSettings.unpriced", { count: fmt.number(usage.unpriced) })}</p>}
          </div>
          <div className="space-y-2">
            <Field label={t("flowSettings.limit")} hint={t("flowSettings.limitHint")} htmlFor="fs-limit">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute inset-y-0 start-3 flex items-center text-sm text-subtle">$</span>
                  <Input id="fs-limit" dir="ltr" inputMode="decimal" disabled={none} value={none ? "" : limit} onChange={(e) => setLimit(e.target.value.replace(/[^\d.]/g, ""))} className="ps-7" placeholder="50" />
                </div>
                <Button onClick={() => save({ monthlyLimit: none ? null : limitNum })} disabled={pending || (!none && !limit)}>
                  {pending && <Loader2 className="size-4 animate-spin" />} {t("flowSettings.save")}
                </Button>
              </div>
            </Field>
            {!none && limitNum > 0 && <p className="text-xs text-muted">{t("flowSettings.approxQar", { amount: qar(limitNum * 1_000_000) })}</p>}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={none} onChange={(e) => setNone(e.target.checked)} className="size-4 accent-[var(--accent)]" /> {t("flowSettings.noLimit")}
            </label>
            {!none && nonClaudeNoPrices && <p className="text-xs text-warning">{t("flowSettings.pricesNeeded")}</p>}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium">{t("flowSettings.daily")}</div>
          <div className="flex h-28 items-end gap-[3px]" dir="ltr">
            {usage.daily.map((d, i) => (
              <motion.div
                key={d.day}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(d.micros ? 4 : 1, (d.micros / maxDay) * 100)}%` }}
                transition={{ delay: i * 0.012, duration: 0.5, ease: "easeOut" }}
                title={`${d.day}: ${usd(d.micros)}`}
                className={cn("flex-1 rounded-t-sm", d.micros ? "bg-accent/80" : "bg-sunken")}
              />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[0.7rem] text-subtle" dir="ltr">
            <span>1</span>
            <span>{usage.daily.length}</span>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm font-medium">
              <Users className="size-4 text-muted" /> {t("flowSettings.byPerson")}
            </span>
            {usage.people.length > 0 && toolbar}
          </div>
          {usage.people.length ? (
            <div className="overflow-x-auto rounded-xl border border-line">
              <table className="w-full text-sm">
                <thead className="bg-sunken text-xs text-muted">
                  <tr>
                    <th className="px-3 py-2 text-start font-medium">{t("flowSettings.colPerson")}</th>
                    <th className="px-3 py-2 text-end font-medium">{t("flowSettings.colChats")}</th>
                    <th className="px-3 py-2 text-end font-medium">{t("flowSettings.colCalls")}</th>
                    <th className="hidden px-3 py-2 text-end font-medium sm:table-cell">{t("flowSettings.colTokensIn")}</th>
                    <th className="hidden px-3 py-2 text-end font-medium sm:table-cell">{t("flowSettings.colTokensOut")}</th>
                    <th className="px-3 py-2 text-end font-medium">{t("flowSettings.colCost")}</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.people.map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-2">
                          <Avatar name={p.name} color={p.color} size={24} />
                          {p.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-end tabular-nums">{fmt.number(p.chats)}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{fmt.number(p.steps)}</td>
                      <td className="hidden px-3 py-2 text-end tabular-nums sm:table-cell">{fmt.number(p.tokensIn)}</td>
                      <td className="hidden px-3 py-2 text-end tabular-nums sm:table-cell">{fmt.number(p.tokensOut)}</td>
                      <td className="px-3 py-2 text-end font-medium tabular-nums">{usd(p.micros)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">{t("flowSettings.noUsage")}</p>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm font-medium">
              <Activity className="size-4 text-muted" /> {t("flowSettings.byModel")}
            </div>
            {usage.models.length ? (
              <ul className="space-y-1.5 text-sm">
                {usage.models.map((m) => (
                  <li key={m.model} className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-xs" dir="ltr">{m.model}</span>
                    <span className="tabular-nums">{usd(m.micros)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">—</p>
            )}
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">{t("flowSettings.months")}</div>
            <ul className="space-y-1.5">
              {usage.months.map((m) => (
                <li key={m.month} className="flex items-center gap-2 text-sm">
                  <span className="w-20 shrink-0 text-muted">{fmt.monthShort(`${m.month}-15T12:00:00+03:00`)}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-sunken">
                    <span className="block h-full rounded-full bg-accent/70" style={{ width: `${(m.micros / maxMonth) * 100}%` }} />
                  </span>
                  <span className="w-16 shrink-0 text-end tabular-nums">{usd(m.micros)}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

// ───────────────────────── Side cards ─────────────────────────

function OnOff({ slug, enabled }: { slug: string; enabled: boolean }) {
  const { t } = useI18n();
  const [on, setOn] = useState(enabled);
  const { save } = useSave(slug);
  return (
    <Card>
      <CardBody className="space-y-2">
        <Switch
          checked={on}
          onChange={(v) => {
            setOn(v);
            save({ enabled: v });
          }}
          label={<span className="font-medium">{t("flowSettings.enabled")}</span>}
        />
        <p className="text-xs text-muted">{t("flowSettings.enabledHint")}</p>
      </CardBody>
    </Card>
  );
}

function Access({ slug, config, roles }: { slug: string; config: Config; roles: Role[] }) {
  const { t } = useI18n();
  const [chosen, setChosen] = useState<Role[]>(config.roles);
  const { save } = useSave(slug);
  return (
    <Card>
      <CardHeader title={t("flowSettings.access")} icon={<ShieldCheck className="size-4" />} />
      <CardBody className="space-y-2.5">
        <p className="-mt-1 text-xs text-muted">{t("flowSettings.accessHint")}</p>
        {roles.map((r) => {
          const on = r === "owner" || chosen.includes(r);
          return (
            <label key={r} className={cn("flex items-center gap-2.5 text-sm", r === "owner" && "opacity-70")}>
              <input
                type="checkbox"
                checked={on}
                disabled={r === "owner"}
                onChange={(e) => {
                  const next = e.target.checked ? [...chosen, r] : chosen.filter((x) => x !== r);
                  setChosen(next);
                  save({ roles: next }, true);
                }}
                className="size-4 accent-[var(--accent)]"
              />
              {t(`roles.${r}`)}
              {r === "owner" && <span className="text-xs text-muted">· {t("flowSettings.ownerAlways")}</span>}
            </label>
          );
        })}
      </CardBody>
    </Card>
  );
}

function Persona({ slug, config }: { slug: string; config: Config }) {
  const { t } = useI18n();
  const [name, setName] = useState(config.name);
  const [avatar, setAvatar] = useState<AvatarId>(config.avatar);
  const [tone, setTone] = useState<FlowTone>(config.tone);
  const { pending, save } = useSave(slug);
  const avatars = useMemo(() => FLOW_AVATARS, []);
  return (
    <Card>
      <CardHeader title={t("flowSettings.persona")} icon={<Sparkles className="size-4" />} />
      <CardBody className="space-y-4">
        <p className="-mt-1 text-xs text-muted">{t("flowSettings.personaHint")}</p>
        <Field label={t("flow.name")} htmlFor="fs-name">
          <Input id="fs-name" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div>
          <div className="mb-1.5 text-sm font-medium">{t("flow.avatar")}</div>
          <div className="grid grid-cols-4 gap-2">
            {avatars.map((a) => (
              <button key={a} type="button" onClick={() => setAvatar(a)} aria-pressed={avatar === a} aria-label={t(`flow.avatar_${a}`)} title={t(`flow.avatar_${a}`)} className={cn("grid place-items-center rounded-xl border p-2 transition", avatar === a ? "border-accent-line bg-accent-soft" : "border-line hover:bg-sunken")}>
                <FlowAvatar avatar={a} className="size-8" />
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1.5 text-sm font-medium">{t("flow.tone")}</div>
          <Segmented value={tone} onChange={setTone} label={t("flow.tone")} className="flex w-full flex-wrap" options={FLOW_TONES.map((x) => ({ value: x, label: t(`flow.tone_${x}`) }))} />
          <p className="mt-1.5 text-xs text-muted">“{t(`flow.toneSample_${tone}`)}”</p>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save({ name: name.trim() || "Flow", avatar, tone })} disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" />} {t("flowSettings.save")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function Privacy({ provider }: { provider: string }) {
  const { t } = useI18n();
  void provider;
  return (
    <Card>
      <CardHeader title={t("flowSettings.privacy")} icon={<ShieldCheck className="size-4" />} />
      <CardBody>
        <ul className="space-y-2 text-sm text-muted">
          {(["privacy1", "privacy2", "privacy3", "privacy4", "privacy5"] as const).map((k) => (
            <li key={k} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-success" />
              <span>{t(`flowSettings.${k}`)}</span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
