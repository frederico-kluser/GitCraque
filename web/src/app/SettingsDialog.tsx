/**
 * Configuracoes — o unico lugar de preferencia da PESSOA, nao do repositorio.
 *
 * Quatro secoes: idioma, tema, a rotina automatica de fetch e a chave da
 * OpenRouter. As duas primeiras vieram da toolbar, que ficou com a engrenagem
 * no lugar dos dois botoes; as duas ultimas nasceram aqui.
 *
 * Mora em `app/` e nao em `dialogs/` de proposito: aquele diretorio pertence a
 * frente de drag-and-drop e guarda os dialogos que uma INTENCAO de arrasto
 * abre. Este nao confirma operacao nenhuma — nada aqui roda git — entao
 * tambem nao passa pelo `askConfirm`/`ConfirmHost`, que existe para o outro
 * caso: ver o argv antes de executar.
 *
 * CASCATA: a mecanica de overlay vem inteira do catalogo (`Backdrop`,
 * `useFocusTrap`, `useScrollLock`) e o botao de estado do `MultiStateButton`,
 * exatamente como o `ConfirmHost` faz. O que faltou no catalogo, e por isso
 * esta escrito aqui, sao os CONTROLES DE FORMULARIO: o Motion UI nao instala
 * nenhum.
 *
 * Escada de z-index: `z-[60]`, a mesma do dialogo de confirmacao — cobre a
 * area de IA (`z-40`) e o ActionMenu (`z-50`), e e coberto pelo menu de
 * contexto (`z-[80]`), que precisa abrir sobre qualquer coisa.
 */
import { useCallback, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, KeyRound, Loader2, RefreshCw, X } from "lucide-react";

import { Backdrop, useFocusTrap, useScrollLock } from "@/components/motion-ui/overlay";
import { MultiStateButton } from "@/components/motion-ui/multi-state-button";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import {
  AUTO_FETCH_OPTIONS,
  closeSettings,
  selectSettingsOpen,
  setAutoFetchMs,
  setTheme,
  useShellState,
} from "@/hooks";
import type { ThemeMode } from "@/hooks";
import { LOCALE_OPTIONS, chooseLocale, t, useLocale } from "@/i18n";
import { cn } from "@/lib/utils";
import { clearAiKey, saveAiKey, selectAi, useAppState } from "@/state/store";
import type { AiKeySource } from "@/types/git";
import { FOCUS_RING, SectionLabel, ToolButton } from "@/panels/parts";

const INPUT_CLASS = cn(
  "w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground",
  "placeholder:text-muted-foreground",
  FOCUS_RING,
);

/* ------------------------------------------------------------------ */
/* Pecas                                                               */
/* ------------------------------------------------------------------ */

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>{label}</SectionLabel>
      {children}
      {hint && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  label: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INPUT_CLASS, "appearance-none pr-7")}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

/** O rotulo de cada intervalo. `0` e "Desligado" e faz as vezes de liga/desliga. */
function autoFetchLabel(ms: number): string {
  if (ms === 0) return t("settings.autoFetch.off");
  if (ms < 60_000) return t("settings.autoFetch.seconds", { count: ms / 1_000 });
  return t("settings.autoFetch.minutes", { count: ms / 60_000 });
}

/** De onde a chave veio — um 401 sem isso vira adivinhacao entre tres camadas. */
function sourceLabel(source: AiKeySource): string {
  if (source === "stored") return t("settings.ai.source.stored");
  if (source === "env") return t("settings.ai.source.env");
  if (source === "env-file") return t("settings.ai.source.envFile");
  return t("settings.ai.source.none");
}

/* ------------------------------------------------------------------ */
/* Secao da chave de IA                                                */
/* ------------------------------------------------------------------ */

/**
 * Mostra a mascara e permite trocar ou remover. A chave em si nunca volta do
 * servidor, entao nao ha como preencher o campo com a atual — trocar e sempre
 * colar uma nova por inteiro.
 */
