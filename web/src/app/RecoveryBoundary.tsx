/**
 * Boundary de raiz — a rede que faltava embaixo do render.
 *
 * Sem um `componentDidCatch` em algum lugar, o React desmonta a arvore INTEIRA
 * quando um render estoura, e `#root` fica vazio para sempre. E a tela em branco
 * que aparecia ao voltar para a aba depois de o navegador congelar ou descartar
 * a pagina: nao ha caminho de volta pela propria interface, porque nao sobra
 * interface nenhuma.
 *
 * A resposta e recarregar — mas com orcamento (`lib/recovery.ts`). Um erro que
 * se repete no boot viraria um laco de recarga, e laco de recarga e pior que
 * tela quebrada: nem da tempo de abrir o devtools. Esgotado o orcamento, a
 * pessoa ve esta tela e decide.
 *
 * O fallback e escrito com `div` e `button` crus, fora da cascata do Motion UI,
 * e isso e deliberado: o catalogo nao tem um estado de erro terminal, e o que
 * acabou de estourar pode ter sido justamente um componente animado — uma tela
 * de recuperacao que depende do que quebrou nao recupera nada.
 */
import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import { RotateCcw, Unplug } from "lucide-react";

import { t } from "@/i18n";
import { claimAutoReload } from "@/lib/recovery";

/** Respiro antes de recarregar, para o erro chegar ao console do navegador. */
const RELOAD_DELAY_MS = 400;

interface RecoveryBoundaryProps {
  children: ReactNode;
}

interface RecoveryBoundaryState {
  error: Error | null;
  reloading: boolean;
}

export class RecoveryBoundary extends Component<RecoveryBoundaryProps, RecoveryBoundaryState> {
  state: RecoveryBoundaryState = { error: null, reloading: false };
  private timer: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: Error): Partial<RecoveryBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // O console do NAVEGADOR, nao o do app: aquele vive dentro da arvore que
    // acabou de morrer, e mandar a mensagem para la seria enterra-la junto.
    console.error("[gitcraque] o render quebrou", error, info.componentStack);
    if (!claimAutoReload()) return;
    this.setState({ reloading: true });
    this.timer = setTimeout(() => location.reload(), RELOAD_DELAY_MS);
  }

  componentWillUnmount() {
    if (this.timer) clearTimeout(this.timer);
  }

  private readonly reload = () => location.reload();

  render() {
    const { error, reloading } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="grid h-full place-items-center bg-background p-8 text-foreground">
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          {reloading ? (
            <RotateCcw className="size-7 animate-spin text-muted-foreground" />
          ) : (
            <Unplug className="size-7 text-destructive" />
          )}
          <h1 className="font-heading text-lg">
            {reloading ? t("recovery.reloading") : t("recovery.title")}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{t("recovery.body")}</p>
          {/* A mensagem da excecao fica crua, como o motor JavaScript a emitiu.
              Traduzir erro de runtime seria inventar o que de fato aconteceu. */}
          <p className="max-w-full break-words font-mono text-xs text-muted-foreground/80">
            {error.message}
          </p>
          {!reloading && (
            <button
              type="button"
              onClick={this.reload}
              className="mt-1 inline-flex items-center gap-2 rounded-md border border-transparent bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-opacity duration-[var(--motion-ui-transition-snap-duration)] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <RotateCcw className="size-4" />
              {t("recovery.reload")}
            </button>
          )}
        </div>
      </main>
    );
  }
}
