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
 * Quatro fontes, em abas: os favoritos (fixados a mao, ordenaveis), os recentes
 * (persistidos pelo servidor), a varredura das raizes conhecidas, e a navegacao
 * livre por pastas. A caixa de busca filtra as tres primeiras e tambem aceita um
 * caminho digitado — colar `~/code/projeto` e apertar Enter abre direto.
 *
 * Favoritos vem primeiro de proposito: e a unica lista que o usuario escolheu.
 * Toda a mecanica deles mora em `FavoriteRepos.tsx`; aqui so entram a aba e a
 * estrela que cada linha das outras tres ganha.
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
  Star,
  Trash2,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { fuzzyMatch } from "@/components/motion-ui/command-palette";
import {
  SmoothTabs,
  SmoothTabsList,
  SmoothTabsPanel,
  SmoothTabsPanels,
  SmoothTabsTab,
} from "@/components/motion-ui/smooth-tabs";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { api } from "@/lib/api";
import { Rich, t } from "@/i18n";
import { cn, truncate } from "@/lib/utils";
import { initRepository, openRepository, toast, useAppState } from "@/state/store";
import type {
  DiscoveredRepo,
  FavoriteRepo,
  FsListPayload,
  FsRootsPayload,
  RecentRepo,
} from "@/types/git";
import { EstrelaFavorito, PainelFavoritos, useFavoritos } from "./FavoriteRepos";
import { Button, Callout } from "./parts";
import { Esqueleto, ListaVazia, encurtar, relativo } from "./repo-picker-parts";

export type RepoPickerVariant = "page" | "dialog";

export interface RepoPickerProps {
  variant?: RepoPickerVariant;
  /** chamado depois de abrir um repositorio com sucesso (fecha o dialogo) */
  onOpened?: () => void;
  className?: string;
}

