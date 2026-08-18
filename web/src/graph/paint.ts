/**
 * A PINTURA DA COLUNA DO GRAFO — todo numero e toda forma do desenho, num
 * arquivo so.
 *
 * O grafo do GitCraque e desenhado A MAO: nao ha biblioteca de gitgraph, e cada
 * linha da View Tree monta o proprio <svg>. Este arquivo e a mesa de controle
 * desse desenho. Quem quiser mexer no visual mexe AQUI e em mais lugar nenhum:
 * `CommitRow.tsx` (a UI), `layout.ts` (as metricas default), `bezier.ts` (a
 * curvatura) e `devtools/make-sample-svg.ts` (o SVG de exemplo) todos leem daqui,
 * entao os quatro nunca discordam sobre como um commit e desenhado.
 *
 * Mapa rapido do que ajustar:
 *
 *   linha mais alta / mais baixa .............. METRICS.rowHeight
 *   lanes mais afastadas ...................... METRICS.laneWidth
 *   margem a esquerda antes da lane 0 ......... METRICS.paddingLeft
 *   bola maior / menor ........................ METRICS.nodeRadius
 *   traco mais grosso ......................... METRICS.strokeWidth
 *   curva mais aberta / mais seca ............. CONTROL_RATIO
 *   quanto a bola cresce sob o ponteiro ....... NODE.hoverScale
 *   aneis, ponto de raiz, halo da selecao ..... NODE.*
 *   corpo do assunto e das colunas de metadado  TEXT.*
 *   arredondamento e cor dos realces da linha . SURFACE.*
 *
 * TRES REGRAS QUE ESTE ARQUIVO TEM DE OBEDECER:
 *
 * 1. **Nenhum import de runtime.** So `import type`. Este modulo e carregado
 *    direto pelo Node (sem bundler) quando o runner do grafo gera o SVG de
 *    exemplo; um `import { x } from "@/..."` de verdade passa no `tsc` e derruba
 *    a fase 3 inteira com ERR_MODULE_NOT_FOUND.
 * 2. **Cor nunca em hex.** Toda cor sai de token do tema — as lanes por
 *    `var(--lane-N)`, o resto por `var(--primary)`, `var(--surface-graph)`. Por
 *    isso as formas abaixo carregam um APELIDO de cor (`"lane"`, `"surface"`,
 *    `"primary"`) e nao um valor: quem desenha e que resolve o apelido, porque na
 *    UI ele vira `laneVar(node.color)` e no SVG estatico vira a string literal.
 * 3. **Subir `nodeRadius` aperta um teste.** `findCollisions`
 *    (`__tests__/geometry.ts:81`) exige folga de `nodeRadius + 1.5 +
 *    strokeWidth/2` entre a tinta de uma aresta e a tinta de um commit alheio.
 *    Hoje a folga pedida e 16.75px contra 26px de `laneWidth` — ha margem, mas
 *    ela nao e infinita: bola muito maior sem afastar as lanes reprova
 *    `layout.test.ts`.
 */
import type { GraphMetrics } from "@/types/modules";

/* ================================================================== *
 * 1. METRICAS — o esqueleto em px
 * ================================================================== */

/**
 * As medidas base da coluna. Sao o default do modulo: `GraphView` aceita
 * `metrics` por prop e sobrepoe campo a campo, mas hoje ninguem passa, entao
 * estes numeros SAO o que aparece na tela.
 *
 * `rowHeight` e o mais caro de mexer: ele nao muda so o grafo. A linha inteira
 * cresce junto, o esqueleto de carregamento tem de acompanhar
 * (`GraphView.tsx`, `LoadingRows`) e cabem menos commits na tela.
 */
