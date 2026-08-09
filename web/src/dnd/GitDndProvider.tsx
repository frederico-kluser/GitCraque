/**
 * O contexto de drag-and-drop do GitCraque — @dnd-kit/core, nada de eventos de
 * drag do HTML5.
 *
 * Tres responsabilidades, e so estas:
 *
 *  1. Sensores. `PointerSensor` com o ativador escolhido pelo ponteiro
 *     (`activationConstraintFor`, de `sensors.ts`): no mouse, `distance: 6`
 *     para que um clique simples num commit continue sendo selecao (o grafo
 *     depende disso); no toque, `delay: 250` com `tolerance: 5`, senao rolar
 *     com o dedo viraria arrasto. Mais `KeyboardSensor` para arrastar sem
 *     mouse.
 *  2. Feedback de validade em tempo real. A cada `onDragOver` a intencao e
 *     resolvida contra o alvo sob o cursor e publicada por contexto; os alvos
 *     leem com `useDropFeedback(id)` e se pintam de aceita/recusa.
 *  3. `onDragEnd` NAO EXECUTA NADA: resolve a intencao e entrega em
 *     `props.onIntent`. Quem executa e o dialogo, depois da confirmacao.
 *
 * Colisao: `pointerWithin` com fallback para `rectIntersection`. `closestCenter`
 * e ruim aqui porque os alvos (chips de ramo) sao pequenos e vizinhos — o
 * "centro mais proximo" acerta o chip errado o tempo todo.
 */
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type {
  Announcements,
  CollisionDetection,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  ScreenReaderInstructions,
} from "@dnd-kit/core";
import { motion } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  useMotionUITheme,
  useMotionUITransition,
} from "@/components/motion-ui/ui-theme";
import { cancelLongPress, getViewport } from "@/hooks";
import { t } from "@/i18n";
import type { MessageKey } from "@/i18n";
import { cn, short, truncate } from "@/lib/utils";
import { getState, toast } from "@/state/store";
import type {
  DragEntityType,
  DragIntent,
  DragPayload,
  DropPayload,
  DropZoneType,
} from "@/types/git";
import type { GitDndProviderProps } from "@/types/modules";
import { encodeId } from "./bindings";
import type { DndScope } from "./bindings";
import { resolveDragIntent } from "./intents";
import { activationConstraintFor } from "./sensors";

/* ------------------------------------------------------------------ */
/* Contexto de feedback                                                */
/* ------------------------------------------------------------------ */

/** Como um alvo deve se pintar. Serve direto como `data-drop={state}`. */
export type DropFeedbackState = "idle" | "dragging" | "accepts" | "rejects";

export interface DropFeedback {
  /** ha um arrasto em curso no app, em qualquer alvo */
  dragging: boolean;
  /** o ponteiro (ou o cursor do teclado) esta sobre ESTE alvo */
  isOver: boolean;
  /** o motor aceita a combinacao arrastado -> este alvo */
  accepts: boolean;
  /** o motor recusa a combinacao arrastado -> este alvo */
  rejects: boolean;
  /** motivo legivel da recusa, quando `rejects` */
  reason?: string;
  /** a intencao resolvida enquanto o ponteiro esta sobre este alvo */
  intent: DragIntent | null;
  /** o que esta sendo arrastado agora, em qualquer alvo */
  source: DragPayload | null;
  /** resumo dos quatro campos acima, pronto para atributo/classe */
  state: DropFeedbackState;
}

interface FeedbackValue {
  source: DragPayload | null;
  overId: string | null;
  intent: DragIntent | null;
}

const EMPTY: FeedbackValue = { source: null, overId: null, intent: null };

const FeedbackContext = createContext<FeedbackValue>(EMPTY);

/**
 * O que este alvo deve mostrar durante o arrasto.
 *
 * @param scope onde o alvo vive ("graph" ou "rail"); tem de ser o MESMO que
 *   foi passado ao `useDroppableTarget`, senao o feedback nunca casa.
 * @param target id do @dnd-kit (`<escopo>::<tipo>:<chave>`, o mesmo que `encodeId`
 *   devolve) ou o proprio `DropPayload` que voce passou para
 *   `useDroppableTarget`.
 */