type Aba = "favoritos" | "recentes" | "procurar" | "navegar";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/* `encurtar`, `relativo`, `ListaVazia` e `Esqueleto` moraram aqui ate os
 * favoritos precisarem dos mesmos quatro — agora vem de `repo-picker-parts`. */

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
                <Check className="size-2.5" /> {t("common.opened")}
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

  const favoritos = useFavoritos();

  const inputRef = useRef<HTMLInputElement>(null);
  const abaEscolhida = useRef(false);
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
    })();
    return () => {
      vivo = false;
    };
  }, []);

  /* --- qual aba abre ---
   * Favoritos na frente quando existe algum; senao a cascata antiga: recentes,
   * ou a varredura quando nem recente ha (a lista vazia nao ajuda ninguem).
   * Espera as DUAS cargas para nao piscar de uma aba para a outra, e a decisao
   * acontece uma vez so: depois disso a aba e do usuario. */
  useEffect(() => {
    if (abaEscolhida.current) return;
    if (recentes === null || !favoritos.carregado) return;
    abaEscolhida.current = true;
    if (favoritos.entries.length > 0) setAba("favoritos");
    else if (recentes.length === 0) setAba("procurar");
  }, [recentes, favoritos.carregado, favoritos.entries.length]);

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
          t("picker.scan.none.title"),
          t("picker.scan.none.body", { scanned: payload.scanned, ms: payload.elapsedMs }),
        );
      }
    } catch (e) {
      toast("error", t("picker.scan.failed"), e instanceof Error ? e.message : String(e));
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

  const favoritosFiltrados = useMemo<FavoriteRepo[]>(
    () => favoritos.entries.filter((f) => casa(f.label) || casa(f.name) || casa(f.path)),
    [favoritos.entries, q],
  );
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
    aba === "favoritos"
      ? favoritosFiltrados.map((f) => ({ path: f.path, isRepo: f.exists }))
      : aba === "recentes"
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
      // Um botao ja trata Enter como acionamento. Sem esta guarda, apertar
      // Enter na estrela, no lapis ou na lixeira acionava o botao E abria o
      // repositorio sob o cursor de uma vez so.
      if ((event.target as HTMLElement | null)?.tagName === "BUTTON") return;
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
      // Favorito cuja pasta sumiu nao abre — nem pelo teclado.
      else if (aba !== "favoritos" || alvo.isRepo) void abrir(alvo.path);
    } else if (event.key === "Backspace" && !busca && aba === "navegar" && pasta?.parent) {
      event.preventDefault();
      void irPara(pasta.parent);
    }
  };

  const naPagina = variant === "page";

  /* ALTURA FIXA, de proposito.
   *
   * O seletor tem altura propria em vez de crescer com o conteudo porque o
   * dialogo e centralizado: qualquer mudanca de altura (esqueleto virando
   * lista, a dica de "Enter abre este caminho" aparecendo, um rodape que
   * quebra em duas linhas) reposicionava a caixa inteira. A pilula das abas e
   * um elemento de `layoutId`, entao ela ANIMAVA esse deslocamento e entrava
   * voando de baixo ao abrir o dialogo. Com a altura cravada, quem absorve a
   * folga e a area das abas (`flex-1` logo abaixo) e nada se move. */
  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-3",
        naPagina ? "h-[56vh] w-full max-w-3xl" : "h-[52vh]",
        className,
      )}
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
          placeholder={t("picker.search.placeholder")}
          aria-label={t("picker.search.aria")}
          className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        {busca ? (
          <button
            type="button"
            onClick={() => setBusca("")}
            aria-label={t("picker.search.clear")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {buscaEhCaminho ? (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CornerDownLeft className="size-3" />
          <Rich
            k={aba === "navegar" ? "picker.enter.navigate" : "picker.enter.open"}
            nodes={{
              path: <span className="font-mono text-foreground">{truncate(busca.trim(), 60)}</span>,
            }}
          />
        </p>
      ) : null}

      <SmoothTabs
        value={aba}
        onValueChange={(v) => setAba(v as Aba)}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <SmoothTabsList ariaLabel={t("picker.tabs.aria")}>
          <SmoothTabsTab value="favoritos">
            <Star
              className="mr-1.5 inline size-3.5"
              fill={favoritos.entries.length ? "currentColor" : "none"}
            />
            {t("picker.tab.favorites")}{" "}
            {favoritos.entries.length ? `(${favoritos.entries.length})` : ""}
          </SmoothTabsTab>
          <SmoothTabsTab value="recentes">
            <Clock className="mr-1.5 inline size-3.5" />
            {t("picker.tab.recents")} {recentes?.length ? `(${recentes.length})` : ""}
          </SmoothTabsTab>
          <SmoothTabsTab value="procurar">
            <Radar className="mr-1.5 inline size-3.5" />
            {t("picker.tab.scan")} {encontrados?.length ? `(${encontrados.length})` : ""}
          </SmoothTabsTab>
          <SmoothTabsTab value="navegar">
            <FolderOpen className="mr-1.5 inline size-3.5" />
            {t("picker.tab.browse")}
          </SmoothTabsTab>
        </SmoothTabsList>

        {/* sem altura propria: a area das abas e quem absorve a folga da
            altura fixa do seletor */}
        <SmoothTabsPanels className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-background">
          {/* ---------------- favoritos ---------------- */}
          <SmoothTabsPanel value="favoritos">
            <PainelFavoritos
              controle={favoritos}
              entradas={favoritosFiltrados}
              filtrando={q.length > 0}
              home={home}
              cwdAtual={cwdAtual}
              abrindo={abrindo}
              cursor={cursor}
              onAbrir={(p) => void abrir(p)}
            />
          </SmoothTabsPanel>

          {/* ---------------- recentes ---------------- */}
          <SmoothTabsPanel value="recentes">
            {recentes === null ? (
              <Esqueleto />
            ) : recentesFiltrados.length === 0 ? (
              <ListaVazia>
                {recentes.length === 0 ? t("picker.recents.empty") : t("picker.recents.noMatch")}
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
                        <span className="text-warning">{t("common.missingFromDisk")}</span>
                      )
                    }
                    onClick={() => void abrir(r.path)}
                    acao={
                      <>
                        <button
                          type="button"
                          onClick={() => void esquecer(r.path)}
                          aria-label={t("picker.recents.forget", { name: r.name })}
                          title={t("picker.recents.forgetTitle")}
                          className="shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                        <EstrelaFavorito path={r.path} nome={r.name} controle={favoritos} />
                      </>
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
                  ? t("picker.scan.notStarted")
                  : encontrados.length === 0
                    ? t("picker.scan.empty")
                    : t("picker.scan.noMatch")}
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
                        {r.bare ? <span>{t("picker.browse.bare")}</span> : null}
                        {r.branch ? (
                          <span className="font-mono text-foreground">{r.branch}</span>
                        ) : null}
                        {r.lastCommitRelative ? <span>{r.lastCommitRelative}</span> : null}
                      </span>
                    }
                    onClick={() => void abrir(r.path)}
                    acao={<EstrelaFavorito path={r.path} nome={r.name} controle={favoritos} />}
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
              <ListaVazia>{t("picker.browse.pickStart")}</ListaVazia>
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
                  <ListaVazia>{t("picker.browse.noSubfolders")}</ListaVazia>
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
                      caminho={e.isRepo ? t("picker.browse.isRepo") : encurtar(e.path, home)}
                      ativo={e.path === cwdAtual}
                      desabilitado={abrindo}
                      selecionado={i === cursor}
                      detalhe={
                        e.isBare
                          ? t("picker.browse.bare")
                          : e.isWorktree
                            ? t("picker.browse.linkedWorktree")
                            : undefined
                      }
                      onClick={() => (e.isRepo ? void abrir(e.path) : void irPara(e.path))}
                      // So repositorio ganha estrela: fixar uma pasta qualquer
                      // criaria um favorito que nunca abre.
                      acao={
                        e.isRepo ? (
                          <EstrelaFavorito path={e.path} nome={e.name} controle={favoritos} />
                        ) : null
                      }
                    />
                  ))
                )}
                {pasta.truncated ? (
                  <p className="px-3 py-2 text-[11px] text-muted-foreground">
                    {t("picker.browse.tooMany")}
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
            {varreduraTruncada ? t("picker.scan.truncated") : t("picker.scan.note")}
          </p>
        ) : aba === "favoritos" ? (
          <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            {favoritos.disponivel
              ? t("picker.favorites.note")
              : t("picker.favorites.unavailableNote")}
          </p>
        ) : (
          <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
            <Rich
              k="picker.footer.keys"
              nodes={{ chdir: <span className="font-mono">process.chdir()</span> }}
            />
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
              {varrendo ? t("picker.scan.running") : t("picker.scan.again")}
            </Button>
          ) : null}

          {aba === "navegar" && pasta && !pasta.self.isRepo ? (
            <Button
              variant="ghost"
              disabled={abrindo}
              onClick={() => void initRepository(pasta.path).then((r) => r && onOpened?.())}
            >
              <HardDriveDownload className="mr-1.5 inline size-3.5" />
              {t("picker.browse.gitInit", {
                name: truncate(pasta.path.split(sep).pop() || pasta.path, 18),
              })}
            </Button>
          ) : null}

          {aba === "navegar" && pasta?.self.isRepo ? (
            <Button
              variant="primary"
              disabled={abrindo}
              onClick={() => void abrir(pasta.path)}
            >
              {t("picker.browse.openHere")}
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
