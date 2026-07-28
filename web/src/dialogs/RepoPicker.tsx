/**
 * Seletor de repositorios da maquina.
 *
 * Serve em dois lugares e por isso tem duas variantes:
 *
 *   variant="page"    a tela inteira, quando o servidor NAO esta num
 *                     repositorio. Antes disso, aquela tela era um beco sem
 *                     saida que mandava o usuario voltar ao terminal.
 *   variant="dialog"  dentro do DialogShell, para trocar de repositorio a
 *                     qualquer momento (toolbar e ⌘K).
 *
 * Tres fontes, em abas: os recentes (persistidos pelo servidor), a varredura
 * das raizes conhecidas, e a navegacao livre por pastas. A caixa de busca
 * filtra as duas primeiras e tambem aceita um caminho digitado — colar
 * `~/code/projeto` e apertar Enter abre direto.
 *
 * Abrir um repositorio e `process.chdir()` no servidor, nunca `git checkout`;
 * o recarregamento vem do evento `cwd:changed`, igual a troca de worktree.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Clock,
  CornerDownLeft,
  FolderGit2,
  FolderOpen,
  HardDriveDownload,
  Loader2,
  Radar,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { fuzzyMatch } from "@/components/motion-ui/command-palette";
import { Skeleton } from "@/components/motion-ui/skeleton";
import {
  SmoothTabs,
  SmoothTabsList,
  SmoothTabsPanel,
  SmoothTabsPanels,
  SmoothTabsTab,
} from "@/components/motion-ui/smooth-tabs";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { api } from "@/lib/api";
import { cn, truncate } from "@/lib/utils";
import { initRepository, openRepository, toast, useAppState } from "@/state/store";
import type {
  DiscoveredRepo,
  FsListPayload,
  FsRootsPayload,
  RecentRepo,
} from "@/types/git";
import { Button, Callout } from "./parts";

export type RepoPickerVariant = "page" | "dialog";

export interface RepoPickerProps {
  variant?: RepoPickerVariant;
  /** chamado depois de abrir um repositorio com sucesso (fecha o dialogo) */
  onOpened?: () => void;
  className?: string;
}

type Aba = "recentes" | "procurar" | "navegar";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** `/home/ana/code/x` -> `~/code/x`, que e como a pessoa pensa no caminho. */
function encurtar(caminho: string, home: string) {
  if (home && caminho === home) return "~";
  if (home && caminho.startsWith(`${home}/`)) return `~${caminho.slice(home.length)}`;
  return caminho;
}

/** Migalhas de pao clicaveis a partir de um caminho absoluto. */
function migalhas(caminho: string, home: string, sep: string) {
  const partes = caminho.split(sep).filter(Boolean);
  const saida: Array<{ label: string; path: string }> = [];
  let acumulado = caminho.startsWith(sep) ? "" : "";
  for (const parte of partes) {
    acumulado = `${acumulado}${sep}${parte}`;
    saida.push({ label: parte, path: acumulado });
  }
  if (caminho.startsWith(sep)) saida.unshift({ label: sep, path: sep });
  // colapsa o inicio quando o caminho esta dentro da pasta pessoal
  if (home && caminho.startsWith(home)) {
    const corte = home.split(sep).filter(Boolean).length;
    const resto = saida.slice(corte + 1);
    return [{ label: "~", path: home }, ...resto];
  }
  return saida;
}

const relativo = (ms: number) => {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min atras`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h atras`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `${d} dias atras`;
};

/* ------------------------------------------------------------------ */
/* Linha da lista                                                      */
/* ------------------------------------------------------------------ */

/**
 * Linha da lista. Escrita a mao porque o catalogo do Motion UI nao tem um item
 * de lista com icone + titulo + caminho em mono + detalhe a direita + acao no
 * hover; `command-palette` chega perto mas o item dele e um comando, sem os
 * dois niveis de texto nem a acao secundaria. O que veio do catalogo aqui e o
 * resto: SmoothTabs nas abas, Skeleton no carregamento, `fuzzyMatch` do
 * command-palette no filtro, e o movimento pelos tokens do tema.
 */