export function useDropFeedback(target: string | DropPayload, scope: DndScope = "app"): DropFeedback {
  const ctx = useContext(FeedbackContext);
  const id = typeof target === "string" ? target : encodeId(target.type, target.key, scope);

  return useMemo(() => {
    const dragging = ctx.source !== null;
    const isOver = dragging && ctx.overId === id;
    const accepts = isOver && ctx.intent?.allowed === true;
    const rejects = isOver && ctx.intent?.allowed === false;
    return {
      dragging,
      isOver,
      accepts,
      rejects,
      reason: rejects ? ctx.intent?.reason : undefined,
      intent: isOver ? ctx.intent : null,
      source: ctx.source,
      state: accepts ? "accepts" : rejects ? "rejects" : dragging ? "dragging" : "idle",
    };
  }, [ctx, id]);
}

/** O payload sendo arrastado agora, ou null. Util para esmaecer o resto da UI. */
export function useActiveDrag(): DragPayload | null {
  return useContext(FeedbackContext).source;
}

/* ------------------------------------------------------------------ */
/* Leitura defensiva do `data` do @dnd-kit                             */
/* ------------------------------------------------------------------ */

function asDragPayload(data: unknown): DragPayload | null {
  if (!data || typeof data !== "object") return null;
  const p = data as Partial<DragPayload>;
  if (typeof p.type !== "string" || typeof p.key !== "string") return null;
  return typeof p.label === "string" ? (p as DragPayload) : null;
}

function asDropPayload(data: unknown): DropPayload | null {
  if (!data || typeof data !== "object") return null;
  const p = data as Partial<DropPayload>;
  if (typeof p.type !== "string" || typeof p.key !== "string") return null;
  return typeof p.label === "string" ? (p as DropPayload) : null;
}

/* ------------------------------------------------------------------ */
/* Texto dos anuncios (leitor de tela)                                 */
/* ------------------------------------------------------------------ */

/** O ARTIGO faz parte do texto traduzido: em ingles nao ha, em pt/es ha. */
const ENTITY_ARTICLE: Record<DragEntityType, MessageKey> = {
  commit: "dnd.entity.commit",
  branch: "dnd.entity.branch",
  remoteBranch: "dnd.entity.remoteBranch",
  tag: "dnd.entity.tag",
  stash: "dnd.entity.stash",
};

const ZONE_ARTICLE: Record<DropZoneType, MessageKey> = {
  branch: "dnd.zone.branch",
  remoteBranch: "dnd.zone.remoteBranch",
  commit: "dnd.zone.commit",
  tag: "dnd.zone.tag",
  trash: "dnd.zone.trash",
};

const describeDrag = (p: DragPayload) =>
  `${t(ENTITY_ARTICLE[p.type] ?? "dnd.entity.item")} ${p.label}`;

const describeDrop = (p: DropPayload) =>
  `${t(ZONE_ARTICLE[p.type] ?? "dnd.zone.target")} ${p.label}`;

const screenReaderInstructions: ScreenReaderInstructions = {
  get draggable() {
    // Getter: o @dnd-kit le esta propriedade a cada montagem, entao o texto
    // acompanha a troca de idioma sem o modulo guardar uma copia velha.
    return t("dnd.a11y.instructions");
  },
};

/* ------------------------------------------------------------------ */
/* Colisao                                                             */
/* ------------------------------------------------------------------ */

/** `pointerWithin` primeiro (preciso em alvos pequenos e vizinhos); quando o
 *  ponteiro nao esta dentro de nenhum — arrasto por teclado, por exemplo —
 *  cai para a intersecao de retangulos. */
const collisionDetection: CollisionDetection = (args) => {
  const withinPointer = pointerWithin(args);
  return withinPointer.length > 0 ? withinPointer : rectIntersection(args);
};

/* ------------------------------------------------------------------ */
/* O provider                                                          */
/* ------------------------------------------------------------------ */

