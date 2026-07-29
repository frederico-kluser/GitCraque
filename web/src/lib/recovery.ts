/**
 * Sobrevivencia da aba: o que precisa atravessar um congelamento ou um descarte
 * do navegador.
 *
 * O Chrome tem dois jeitos de economizar recurso numa aba de fundo, e eles
 * quebram o app de maneiras diferentes:
 *
 *  - CONGELAR (tab freezing / Energy Saver). O estado em memoria continua vivo,
 *    mas as filas de tarefa param. Timer nao dispara — entao o backoff de
 *    reconexao do `lib/ws.ts` fica parado no ar — e o WebSocket pode voltar
 *    meio-aberto: `readyState === OPEN` com a conexao ja morta do outro lado.
 *  - DESCARTAR (Memory Saver). A pagina e apagada da memoria. O titulo continua
 *    na barra e voltar para a aba faz o navegador recarregar tudo do zero.
 *    `beforeunload` e `unload` NAO disparam nesse caminho — por isso o retrato
 *    daqui e gravado quando a aba fica escondida, nunca na saida.
 *
 * Duas coisas moram aqui, as duas puras e sem React:
 *
 *  1. o orcamento de recarga automatica, que impede "recarrega sozinho" de
 *     virar um laco infinito de recarga;
 *  2. o retrato da view, para que voltar de um descarte nao caia num app em
 *     branco no meio do repositorio.
 *
 * `sessionStorage` e de proposito: ele sobrevive ao descarte (e a MESMA aba) e
 * morre quando a aba fecha — que e exatamente a validade destes dois dados.
 * `localStorage` vazaria de uma aba para outra e daria retrato trocado a quem
 * abre dois repositorios lado a lado.
 *
 * Nada aqui roda no carregamento do modulo: `web/src/graph/__tests__` empacota
 * a `GraphView` com esbuild e alcanca este arquivo pelo store, sem navegador.
 */
import type { OpenFile, Selection } from "@/state/store";

const RELOAD_KEY = "gitcraque.recovery";
const SNAPSHOT_KEY = "gitcraque.view";

/** Recargas automaticas permitidas dentro da janela. */
export const MAX_AUTO_RELOADS = 2;

/** Passou disto sem incidente, o orcamento de recarga zera. */
export const RELOAD_WINDOW_MS = 60_000;

interface ReloadBudget {
  count: number;
  last: number;
}

/** Retrato do que a pessoa estava olhando quando a aba saiu de cena. */
export interface ViewSnapshot {
  /** diretorio do servidor no momento do retrato; so restaura se ainda bater */
  cwd: string;
  selection: Selection;
  openFile: OpenFile | null;
}

/* ------------------------------------------------------------------ */
/* Acesso ao armazenamento — sempre defensivo                          */
/* ------------------------------------------------------------------ */

/**
 * O proprio acesso a `sessionStorage` pode ESTOURAR, nao so devolver vazio:
 * navegador com armazenamento bloqueado por politica lanca `SecurityError` na
 * leitura da propriedade, antes de qualquer metodo ser chamado.
 */
function box(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  const store = box();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  const store = box();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    /* cota estourada: perder o retrato e melhor que estourar no caminho */
  }
}

function drop(key: string) {
  const store = box();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* idem */
  }
}

/* ------------------------------------------------------------------ */
/* Orcamento de recarga automatica                                     */
/* ------------------------------------------------------------------ */

/**
 * Pede permissao para recarregar a pagina sozinho, e ja debita do orcamento.
 *
 * Recarregar e a unica saida quando a arvore do React morre — nao sobra
 * componente vivo para remontar nada. Mas um erro que se repete no boot
 * transformaria isso num laco de recarga, e um laco de recarga e PIOR que uma
 * tela quebrada: nem da tempo de abrir o devtools. Dai o teto.
 *
 * Sem armazenamento a resposta e `false`, nunca `true`: nao havendo onde contar,
 * qualquer recarga automatica seria a primeira de infinitas. O caminho manual
 * (o botao da tela de recuperacao) continua valendo.
 */
export function claimAutoReload(now = Date.now()): boolean {
  if (!box()) return false;
  const saved = readJson<ReloadBudget>(RELOAD_KEY);
  const budget =
    saved && typeof saved.count === "number" && now - saved.last < RELOAD_WINDOW_MS
      ? saved
      : { count: 0, last: now };
  if (budget.count >= MAX_AUTO_RELOADS) return false;
  writeJson(RELOAD_KEY, { count: budget.count + 1, last: now });
  return true;
}

/** Quantas recargas automaticas ainda cabem — so para a tela de recuperacao. */
export function autoReloadsLeft(now = Date.now()): number {
  const saved = readJson<ReloadBudget>(RELOAD_KEY);
  if (!saved || now - saved.last >= RELOAD_WINDOW_MS) return MAX_AUTO_RELOADS;
  return Math.max(0, MAX_AUTO_RELOADS - saved.count);
}

/** O app ficou de pe tempo suficiente: o que aconteceu antes nao conta mais. */
export const clearAutoReloads = () => drop(RELOAD_KEY);

/* ------------------------------------------------------------------ */
/* Retrato da view                                                     */
/* ------------------------------------------------------------------ */

export const saveViewSnapshot = (snapshot: ViewSnapshot) => writeJson(SNAPSHOT_KEY, snapshot);

export const clearViewSnapshot = () => drop(SNAPSHOT_KEY);

/**
 * Le o retrato de volta.
 *
 * Valida campo a campo porque o que sai do armazenamento e JSON de origem
 * desconhecida: uma versao anterior do app, ou outra aba escrevendo por engano.
 * Formato estranho vira `null`, e o app abre no estado inicial de sempre.
 */
export function readViewSnapshot(): ViewSnapshot | null {
  const raw = readJson<Partial<ViewSnapshot>>(SNAPSHOT_KEY);
  if (!raw || typeof raw.cwd !== "string" || !raw.cwd) return null;

  const selection = raw.selection;
  if (!selection || !Array.isArray(selection.commits)) return null;
  const commits = selection.commits.filter((h): h is string => typeof h === "string");

  const file = raw.openFile;
  const openFile: OpenFile | null =
    file && typeof file.path === "string"
      ? {
          path: file.path,
          hash: typeof file.hash === "string" ? file.hash : null,
          fromWorkingTree: file.fromWorkingTree === true,
        }
      : null;

  return {
    cwd: raw.cwd,
    selection: {
      commits,
      primary: typeof selection.primary === "string" ? selection.primary : null,
      ref: typeof selection.ref === "string" ? selection.ref : null,
    },
    openFile,
  };
}

/* ------------------------------------------------------------------ */
/* Sinais do navegador                                                 */
/* ------------------------------------------------------------------ */

/**
 * `document.wasDiscarded` — o navegador apagou esta pagina da memoria e esta
 * carga e a reconstrucao dela. Ainda nao esta na `lib.dom` do TypeScript, dai o
 * acesso por interseccao em vez de `any`.
 */
export function wasDiscarded(): boolean {
  if (typeof document === "undefined") return false;
  return (document as Document & { wasDiscarded?: boolean }).wasDiscarded === true;
}

/**
 * A arvore do React sumiu do DOM.
 *
 * E o sintoma exato de um render que estourou sem boundary: o React desmonta a
 * raiz inteira e `#root` fica vazio para sempre. Vale como diagnostico
 * independente do boundary, porque um estouro ACIMA dele — no provedor de tema
 * ou na troca de idioma — cai fora do alcance dele e deixa a mesma tela vazia.
 */
export function rootIsEmpty(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.getElementById("root");
  return !root || root.childElementCount === 0;
}