interface LinhaProps {
  icon: React.ReactNode;
  titulo: string;
  caminho: string;
  detalhe?: React.ReactNode;
  ativo?: boolean;
  desabilitado?: boolean;
  selecionado?: boolean;
  onClick: () => void;
  acao?: React.ReactNode;
}

function Linha({
  icon,
  titulo,
  caminho,
  detalhe,
  ativo,
  desabilitado,
  selecionado,
  onClick,
  acao,
}: LinhaProps) {
  const snap = useMotionUITransition("snap");
  return (
    <div
      className={cn(
        "group relative flex items-center gap-3 rounded-md border border-transparent px-3 py-2 text-left",
        selecionado && "border-border bg-accent",
        !desabilitado && "hover:border-border hover:bg-accent",
        desabilitado && "opacity-50",
      )}
    >
      {selecionado ? (
        <motion.span
          layoutId="repo-picker-cursor"
          transition={{ ...snap }}
          className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
        />
      ) : null}
      <button
        type="button"
        disabled={desabilitado}
        onClick={onClick}
        className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
      >
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{titulo}</span>
            {ativo ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                <Check className="size-2.5" /> aberto
              </span>
            ) : null}
          </span>
          <span className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <span className="truncate">{caminho}</span>
          </span>
        </span>
        {detalhe ? (
          <span className="shrink-0 text-[11px] text-muted-foreground">{detalhe}</span>
        ) : null}
      </button>
      {acao}
    </div>
  );
}

function ListaVazia({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-8 text-center text-sm text-muted-foreground">{children}</p>
  );
}