export function GitDndProvider({ children, onIntent }: GitDndProviderProps) {
  const [feedback, setFeedback] = useState<FeedbackValue>(EMPTY);

  const sensors = useSensors(
    // Um sensor so, com o ativador escolhido pelo ponteiro (`getViewport` le a
    // media query `(pointer: coarse)` na hora do render). Nada de TouchSensor
    // ao lado do PointerSensor: os dois disparariam ativacao dupla. E o
    // @dnd-kit trata o ativador como UNION — { distance } OU { delay,
    // tolerance }; passar os dois juntos faz o distance ser ignorado.
    useSensor(PointerSensor, {
      activationConstraint: activationConstraintFor(getViewport().coarsePointer),
    }),
    useSensor(KeyboardSensor),
  );

  /**
   * Le o estado do repositorio na hora do evento — nunca uma closure velha.
   *
   * O `t` vai NO CONTEXTO porque `intents.ts` e um modulo puro, sem import de
   * runtime (e o que o deixa carregavel pelo `node --test`); ele nao pode
   * importar o i18n sozinho.
   */
  const resolve = useCallback((source: DragPayload, target: DropPayload) => {
    const s = getState();
    return resolveDragIntent(source, target, {
      refs: s.refs,
      headBranch: s.repo?.head.branch ?? s.refs?.head.branch ?? null,
      t,
    });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    // Regra da onda 2a: o arraste SEMPRE vence o menu de toque longo. O timer
    // do menu (LONG_PRESS_MS = 500) segue correndo depois que o arraste ja
    // acordou (DND_DELAY_MS = 250) — sem este cancelamento o menu abriria no
    // meio do arrasto, com a linha colada no dedo e o alvo de soltura
    // escondido atras do popup.
    cancelLongPress();
    setFeedback({ source: asDragPayload(event.active.data.current), overId: null, intent: null });
  }, []);

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const source = asDragPayload(event.active.data.current);
      if (!source) return;
      const target = event.over ? asDropPayload(event.over.data.current) : null;
      if (!target || !event.over) {
        setFeedback((f) => (f.overId === null ? f : { ...f, overId: null, intent: null }));
        return;
      }
      setFeedback({ source, overId: String(event.over.id), intent: resolve(source, target) });
    },
    [resolve],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setFeedback(EMPTY);
      const source = asDragPayload(event.active.data.current);
      const target = event.over ? asDropPayload(event.over.data.current) : null;
      // Silencio no cancelamento — soltar fora de um alvo nunca foi tentativa
      // de drop. No toque isso importa DUAS vezes: um dedo parado 250ms ja
      // acorda o arraste (PointerSensor com delay), e no layout compacto os
      // alvos podem nem estar na tela. Quem ensina o gesto e a dica proativa
      // no DragOverlay, DURANTE o arrasto — nunca um toast depois dele.
      if (!source || !target) return;

      const intent = resolve(source, target);
      if (!intent.allowed) {
        // Recusa nao abre dialogo: so explica por que nao da.
        toast("warning", intent.title, intent.reason);
        return;
      }
      // Fim da linha do motor. A execucao e do dialogo, apos confirmacao.
      onIntent(intent);
    },
    [onIntent, resolve],
  );

  const handleDragCancel = useCallback(() => setFeedback(EMPTY), []);

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart({ active }) {
        const source = asDragPayload(active.data.current);
        return source ? t("dnd.a11y.dragging", { what: describeDrag(source) }) : undefined;
      },
      onDragOver({ active, over }) {
        const source = asDragPayload(active.data.current);
        if (!source) return undefined;
        const target = over ? asDropPayload(over.data.current) : null;
        if (!target) return t("dnd.a11y.outside", { what: describeDrag(source) });
        const intent = resolve(source, target);
        return intent.allowed
          ? t("dnd.a11y.overAccepts", { where: describeDrop(target), title: intent.title })
          : t("dnd.a11y.overRejects", {
              where: describeDrop(target),
              reason: intent.reason ?? intent.description,
            });
      },
      onDragEnd({ active, over }) {
        const source = asDragPayload(active.data.current);
        if (!source) return undefined;
        const target = over ? asDropPayload(over.data.current) : null;
        if (!target) return t("dnd.a11y.droppedOutside", { what: describeDrag(source) });
        const intent = resolve(source, target);
        return intent.allowed
          ? t("dnd.a11y.dropped", { what: describeDrag(source), where: describeDrop(target) })
          : t("dnd.a11y.refused", { reason: intent.reason ?? intent.description });
      },
      onDragCancel({ active }) {
        const source = asDragPayload(active.data.current);
        return source
          ? t("dnd.a11y.cancelled", { what: describeDrag(source) })
          : t("dnd.a11y.cancelledPlain");
      },
    }),
    [resolve],
  );

  const overlayTone: DropFeedbackState = feedback.overId
    ? feedback.intent?.allowed
      ? "accepts"
      : "rejects"
    : "dragging";

  // Dica proativa de toque: ponteiro grosseiro e nenhum alvo sob o dedo. Ajuda
  // DURANTE o arrasto — no layout compacto os alvos (chips de ramo) podem nem
  // estar na tela, e um dedo parado 250ms ja acorda o arraste sem nenhuma
  // intencao de drop. Nada de toast no cancelamento: e dica, nao bronca.
  const dropHint =
    getViewport().coarsePointer && feedback.overId === null
      ? t("dnd.drop.missed.title")
      : null;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      // A View Tree e virtualizada e rola durante o arrasto: medir so uma vez
      // deixaria os retangulos dos alvos desatualizados.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      accessibility={{ announcements, screenReaderInstructions }}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <FeedbackContext.Provider value={feedback}>
        {children}
        <DragOverlay dropAnimation={null}>
          {feedback.source ? (
            <DragChip payload={feedback.source} tone={overlayTone} hint={dropHint} />
          ) : null}
        </DragOverlay>
      </FeedbackContext.Provider>
    </DndContext>
  );
}