export const METRICS: GraphMetrics = {
  /**
   * altura de uma linha. 52 e o MENOR valor que passa a varredura de colisao
   * (`findCollisions` em layout.test.ts, amostragem fina): 51 falha por 0.05px
   * e 48 falha por ~0.8px — o piso e geometrico (a curva de merge, de UMA
   * linha, passa a raio + traco de distancia dos circulos vizinhos), nao de
   * estilo. Comparado com o GitLens/GitKraken desktop (linhas de ~22px, so
   * mouse; a pesquisa web nao publica o valor exato do GitKraken), 52 ainda
   * e folgado; a regua de toque de 44px nao deixa descer mais (a linha
   * inteira e o alvo).
   */
  rowHeight: 52,
  /** distancia horizontal entre duas lanes. Precisa ficar acima da folga do item 3 */
  laneWidth: 26,
  /** raio da bola do commit, antes de qualquer anel */
  nodeRadius: 14,
  /**
   * margem a esquerda antes da lane 0 — mais respiro (pedido do usuario: o
   * grafo nao pode ficar encostado na borda). 64px e a medida de hoje, apos a
   * sequencia 36 -> 48 -> 64: a coluna so desloca a origem X do desenho, nao
   * toca em colisao nem em geometria (nada consome a folga).
   */
  paddingLeft: 64,
  /** espessura do traco das arestas e do contorno da bola */
  strokeWidth: 2.5,
};

/**
 * A variante COMPACTA — o desenho da densidade `"compact"` (tela pequena).
 *
 * A linha encolhe para caber mais historia na altura de um celular: a bola
 * menor, as lanes mais juntas e a margem enxuta. As mesmas regras de colisao
 * valem aqui: folga pedida de `nodeRadius + 1.5 + strokeWidth/2` = 17px contra
 * `laneWidth` de 28px — a mesma margem relativa da variante confortavel, e
 * `layout.test.ts` prova as duas com `findCollisions`.
 *
 * `rowHeight` nao pode descer abaixo do alvo de toque de 44px: a linha inteira
 * e um alvo (selecao, arraste, toque longo), e 52px deixa folga — alem de ser
 * o piso medido da varredura de colisao (ver o comentario do `rowHeight`
 * abaixo).
 */
export const METRICS_COMPACT: GraphMetrics = {
  /* altura de uma linha — o piso e o MESMO da confortavel, medido na varredura
     de colisao (`findCollisions`, layout.test.ts): 52px e o menor valor que a
     curva de merge, de UMA linha, deixa passar a raio + traco de distancia dos
     circulos vizinhos (51 falha por 0.21px). Alargar `laneWidth` tem efeito
     marginal perto do piso (medido a 51px: 28 -> 32px de lane melhora a pior
     distancia de 16.79 para 16.98px e ainda falha; zeraria so perto de 36px)
     — a amostra critica passa a dx ~2-5px e dy ~16px do commit, entao o gap
     VERTICAL da curva domina, nao o horizontal; o knob que compra linha e o
     rowHeight, nao a lane. Manter 28px e piso 52 continua, 8px acima do alvo
     de toque de 44px. */
  rowHeight: 52,
  /** distancia horizontal entre duas lanes. Acima da folga de 17px do item 3 */
  laneWidth: 28,
  /** raio da bola do commit */
  nodeRadius: 14,
  /**
   * margem a esquerda antes da lane 0 — mais respiro que os 24px anteriores
   * (sequencia 16 -> 24 -> 40; em 16 a bola quase tocava a borda). Mesma
   * natureza da confortavel: so desloca a origem X, nao muda colisao nem
   * geometria.
   */
  paddingLeft: 40,
  /** espessura do traco das arestas e do contorno da bola — mais grossa que a confortavel */
  strokeWidth: 3,
};

/* ================================================================== *
 * 2. CURVATURA — o quanto o cotovelo da aresta abre
 * ================================================================== */

/**
 * Onde ficam os pontos de controle da cubica que troca de lane, medidos em
 * fracao de UMA linha (`k = rowHeight * CONTROL_RATIO`).
 *
 * A curva sempre nasce e morre na vertical — os pontos de controle ficam
 * exatamente acima e abaixo dos extremos —, entao ela emenda sem bico no trecho
 * reto. O que este numero controla e o quanto ela demora para virar:
 *
 *   0.35  cotovelo largo, quase uma diagonal; vira cedo e chega deitada
 *   0.62  o valor de hoje: sai vertical, abre no meio, chega vertical
 *   0.95  cotovelo seco, quase um "L" arredondado; fica vertical ate o ultimo
 *         instante e faz a travessia lateral toda de uma vez
 *
 * Acima de 1.0 a curva deixa de ser monotona em Y e volta para tras — nao passe
 * de 1.0.
 *
 * O que NAO da para mexer aqui: espalhar a curva por mais de uma linha. As
 * curvas so existem na linha do filho e na do pai justamente porque essas duas
 * linhas sao as unicas em que nenhum commit alheio pode estar. Alongar a curva
 * fura essa garantia e `layout.test.ts` reprova com colisao.
 */
