/**
 * PROJETOS FAVORITOS — a aba fixa do seletor de repositorios.
 *
 * Favorito nao e recente. Recente e historico automatico e rotativo: entra
 * sozinho, sai sozinho, ordena por relogio. Favorito e escolha explicita — o
 * usuario fixa, renomeia e coloca na ordem que quiser, e nada tira dali sem ele
 * mandar. A interface reflete isso: os recentes tem lixeira e carimbo de tempo,
 * os favoritos tem alca de arrasto, apelido editavel e estrela cheia.
 *
 * ── Reordenar ─────────────────────────────────────────────────────────
 * `@dnd-kit/core` puro. `@dnd-kit/sortable` NAO esta instalado e a regra e nao
 * instalar, entao cada linha e `useDraggable` + `useDroppable` no mesmo no —
 * que e exatamente o que o `useSortable` faz por dentro.
 *
 * Duas decisoes que valem o comentario:
 *
 *  - O DOM NAO se reordena durante o arrasto: as linhas vizinhas so deslizam
 *    uma altura para abrir o buraco onde o item vai cair. Reordenar de verdade
 *    move os alvos sob o ponteiro e o par "trocou / destrocou" fica oscilando;
 *    com a lista parada os retangulos medidos valem do inicio ao fim do gesto.
 *    O deslize mora num `motion.div` DENTRO do `<li>`, porque o `<li>` ja
 *    carrega o `transform` do @dnd-kit e dois donos do mesmo transform brigam.
 *  - Sem `DragOverlay`: o painel do dialogo anima `transform`, o que faz dele
 *    bloco de contencao de `position: fixed`, e com `overflow-hidden` o overlay
 *    seria recortado. A propria linha carrega o `translate3d` do @dnd-kit.
 *
 * Este DndContext e local e nao tem nada a ver com `dnd/GitDndProvider`, que e
 * o motor semantico do grafo (commit sobre ramo = cherry-pick). Aqui nao ha
 * intencao a resolver: soltar so troca a ordem de uma lista.
 *
 * ── Enquanto o backend nao chega ──────────────────────────────────────
 * As quatro rotas podem responder 501. Isso nao e erro do usuario: a aba diz
 * "favoritos indisponiveis" numa linha, as estrelas somem das outras abas e o
 * resto do seletor segue funcionando. Zero toast.
 *
 * O que faltou no catalogo: uma lista reordenavel e um item de lista com
 * titulo editavel no lugar. `swipe-actions` tem a lista com acao, mas a acao
 * dele e um gesto horizontal de descarte, nao uma alca de reordenacao, e o
 * conteudo da linha nao e editavel. `expand-card` abre detalhe, nao renomeia.
 */
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  Announcements,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  ScreenReaderInstructions,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  Check,
  FolderGit2,
  GripVertical,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { motion } from "motion/react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { ApiRequestError, api } from "@/lib/api";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import { toast } from "@/state/store";
import type { FavoriteRepo, FavoritesPayload } from "@/types/git";
import { Esqueleto, ListaVazia, basename, encurtar } from "./repo-picker-parts";

/* ------------------------------------------------------------------ */
/* O estado dos favoritos                                              */
/* ------------------------------------------------------------------ */

export interface ControleFavoritos {
  entries: FavoriteRepo[];
  /** so os caminhos, para a estrela de cada linha decidir cheia/vazia em O(1) */
  paths: Set<string>;
  /** a primeira leitura terminou (com sucesso ou nao) */
  carregado: boolean;
  /** false quando as rotas respondem 501 — a feature ainda nao existe no backend */
  disponivel: boolean;
  alternar: (path: string, nome?: string) => void;
  remover: (path: string) => void;
  renomear: (path: string, label: string) => void;
  reordenar: (paths: string[]) => void;
  recarregar: () => void;
}

/** 501 e a rota declarada mas ainda nao escrita; 404 e ela nem existir. */
const foraDoAr = (e: unknown) =>
  e instanceof ApiRequestError && (e.status === 501 || e.status === 404);