function AiSection() {
  const ai = useAppState(selectAi);
  const [editing, setEditing] = useState(false);
  const [key, setKey] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [error, setError] = useState("");

  const run = useCallback((action: () => Promise<void>) => {
    setState("saving");
    setError("");
    void action()
      .then(() => {
        setState("idle");
        setEditing(false);
        setKey("");
      })
      .catch((e: unknown) => {
        setState("error");
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

  const busy = state === "saving";

  return (
    <Row
      label={t("settings.ai.title")}
      hint={
        // A inversao vale a explicacao: o que a pessoa grava aqui GANHA da
        // variavel de ambiente (`server/src/ai/key.mjs:8-20`), porque a
        // variavel esquecida num `.zshrc` costuma ser a velha.
        ai.keySource === "env" || ai.keySource === "env-file"
          ? t("settings.ai.envHint")
          : t("settings.ai.hint")
      }
    >
      {!editing && (
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border",
              "bg-surface-inset px-2.5 py-1.5 font-mono text-xs",
              ai.hasKey ? "text-foreground" : "text-muted-foreground",
            )}
          >
            <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{ai.hasKey ? ai.masked : t("settings.ai.absent")}</span>
            <span className="ml-auto shrink-0 font-sans text-[10px] text-muted-foreground">
              {sourceLabel(ai.keySource)}
            </span>
          </span>
          <ToolButton size="sm" onClick={() => setEditing(true)} disabled={busy}>
            {ai.hasKey ? t("settings.ai.change") : t("settings.ai.add")}
          </ToolButton>
          {/* Remover so aparece quando ha o que remover: com a chave vindo do
              ambiente, apagar o arquivo gravado nao muda nada. */}
          {ai.keySource === "stored" && (
            <ToolButton
              size="sm"
              tone="danger"
              disabled={busy}
              onClick={() => run(() => clearAiKey())}
            >
              {t("settings.ai.remove")}
            </ToolButton>
          )}
        </div>
      )}

      {editing && (
        <div className="flex items-center gap-2">
          <input
            type="password"
            autoFocus
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              if (state === "error") setState("idle");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && key.trim()) run(() => saveAiKey(key.trim()));
              if (e.key === "Escape") {
                setEditing(false);
                setKey("");
              }
            }}
            disabled={busy}
            placeholder={t("ai.locked.placeholder")}
            aria-label={t("ai.locked.placeholder")}
            className={cn(INPUT_CLASS, "min-w-0 flex-1 font-mono placeholder:font-sans")}
          />
          <MultiStateButton
            state={state}
            onClick={() => key.trim() && run(() => saveAiKey(key.trim()))}
            disabled={busy || !key.trim()}
            feedback={state === "error" ? "shake" : "none"}
            icon={busy ? <Loader2 className="size-3.5 animate-spin" /> : undefined}
            surfaceClassName={
              state === "error"
                ? "bg-destructive text-destructive-foreground"
                : "bg-primary text-primary-foreground"
            }
            pillClassName="rounded-md px-3 py-1.5 text-[11px] font-medium"
            announce={t("common.save")}
            aria-label={t("common.save")}
          >
            {busy ? t("common.running") : t("common.save")}
          </MultiStateButton>
          <ToolButton
            size="sm"
            tone="ghost"
            disabled={busy}
            onClick={() => {
              setEditing(false);
              setKey("");
            }}
          >
            {t("common.cancel")}
          </ToolButton>
        </div>
      )}

      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </Row>
  );
}

/* ------------------------------------------------------------------ */
/* O host                                                              */
/* ------------------------------------------------------------------ */

export function SettingsDialog() {
  const open = useShellState(selectSettingsOpen);
  return <AnimatePresence>{open && <SettingsPanel />}</AnimatePresence>;
}

function SettingsPanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const enter = useMotionUITransition("ui");
  const titleId = useId();

  const locale = useLocale();
  const theme = useShellState((s) => s.theme);
  const autoFetchMs = useShellState((s) => s.autoFetchMs);

  useScrollLock(true);
  useFocusTrap({ active: true, container: panelRef, onEscape: closeSettings });

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <Backdrop
        className="bg-[color-mix(in_srgb,var(--background)_70%,transparent)]"
        onClick={closeSettings}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ ...enter }}
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ opacity: 0, transform: "translateY(12px) scale(0.98)" }}
        animate={{ opacity: 1, transform: "translateY(0px) scale(1)" }}
        exit={{ opacity: 0, transform: "translateY(8px) scale(0.99)" }}
        transition={{ ...enter }}
        className={cn(
          "relative z-10 flex w-full max-w-lg flex-col gap-5 rounded-xl border border-border",
          "max-h-[85vh] overflow-y-auto bg-card p-5 shadow-2xl",
        )}
      >
        <header className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="font-heading text-sm font-semibold text-foreground">
              {t("settings.title")}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {t("settings.subtitle")}
            </p>
          </div>
          <ToolButton
            tone="ghost"
            size="sm"
            aria-label={t("settings.close")}
            icon={<X className="size-3.5" />}
            onClick={closeSettings}
          />
        </header>

        {/* Cada idioma escrito NO PROPRIO idioma: quem abre isto pode nao ler o
            idioma corrente, e "Portugues" em chines nao ajudaria ninguem. */}
        <Row label={t("language.label")}>
          <Select
            label={t("language.change")}
            value={locale}
            onChange={(next) => chooseLocale(next as (typeof LOCALE_OPTIONS)[number]["value"])}
            options={LOCALE_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} · ${o.tag}` }))}
          />
        </Row>

        <Row label={t("settings.theme")}>
          <Select
            label={t("settings.theme")}
            value={theme}
            onChange={(next) => setTheme(next as ThemeMode)}
            options={[
              { value: "dark", label: t("settings.theme.dark") },
              { value: "light", label: t("settings.theme.light") },
            ]}
          />
        </Row>

        <Row label={t("settings.autoFetch")} hint={t("settings.autoFetch.hint")}>
          <div className="flex items-center gap-2">
            <RefreshCw className="size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <Select
                label={t("settings.autoFetch")}
                value={String(autoFetchMs)}
                onChange={(next) => setAutoFetchMs(Number(next))}
                options={AUTO_FETCH_OPTIONS.map((ms) => ({
                  value: String(ms),
                  label: autoFetchLabel(ms),
                }))}
              />
            </div>
          </div>
        </Row>

        <AiSection />
      </motion.div>
    </div>,
    document.body,
  );
}