export const CONTROL_RATIO = 0.62;

/* ================================================================== *
 * 3. O NO — as formas empilhadas que fazem uma bola de commit
 * ================================================================== */

/** Apelido de cor. Quem desenha resolve; ver a regra 2 no topo. */
export type PaintTone = "lane" | "surface" | "primary" | "none";

/** Uma forma do no, ja pronta para virar um <circle>. */
export interface NodeShape {
  /** identidade estavel — vira a `key` do React e nao muda entre renders */
  key: string;
  /** raio em px */
  r: number;
  fill: PaintTone;
  stroke: PaintTone;
  strokeWidth: number;
  opacity: number;
}

/**
 * Ajustes finos das formas. Os deltas sao SOMADOS a `METRICS.nodeRadius`, entao
 * mexer no raio da bola arrasta os aneis junto e a proporcao se mantem.
 */
export const NODE = {
  /** quanto a bola cresce com o ponteiro em cima. 1 desliga o efeito */
  hoverScale: 1.2,
  /** o merge e uma bola cheia um pouco maior que um commit comum */
  mergeDelta: 3,
  /** o anel externo que so o merge tem — e o que da o ar "macio" */
  mergeRingDelta: 10,
  mergeRingWidth: 2,
  mergeRingOpacity: 0.5,
  /** o anel de HEAD, em cor de destaque, por fora de tudo */
  headRingDelta: 12,
  headRingWidth: 2,
  /** o ponto cheio no meio da bola de um commit raiz, em fracao do raio */
  rootCoreRatio: 0.45,
  /** o halo da selecao: um disco translucido por baixo da bola */
  haloDelta: 14,
  haloOpacity: 0.24,
  /**
   * Escala do halo com a linha NAO selecionada. Ele nunca sai do DOM e, mesmo
   * invisivel, continua sendo alvo do ponteiro — e ele que define o tamanho
   * confortavel do alvo do hover. Em repouso: (nodeRadius + haloDelta) *
   * haloRestScale ≈ 22.4px de raio. Baixar demais aqui deixa a bola dificil de
   * acertar; subir demais faz o hover disparar longe da bola.
   */
  haloRestScale: 0.8,
} as const;

/**
 * As formas de um no, de baixo para cima na ordem de pintura.
 *
 * O halo da selecao NAO esta aqui de proposito: ele e camada de interacao, e
 * animado, e vive em `CommitRow`. Aqui fica so o que o commit E.
 */
export function commitNodeShapes(node: {
  isMerge: boolean;
  isRoot: boolean;
  isHead: boolean;
}): NodeShape[] {
  const r = METRICS.nodeRadius;
  const shapes: NodeShape[] = [];

  if (node.isHead) {
    shapes.push({
      key: "head-ring",
      r: r + NODE.headRingDelta,
      fill: "none",
      stroke: "primary",
      strokeWidth: NODE.headRingWidth,
      opacity: 1,
    });
  }

  if (node.isMerge) {
    shapes.push({
      key: "merge-ring",
      r: r + NODE.mergeRingDelta,
      fill: "none",
      stroke: "lane",
      strokeWidth: NODE.mergeRingWidth,
      opacity: NODE.mergeRingOpacity,
    });
  }

  /* o corpo: merge e bola cheia, commit comum e rosquinha — o contraste entre os
     dois e o que deixa a topologia legivel de relance. */
  shapes.push({
    key: "body",
    r: node.isMerge ? r + NODE.mergeDelta : r,
    fill: node.isMerge ? "lane" : "surface",
    stroke: "lane",
    strokeWidth: METRICS.strokeWidth,
    opacity: 1,
  });

  /* a raiz ganha um miolo cheio: e o unico commit sem pai, e vale distinguir. */
  if (node.isRoot && !node.isMerge) {
    shapes.push({
      key: "root-core",
      r: r * NODE.rootCoreRatio,
      fill: "lane",
      stroke: "none",
      strokeWidth: 0,
      opacity: 1,
    });
  }

  return shapes;
}