function Esqueleto() {
  return (
    <div className="space-y-2 p-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <Skeleton className="size-4 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-40 rounded" />
            <Skeleton className="h-2.5 w-64 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* O seletor                                                           */
/* ------------------------------------------------------------------ */

export function RepoPicker({ variant = "dialog", onOpened, className }: RepoPickerProps) {
  const cwdAtual = useAppState((s) => s.repo?.cwd ?? null);
  const abrindo = useAppState((s) => s.loading.operation);

  const [aba, setAba] = useState<Aba>("recentes");
  const [busca, setBusca] = useState("");
  const [cursor, setCursor] = useState(0);

  const [recentes, setRecentes] = useState<RecentRepo[] | null>(null);
  const [raizes, setRaizes] = useState<FsRootsPayload | null>(null);

  const [encontrados, setEncontrados] = useState<DiscoveredRepo[] | null>(null);
  const [varrendo, setVarrendo] = useState(false);
  const [varreduraTruncada, setVarreduraTruncada] = useState(false);

  const [pasta, setPasta] = useState<FsListPayload | null>(null);
  const [navegando, setNavegando] = useState(false);
  const [erroPasta, setErroPasta] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const home = raizes?.home ?? pasta?.home ?? "";
  const sep = raizes?.separator ?? pasta?.separator ?? "/";

  /* --- carga inicial --- */
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const [r, roots] = await Promise.all([
        api.recentRepos().catch(() => null),
        api.fsRoots().catch(() => null),
      ]);
      if (!vivo) return;
      setRecentes(r?.entries ?? []);
      setRaizes(roots);
      // Sem recentes, a aba util e a varredura — nao a lista vazia.
      if ((r?.entries.length ?? 0) === 0) setAba("procurar");
    })();
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  /* --- navegacao --- */
  const irPara = useCallback(async (caminho?: string) => {
    setNavegando(true);
    setErroPasta(null);
    try {
      const payload = await api.fsList(caminho);
      setPasta(payload);
      setCursor(0);
    } catch (e) {
      setErroPasta(e instanceof Error ? e.message : String(e));
    } finally {
      setNavegando(false);
    }
  }, []);

  useEffect(() => {
    if (aba === "navegar" && !pasta) void irPara(raizes?.cwd || undefined);
  }, [aba, pasta, irPara, raizes]);

  /* --- varredura --- */
  const varrer = useCallback(async () => {
    setVarrendo(true);
    try {
      const payload = await api.scanRepos({ depth: 4, limit: 200 });
      setEncontrados(payload.repos);
      setVarreduraTruncada(payload.truncated);
      if (payload.repos.length === 0) {
        toast(
          "info",
          "Nenhum repositorio encontrado",
          `${payload.scanned} pastas visitadas em ${payload.elapsedMs} ms — use a aba Navegar`,
        );
      }
    } catch (e) {
      toast("error", "A varredura falhou", e instanceof Error ? e.message : String(e));
    } finally {
      setVarrendo(false);
    }
  }, []);

  useEffect(() => {
    if (aba === "procurar" && encontrados === null && !varrendo) void varrer();
  }, [aba, encontrados, varrendo, varrer]);

  /* --- abrir --- */
  const abrir = useCallback(
    async (caminho: string) => {
      const repo = await openRepository(caminho);
      if (repo) {
        setRecentes(null);
        void api.recentRepos().then((r) => setRecentes(r.entries)).catch(() => {});
        onOpened?.();
      }
    },
    [onOpened],
  );

  const esquecer = useCallback(async (caminho: string) => {
    try {
      const payload = await api.forgetRepo(caminho);
      setRecentes(payload.entries);
    } catch {
      /* falhar em esquecer um recente nao merece interromper ninguem */
    }
  }, []);

  /* --- filtragem ---
   * A caixa acumula dois papeis: filtrar por nome e receber um caminho colado.
   * Quando o texto e um CAMINHO ele nao pode filtrar tambem, senao digitar
   * `/tmp/x` esvazia a lista de `/tmp/x` (nenhuma subpasta se chama assim) e a
   * tela mente dizendo que a pasta esta vazia. */
  const ehCaminho = /^[~/.]|^[A-Za-z]:[\\/]/.test(busca.trim());
  const q = ehCaminho ? "" : busca.trim().toLowerCase();
  const casa = (texto: string) => !q || fuzzyMatch(q, texto.toLowerCase());

  const recentesFiltrados = useMemo(
    () => (recentes ?? []).filter((r) => casa(r.name) || casa(r.path)),
    [recentes, q],
  );
  const encontradosFiltrados = useMemo(
    () => (encontrados ?? []).filter((r) => casa(r.name) || casa(r.path)),
    [encontrados, q],
  );
  const entradasFiltradas = useMemo(
    () => (pasta?.entries ?? []).filter((e) => casa(e.name)),
    [pasta, q],
  );

  /** A busca parece um caminho? Entao Enter abre (ou navega para) ele. */
  const buscaEhCaminho = ehCaminho;

  const lista: Array<{ path: string; isRepo: boolean }> =
    aba === "recentes"
      ? recentesFiltrados.map((r) => ({ path: r.path, isRepo: r.exists }))
      : aba === "procurar"
        ? encontradosFiltrados.map((r) => ({ path: r.path, isRepo: true }))
        : entradasFiltradas.map((e) => ({ path: e.path, isRepo: e.isRepo }));

  useEffect(() => {
    setCursor(0);
  }, [aba, busca]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(0, lista.length - 1)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (buscaEhCaminho) {
        const alvo = busca.trim();
        // Limpa a caixa depois de usar o caminho: ele ja virou navegacao, e
        // deixa-lo ali so confundiria o proximo filtro por nome.
        if (aba === "navegar") void irPara(alvo).then(() => setBusca(""));
        else void abrir(alvo);
        return;
      }
      const alvo = lista[cursor];
      if (!alvo) return;
      if (aba === "navegar" && !alvo.isRepo) void irPara(alvo.path);
      else void abrir(alvo.path);
    } else if (event.key === "Backspace" && !busca && aba === "navegar" && pasta?.parent) {
      event.preventDefault();
      void irPara(pasta.parent);
    }
  };

  const naPagina = variant === "page";

  return (
    <div
      className={cn("flex min-h-0 flex-col gap-3", naPagina && "w-full max-w-3xl", className)}
      onKeyDown={onKeyDown}
    >
      {/* --- busca --- */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder="Filtrar por nome, ou colar um caminho e apertar Enter"
          aria-label="Filtrar repositorios ou digitar um caminho"
          className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        {busca ? (
          <button
            type="button"
            onClick={() => setBusca("")}
            aria-label="Limpar filtro"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {buscaEhCaminho ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CornerDownLeft className="size-3" />
          Enter {aba === "navegar" ? "navega para" : "abre"}{" "}
          <span className="font-mono text-foreground">{truncate(busca.trim(), 60)}</span>
        </p>
      ) : null}

      <SmoothTabs
        value={aba}
        onValueChange={(v) => setAba(v as Aba)}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <SmoothTabsList ariaLabel="Onde procurar o repositorio">
          <SmoothTabsTab value="recentes">
            <Clock className="mr-1.5 inline size-3.5" />
            Recentes {recentes?.length ? `(${recentes.length})` : ""}
          </SmoothTabsTab>
          <SmoothTabsTab value="procurar">
            <Radar className="mr-1.5 inline size-3.5" />
            Procurar {encontrados?.length ? `(${encontrados.length})` : ""}
          </SmoothTabsTab>
          <SmoothTabsTab value="navegar">
            <FolderOpen className="mr-1.5 inline size-3.5" />
            Navegar
          </SmoothTabsTab>
        </SmoothTabsList>

        <SmoothTabsPanels
          className={cn(
            "min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-background",
            naPagina ? "h-[46vh]" : "h-[42vh]",
          )}
        >
          {/* ---------------- recentes ---------------- */}
          <SmoothTabsPanel value="recentes">
            {recentes === null ? (
              <Esqueleto />
            ) : recentesFiltrados.length === 0 ? (
              <ListaVazia>
                {recentes.length === 0
                  ? "Nenhum repositorio aberto ainda. Use Procurar ou Navegar."
                  : "Nenhum recente casa com o filtro."}
              </ListaVazia>
            ) : (
              <div className="space-y-0.5 p-1">
                {recentesFiltrados.map((r, i) => (
                  <Linha
                    key={r.path}
                    icon={<FolderGit2 className="size-4" />}
                    titulo={r.name}
                    caminho={encurtar(r.path, home)}
                    ativo={r.path === cwdAtual}
                    desabilitado={!r.exists || abrindo}
                    selecionado={i === cursor}
                    detalhe={
                      r.exists ? (
                        <span className="flex items-center gap-2">
                          {r.branch ? (
                            <span className="font-mono text-foreground">{r.branch}</span>
                          ) : null}
                          <span>{relativo(r.lastOpenedAt)}</span>
                        </span>
                      ) : (
                        <span className="text-warning">sumiu do disco</span>
                      )
                    }
                    onClick={() => void abrir(r.path)}
                    acao={
                      <button
                        type="button"
                        onClick={() => void esquecer(r.path)}
                        aria-label={`Esquecer ${r.name}`}
                        title="Remover dos recentes"
                        className="shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    }
                  />
                ))}
              </div>
            )}
          </SmoothTabsPanel>

          {/* ---------------- procurar ---------------- */}
          <SmoothTabsPanel value="procurar">
            {varrendo && encontrados === null ? (
              <Esqueleto />
            ) : encontradosFiltrados.length === 0 ? (
              <ListaVazia>
                {encontrados === null
                  ? "Varredura nao iniciada."
                  : encontrados.length === 0
                    ? "Nenhum repositorio nas pastas conhecidas. Tente a aba Navegar."
                    : "Nenhum resultado casa com o filtro."}
              </ListaVazia>
            ) : (
              <div className="space-y-0.5 p-1">
                {encontradosFiltrados.map((r, i) => (
                  <Linha
                    key={r.path}
                    icon={<FolderGit2 className="size-4" />}
                    titulo={r.name}
                    caminho={encurtar(r.path, home)}
                    ativo={r.path === cwdAtual}
                    desabilitado={abrindo}
                    selecionado={i === cursor}
                    detalhe={
                      <span className="flex items-center gap-2">
                        {r.bare ? <span>bare</span> : null}
                        {r.branch ? (
                          <span className="font-mono text-foreground">{r.branch}</span>
                        ) : null}
                        {r.lastCommitRelative ? <span>{r.lastCommitRelative}</span> : null}
                      </span>
                    }
                    onClick={() => void abrir(r.path)}
                  />
                ))}
              </div>
            )}
          </SmoothTabsPanel>

          {/* ---------------- navegar ---------------- */}
          <SmoothTabsPanel value="navegar">
            {navegando && !pasta ? (
              <Esqueleto />
            ) : erroPasta ? (
              <div className="p-3">
                <Callout tone="danger">{erroPasta}</Callout>
              </div>
            ) : !pasta ? (
              <ListaVazia>Escolha um ponto de partida.</ListaVazia>
            ) : (
              <div className="space-y-0.5 p-1">
                {pasta.parent ? (
                  <Linha
                    icon={<ArrowUp className="size-4" />}
                    titulo=".."
                    caminho={encurtar(pasta.parent, home)}
                    onClick={() => void irPara(pasta.parent!)}
                  />
                ) : null}
                {entradasFiltradas.length === 0 ? (
                  <ListaVazia>Nenhuma subpasta aqui.</ListaVazia>
                ) : (
                  entradasFiltradas.map((e, i) => (
                    <Linha
                      key={e.path}
                      icon={
                        e.isRepo ? (
                          <FolderGit2 className="size-4 text-primary" />
                        ) : (
                          <FolderOpen className="size-4" />
                        )
                      }
                      titulo={e.name}
                      caminho={e.isRepo ? "repositorio git" : encurtar(e.path, home)}
                      ativo={e.path === cwdAtual}
                      desabilitado={abrindo}
                      selecionado={i === cursor}
                      detalhe={
                        e.isBare ? "bare" : e.isWorktree ? "worktree ligada" : undefined
                      }
                      onClick={() => (e.isRepo ? void abrir(e.path) : void irPara(e.path))}
                    />
                  ))
                )}
                {pasta.truncated ? (
                  <p className="px-3 py-2 text-[11px] text-muted-foreground">
                    A pasta tem mais subpastas do que o teto de listagem — refine com o filtro.
                  </p>
                ) : null}
              </div>
            )}
          </SmoothTabsPanel>
        </SmoothTabsPanels>
      </SmoothTabs>

      {/* --- rodape contextual por aba --- */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {aba === "navegar" && pasta ? (
          <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 text-[11px] text-muted-foreground">
            {migalhas(pasta.path, home, sep).map((m, i, todas) => (
              <span key={m.path} className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => void irPara(m.path)}
                  className={cn(
                    "max-w-[16ch] truncate rounded px-1 py-0.5 font-mono hover:bg-accent hover:text-foreground",
                    i === todas.length - 1 && "text-foreground",
                  )}
                >
                  {m.label}
                </button>
                {/* A raiz JA e o separador; imprimi-lo de novo dava "/ / tmp". */}
                {i < todas.length - 1 && m.label !== sep ? <span aria-hidden>{sep}</span> : null}
              </span>
            ))}
          </nav>
        ) : aba === "procurar" ? (
          <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            {varreduraTruncada
              ? "A varredura parou no teto de tempo — nem tudo foi visitado."
              : "Procura nas pastas conhecidas (pessoal, Projects, code, /opt, /srv), ate 4 niveis."}
          </p>
        ) : (
          <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            Setas navegam, Enter abre. Abrir um repositorio faz{" "}
            <span className="font-mono">process.chdir()</span> no servidor — nao ha checkout.
          </p>
        )}

        <div className="flex shrink-0 items-center gap-2">
          {aba === "procurar" ? (
            <Button variant="ghost" onClick={() => void varrer()} disabled={varrendo}>
              {varrendo ? (
                <Loader2 className="mr-1.5 inline size-3.5 animate-spin" />
              ) : (
                <Radar className="mr-1.5 inline size-3.5" />
              )}
              {varrendo ? "Varrendo…" : "Varrer de novo"}
            </Button>
          ) : null}

          {aba === "navegar" && pasta && !pasta.self.isRepo ? (
            <Button
              variant="ghost"
              disabled={abrindo}
              onClick={() => void initRepository(pasta.path).then((r) => r && onOpened?.())}
            >
              <HardDriveDownload className="mr-1.5 inline size-3.5" />
              git init em {truncate(pasta.path.split(sep).pop() || pasta.path, 18)}
            </Button>
          ) : null}

          {aba === "navegar" && pasta?.self.isRepo ? (
            <Button
              variant="primary"
              disabled={abrindo}
              onClick={() => void abrir(pasta.path)}
            >
              Abrir esta pasta
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