/* ------------------------------------------------------------------ */
/* O que aparece sob o cursor                                          */
/* ------------------------------------------------------------------ */

const TONE_CLASS: Record<DropFeedbackState, string> = {
  idle: "border-border bg-card text-card-foreground",
  dragging: "border-border bg-card text-card-foreground",
  accepts: "border-success bg-card text-card-foreground ring-1 ring-success",
  rejects: "border-destructive bg-card text-destructive ring-1 ring-destructive",
};

function DragChip({
  payload,
  tone,
  hint,
}: {
  payload: DragPayload;
  tone: DropFeedbackState;
  /** Dica proativa de toque: texto pequeno abaixo do chip quando nao ha alvo
   *  sob o ponteiro. `null`/undefined omite a linha. */
  hint?: string | null;
}) {
  const snap = useMotionUITransition("snap");
  const { motionMode } = useMotionUITheme();
  const full = motionMode === "full";
  const still = motionMode === "off";

  const isCommit = payload.type === "commit";

  return (
    <motion.div
      role="presentation"
      initial={still ? false : full ? { opacity: 0, scale: 0.92 } : { opacity: 0 }}
      animate={full ? { opacity: 1, scale: 1 } : { opacity: 1 }}
      transition={{ ...snap }}
      className={cn(
        "pointer-events-none flex max-w-sm flex-col rounded-md border shadow-lg",
        TONE_CLASS[tone],
      )}
    >
      <div className="flex items-center gap-2 px-2.5 py-1.5 text-xs">
        <span className="text-muted-foreground">{ENTITY_ICON[payload.type]}</span>
        {isCommit ? (
          <>
            <code className="font-mono text-[0.7rem] text-foreground">{short(payload.key)}</code>
            {payload.detail ? (
              <span className="truncate text-muted-foreground">{truncate(payload.detail, 48)}</span>
            ) : null}
          </>
        ) : (
          <span className="truncate font-medium">{payload.label}</span>
        )}
        {tone === "rejects" ? <span aria-hidden="true">{t("dnd.chip.no")}</span> : null}
      </div>
      {hint ? (
        <div className="px-2.5 pb-1.5 text-[0.65rem] leading-tight text-muted-foreground">
          {hint}
        </div>
      ) : null}
    </motion.div>
  );
}

/** Glifos de texto: o chip do overlay e efemero e nao justifica um icone SVG. */
const ENTITY_ICON: Record<DragEntityType, ReactNode> = {
  commit: "●",
  branch: "⎇",
  remoteBranch: "☁",
  tag: "⚑",
  stash: "≣",
};