/* ================================================================== *
 * 4. ARESTAS
 * ================================================================== */

export const EDGE = {
  /** translucidez do traco: deixa a bola do commit ganhar da linha */
  opacity: 0.85,
  /** ponta e emenda redondas — sem isto a troca de lane mostra canto vivo */
  linecap: "round",
  linejoin: "round",
} as const;

/* ================================================================== *
 * 5. TIPOGRAFIA E SUPERFICIES — daqui para baixo sao classes do Tailwind
 * ================================================================== */

/**
 * O corpo do texto de cada coluna.
 *
 * O assunto e o unico texto que interessa ler de longe; autor, data e hash sao
 * consulta, e ficam menores de proposito para nao competir com ele.
 */
export const TEXT = {
  /** o assunto do commit — a coluna Descricao */
  subject: "text-base leading-snug",
  /** o assunto do commit focado */
  subjectPrimary: "font-medium",
  /** autor, data e hash */
  meta: "text-xs",
  /** os chips de branch/tag ao lado do assunto */
  chip: "text-[11px] leading-4",
} as const;

/**
 * As camadas que pintam a LINHA (nao o grafo): hover, selecao e o realce
 * temporario do reveal.
 *
 * Todas usam o mesmo recuo e o mesmo raio, entao as tres sao a mesma pilula e
 * nunca aparecem desencontradas. O recuo lateral existe para o canto arredondado
 * ter onde aparecer: pilula colada na borda da janela nao se le como pilula.
 */
export const SURFACE = {
  /** a caixa das tres camadas de realce */
  pill: "inset-y-0.5 left-1.5 right-1.5 rounded-xl",
  /** ponteiro em cima da linha */
  hover: "bg-accent/40",
  /** linha selecionada */
  selected: "bg-primary/12",
  /** marca temporaria do reveal — precisa se distinguir da selecao */
  marked: "bg-primary/20 ring-2 ring-primary ring-inset",
  /** a barra fina que marca a linha focada, na sangria da esquerda */
  primaryBar: "inset-y-1 left-0 w-[3px] rounded-full bg-primary",
} as const;

/* ================================================================== *
 * 6. O BALAO DO HOVER — o cartao que segue o ponteiro
 * ================================================================== */

/**
 * O cartao que aparece sob o ponteiro com foto, nome, data e quantos arquivos
 * o commit mexeu.
 *
 * Ele NAO e desenho de grafo, mas mora aqui pelo mesmo motivo que o resto: e
 * aparencia, e aparencia do modulo do grafo tem um endereco so. `CommitTooltip`
 * le estes valores e nao decide nenhum tamanho por conta propria.
 *
 * `avatarPx` e o tamanho EXIBIDO; o pedido ao Gravatar sai no dobro
 * (`avatarPx * 2`, em `CommitTooltip`) para nao borrar em tela retina.
 */
export const TOOLTIP = {
  /** a caixa do cartao */
  /* `touch:hidden` (e nao um `if` no componente): num celular o dedo COBRE o
     alvo que segura, entao um balao que segue o dedo nao mostra nada — e so
     tira espaco da tela. O conteudo dele (autor, data, hash, arquivos) ja sai
     na linha compacta, entao o gatilho vira so o velho hover do mouse. */
  popup: "rounded-xl border border-border bg-popover px-3 py-2 shadow-lg touch:hidden",
  /** lado do retrato, em px — o pedido ao Gravatar sai no dobro disto */
  avatarPx: 36,
  /** a moldura do retrato, foto ou iniciais */
  avatar: "size-9 shrink-0 rounded-full object-cover",
  /** as iniciais quando nao ha foto: a cor de fundo vem da lane, nao daqui */
  initials: "grid place-items-center text-[13px] font-medium text-white",
  /** o nome do autor */
  name: "text-sm font-medium text-popover-foreground",
  /** data absoluta e contagem de arquivos */
  meta: "text-xs text-muted-foreground",
  /** o esqueleto que ocupa a contagem enquanto ela nao chegou */
  countSkeleton: "h-3 w-24 rounded",
  /** folga entre o ponteiro e o cartao */
  offset: 14,
} as const;