const motivo = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function useFavoritos(): ControleFavoritos {
  const [entries, setEntries] = useState<FavoriteRepo[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [disponivel, setDisponivel] = useState(true);

  /** Espelho sincrono da lista: as mutacoes otimistas partem do valor de AGORA,
   *  nunca do que a closure viu quando foi criada. */
  const atual = useRef<FavoriteRepo[]>([]);
  const aplicar = useCallback((lista: FavoriteRepo[]) => {
    atual.current = lista;
    setEntries(lista);
  }, []);

  const carregar = useCallback(async () => {
    try {
      const payload = await api.favorites();
      aplicar(payload.entries);
      setDisponivel(true);
    } catch (e) {
      aplicar([]);
      // Qualquer falha na leitura inicial vira "indisponivel": abrir o seletor
      // nao e hora de explicar backend quebrado, e a aba ja diz o essencial.
      setDisponivel(false);
      if (!foraDoAr(e)) console.warn("favoritos: leitura falhou", e);
    } finally {
      setCarregado(true);
    }
  }, [aplicar]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  /** Pinta na hora, confirma depois, e volta atras se o servidor recusar. */
  const mutar = useCallback(
    async (
      previsto: FavoriteRepo[],
      chamada: () => Promise<FavoritesPayload>,
      falha: string,
    ) => {
      const anterior = atual.current;
      aplicar(previsto);
      try {
        const payload = await chamada();
        aplicar(payload.entries);
        setDisponivel(true);
      } catch (e) {
        aplicar(anterior);
        if (foraDoAr(e)) setDisponivel(false);
        else toast("error", falha, motivo(e));
      }
    },
    [aplicar],
  );

  const remover = useCallback(
    (path: string) => {
      void mutar(
        atual.current.filter((f) => f.path !== path),
        () => api.removeFavorite(path),
        t("favorites.error.unpin"),
      );
    },
    [mutar],
  );

  const alternar = useCallback(
    (path: string, nome?: string) => {
      if (atual.current.some((f) => f.path === path)) {
        remover(path);
        return;
      }
      const otimista: FavoriteRepo = {
        path,
        label: "",
        name: nome || basename(path),
        branch: null,
        order: atual.current.length,
        addedAt: Date.now(),
        exists: true,
      };
      void mutar(
        [...atual.current, otimista],
        () => api.addFavorite({ path }),
        t("favorites.error.pin"),
      );
    },
    [mutar, remover],
  );

  const renomear = useCallback(
    (path: string, label: string) => {
      // Nao existe rota de rename e nem precisa: dois favoritos no mesmo caminho
      // nao podem coexistir, entao `add` do mesmo path atualiza o rotulo.
      void mutar(
        atual.current.map((f) => (f.path === path ? { ...f, label } : f)),
        () => api.addFavorite({ path, label }),
        t("favorites.error.rename"),
      );
    },
    [mutar],
  );

  const reordenar = useCallback(
    (paths: string[]) => {
      const porPath = new Map(atual.current.map((f) => [f.path, f]));
      const previsto: FavoriteRepo[] = [];
      paths.forEach((p, i) => {
        const f = porPath.get(p);
        if (f) previsto.push({ ...f, order: i });
      });
      void mutar(
        previsto,
        () => api.reorderFavorites(paths),
        t("favorites.error.reorder"),
      );
    },
    [mutar],
  );

  const paths = useMemo(() => new Set(entries.map((f) => f.path)), [entries]);

  return {
    entries,
    paths,
    carregado,
    disponivel,
    alternar,
    remover,
    renomear,
    reordenar,
    recarregar: () => void carregar(),
  };
}

/* ------------------------------------------------------------------ */
/* A estrela — a mesma peca nas quatro abas                            */
/* ------------------------------------------------------------------ */

/**
 * Codigo novo porque o catalogo nao tem botao de alternancia: `segmented-toggle`
 * escolhe entre N opcoes visiveis lado a lado, nao liga/desliga um estado numa
 * linha de lista, e nenhum dos 19 expoe `aria-pressed`.
 */
export function EstrelaFavorito({
  path,
  nome,
  controle,
  /** na aba de favoritos a estrela e permanente; nas outras ela aparece no hover */
  sempreVisivel,
}: {
  path: string;
  nome: string;
  controle: ControleFavoritos;
  sempreVisivel?: boolean;
}) {
  const snap = useMotionUITransition("snap");
  if (!controle.disponivel) return null;

  const fixado = controle.paths.has(path);
  return (
    <button
      type="button"
      aria-pressed={fixado}
      aria-label={
        fixado ? t("favorites.unpin", { name: nome }) : t("favorites.pin", { name: nome })
      }
      title={fixado ? t("favorites.unpinTitle") : t("favorites.pinTitle")}
      onClick={() => controle.alternar(path, nome)}
      className={cn(
        "shrink-0 rounded p-1.5 outline-none transition-opacity hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        fixado
          ? "text-warning"
          : "text-muted-foreground hover:text-warning focus-visible:opacity-100 group-hover:opacity-100",
        !fixado && !sempreVisivel && "opacity-0",
      )}
    >
      <motion.span
        className="block"
        initial={false}
        animate={{ scale: fixado ? 1 : 0.88 }}
        transition={{ ...snap }}
      >
        <Star className="size-3.5" fill={fixado ? "currentColor" : "none"} />
      </motion.span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Reordenacao                                                         */
/* ------------------------------------------------------------------ */

function mover<T>(lista: T[], de: number, para: number): T[] {
  const copia = lista.slice();
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

const instrucoes: ScreenReaderInstructions = {
  // Getter: o @dnd-kit le a cada montagem, entao o texto acompanha o idioma.
  get draggable() {
    return t("favorites.a11y.instructions");
  },
};

/* ------------------------------------------------------------------ */
/* A linha                                                             */
/* ------------------------------------------------------------------ */

interface LinhaFavoritoProps {
  fav: FavoriteRepo;
  home: string;
  aberto: boolean;
  desabilitado: boolean;
  selecionado: boolean;
  podeReordenar: boolean;
  /** px que esta linha desliza para abrir espaco ao item arrastado */
  deslocamento: number;
  editando: boolean;
  controle: ControleFavoritos;
  onAbrir: () => void;
  onEditar: () => void;
  onFecharEdicao: () => void;
  onMover: (passos: number) => void;
}

function LinhaFavorito({
  fav,
  home,
  aberto,
  desabilitado,
  selecionado,
  podeReordenar,
  deslocamento,
  editando,
  controle,
  onAbrir,
  onEditar,
  onFecharEdicao,
  onMover,
}: LinhaFavoritoProps) {
  const snap = useMotionUITransition("snap");
  const rotuloId = useId();
  const arrastavel = useDraggable({ id: fav.path, disabled: !podeReordenar });
  const alvo = useDroppable({ id: fav.path, disabled: !podeReordenar });

  const { setNodeRef: refArrasto } = arrastavel;
  const { setNodeRef: refAlvo } = alvo;
  const setRef = useCallback(
    (node: HTMLElement | null) => {
      refArrasto(node);
      refAlvo(node);
    },
    [refArrasto, refAlvo],
  );

  const arrastando = arrastavel.isDragging;
  const y = arrastavel.transform?.y ?? 0;

  const titulo = fav.label || fav.name;

  const teclasDaAlca = (event: ReactKeyboardEvent) => {
    // Atalho sem arrasto: quem nao quer (ou nao consegue) segurar espaco e
    // navegar por setas ainda consegue mover um projeto.
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    onMover(event.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <li
      ref={setRef}
      style={
        arrastando
          ? { transform: `translate3d(0, ${Math.round(y)}px, 0)`, zIndex: 10 }
          : undefined
      }
      className="relative list-none"
    >
      <motion.div
        // O deslize das vizinhas. `animate` em vez de `layout` porque a caixa
        // nao muda: elas so saem do caminho e voltam.
        initial={false}
        animate={{ y: deslocamento }}
        transition={{ ...snap }}
        className={cn(
          "group relative flex items-center gap-2 rounded-md border border-transparent px-2 py-2 text-left",
          selecionado && "border-border bg-accent",
          !desabilitado && !arrastando && "hover:border-border hover:bg-accent",
          !fav.exists && "opacity-50",
          arrastando && "border-border bg-card shadow-lg",
        )}
      >
        {selecionado ? (
          <motion.span
            layoutId="repo-picker-cursor"
            transition={{ ...snap }}
            className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary"
          />
        ) : null}

        {podeReordenar ? (
          <button
            type="button"
            ref={arrastavel.setActivatorNodeRef}
            {...arrastavel.listeners}
            {...arrastavel.attributes}
            onKeyDown={teclasDaAlca}
            aria-label={t("favorites.reorder", { name: titulo })}
            title={t("favorites.reorderTitle")}
            className="shrink-0 cursor-grab touch-none rounded p-1 text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
          >
            <GripVertical className="size-3.5" />
          </button>
        ) : (
          <span className="w-[1.375rem] shrink-0" aria-hidden />
        )}

        {editando ? (
          <RotuloEditor
            id={rotuloId}
            valor={fav.label}
            padrao={fav.name}
            onSalvar={(label) => {
              if (label !== fav.label) controle.renomear(fav.path, label);
              onFecharEdicao();
            }}
            onCancelar={onFecharEdicao}
          />
        ) : (
          <button
            type="button"
            disabled={desabilitado}
            onClick={onAbrir}
            className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-not-allowed"
          >
            <span className="shrink-0 text-muted-foreground">
              <FolderGit2 className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-medium text-foreground">{titulo}</span>
                {aberto ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    <Check className="size-2.5" /> {t("common.opened")}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                <span className="truncate">{encurtar(fav.path, home)}</span>
              </span>
            </span>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {fav.exists ? (
                fav.branch ? (
                  <span className="font-mono text-foreground">{fav.branch}</span>
                ) : null
              ) : (
                <span className="text-warning">{t("common.missingFromDisk")}</span>
              )}
            </span>
          </button>
        )}

        {editando ? null : (
          <>
            {fav.exists ? (
              <button
                type="button"
                onClick={onEditar}
                aria-label={t("favorites.rename", { name: titulo })}
                title={t("favorites.renameTitle")}
                className="shrink-0 rounded p-1.5 text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
              >
                <Pencil className="size-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => controle.remover(fav.path)}
                className="shrink-0 rounded px-2 py-1 text-[11px] font-medium text-muted-foreground outline-none hover:bg-accent hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Trash2 className="mr-1 inline size-3" />
                {t("favorites.remove")}
              </button>
            )}
            <EstrelaFavorito path={fav.path} nome={titulo} controle={controle} sempreVisivel />
          </>
        )}
      </motion.div>
    </li>
  );
}

/** Edicao do apelido no lugar do titulo. Enter e sair do campo salvam; Escape
 *  desiste; vazio volta ao nome da pasta, que e o que o contrato espera. */
function RotuloEditor({
  id,
  valor,
  padrao,
  onSalvar,
  onCancelar,
}: {
  id: string;
  valor: string;
  padrao: string;
  onSalvar: (label: string) => void;
  onCancelar: () => void;
}) {
  const [texto, setTexto] = useState(valor);
  const cancelado = useRef(false);

  return (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <label htmlFor={id} className="sr-only">
        {t("favorites.label")}
      </label>
      <input
        id={id}
        autoFocus
        value={texto}
        spellCheck={false}
        autoComplete="off"
        placeholder={padrao}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (!cancelado.current) onSalvar(texto.trim());
        }}
        onKeyDown={(e) => {
          // NADA daqui sobe. O seletor escuta o teclado no container inteiro:
          // sem isto, Enter abriria o repositorio sob o cursor e as setas
          // moveriam a lista em vez do caret. Escape fecha a edicao, nao o dialogo.
          e.stopPropagation();
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancelado.current = true;
            onCancelar();
          }
        }}
        className="min-w-0 flex-1 rounded border border-input bg-background px-2 py-1 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
      />
      <span className="shrink-0 text-[11px] text-muted-foreground">{t("favorites.editHint")}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* O painel                                                            */
/* ------------------------------------------------------------------ */

export interface PainelFavoritosProps {
  controle: ControleFavoritos;
  /** ja filtrados pela caixa de busca do seletor */
  entradas: FavoriteRepo[];
  /** ha filtro ativo: reordenar sairia errado, porque a lista visivel e parcial */
  filtrando: boolean;
  home: string;
  cwdAtual: string | null;
  abrindo: boolean;
  cursor: number;
  onAbrir: (path: string) => void;
}

export function PainelFavoritos({
  controle,
  entradas,
  filtrando,
  home,
  cwdAtual,
  abrindo,
  cursor,
  onAbrir,
}: PainelFavoritosProps) {
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [editando, setEditando] = useState<string | null>(null);
  /** distancia de uma linha para a seguinte, medida quando o arrasto comeca */
  const [passo, setPasso] = useState(0);
  const listaRef = useRef<HTMLUListElement>(null);

  const sensores = useSensors(
    // A alca e um botao: 4px ja basta para separar clique de arrasto.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  );

  const ordem = useMemo(() => entradas.map((f) => f.path), [entradas]);
  const podeReordenar = controle.disponivel && !filtrando && entradas.length > 1;

  const nomeDe = useCallback(
    (path: string | null) => {
      const f = entradas.find((e) => e.path === path);
      return f ? f.label || f.name : "";
    },
    [entradas],
  );

  const aplicarMovimento = useCallback(
    (de: number, para: number) => {
      if (de < 0 || para < 0 || de === para || para >= ordem.length) return;
      controle.reordenar(mover(ordem, de, para));
    },
    [controle, ordem],
  );

  const anuncios: Announcements = useMemo(
    () => ({
      onDragStart: ({ active }) =>
        t("favorites.a11y.start", {
          name: nomeDe(String(active.id)),
          index: ordem.indexOf(String(active.id)) + 1,
          total: ordem.length,
        }),
      onDragOver: ({ over }) =>
        over
          ? t("favorites.a11y.over", {
              index: ordem.indexOf(String(over.id)) + 1,
              total: ordem.length,
            })
          : t("favorites.a11y.outside"),
      onDragEnd: ({ active, over }) =>
        over && over.id !== active.id
          ? t("favorites.a11y.end", {
              name: nomeDe(String(active.id)),
              index: ordem.indexOf(String(over.id)) + 1,
            })
          : t("favorites.a11y.unchanged"),
      onDragCancel: ({ active }) =>
        t("favorites.a11y.cancel", { name: nomeDe(String(active.id)) }),
    }),
    [nomeDe, ordem],
  );

  const aoIniciar = useCallback((event: DragStartEvent) => {
    // Todas as linhas tem a mesma altura (tudo nelas e truncado numa linha so),
    // entao a distancia entre as duas primeiras serve para todas.
    const itens = listaRef.current?.querySelectorAll("li");
    if (itens && itens.length > 1) {
      setPasso(itens[1].getBoundingClientRect().top - itens[0].getBoundingClientRect().top);
    }
    setArrastando(String(event.active.id));
    setSobre(null);
  }, []);

  const aoPassar = useCallback((event: DragOverEvent) => {
    setSobre(event.over ? String(event.over.id) : null);
  }, []);

  const aoSoltar = useCallback(
    (event: DragEndEvent) => {
      setArrastando(null);
      setSobre(null);
      if (!event.over || event.over.id === event.active.id) return;
      aplicarMovimento(ordem.indexOf(String(event.active.id)), ordem.indexOf(String(event.over.id)));
    },
    [aplicarMovimento, ordem],
  );

  const aoCancelar = useCallback(() => {
    setArrastando(null);
    setSobre(null);
  }, []);

  if (!controle.carregado) return <Esqueleto />;

  if (!controle.disponivel) {
    return (
      <p className="flex flex-wrap items-center justify-center gap-1.5 px-3 py-8 text-center text-sm text-muted-foreground">
        {t("favorites.unavailable")}
        <button
          type="button"
          onClick={controle.recarregar}
          className="rounded px-1.5 py-0.5 underline underline-offset-2 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("common.retry")}
        </button>
      </p>
    );
  }

  if (controle.entries.length === 0) {
    return (
      <ListaVazia>{t("favorites.empty")}</ListaVazia>
    );
  }

  if (entradas.length === 0) {
    return <ListaVazia>{t("favorites.noMatch")}</ListaVazia>;
  }

  const iAtivo = arrastando ? ordem.indexOf(arrastando) : -1;
  const iSobre = sobre ? ordem.indexOf(sobre) : -1;

  /** Quem esta entre a origem e o destino sai do caminho; o resto fica parado. */
  const deslocamentoDe = (i: number) => {
    if (iAtivo < 0 || iSobre < 0 || iAtivo === iSobre || i === iAtivo) return 0;
    if (iAtivo < iSobre) return i > iAtivo && i <= iSobre ? -passo : 0;
    return i >= iSobre && i < iAtivo ? passo : 0;
  };

  return (
    <DndContext
      sensors={sensores}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      accessibility={{ announcements: anuncios, screenReaderInstructions: instrucoes }}
      onDragStart={aoIniciar}
      onDragOver={aoPassar}
      onDragEnd={aoSoltar}
      onDragCancel={aoCancelar}
    >
      <ul ref={listaRef} className="space-y-0.5 p-1">
        {entradas.map((fav, i) => (
          <LinhaFavorito
            key={fav.path}
            fav={fav}
            home={home}
            aberto={fav.path === cwdAtual}
            desabilitado={!fav.exists || abrindo}
            selecionado={i === cursor}
            podeReordenar={podeReordenar}
            deslocamento={deslocamentoDe(i)}
            editando={editando === fav.path}
            controle={controle}
            onAbrir={() => onAbrir(fav.path)}
            onEditar={() => setEditando(fav.path)}
            onFecharEdicao={() => setEditando(null)}
            onMover={(passos) => aplicarMovimento(i, i + passos)}
          />
        ))}
      </ul>
      {filtrando && controle.entries.length > 1 ? (
        <p className="px-3 pb-2 text-[11px] text-muted-foreground">
          {t("favorites.filterHint")}
        </p>
      ) : null}
    </DndContext>
  );
}
