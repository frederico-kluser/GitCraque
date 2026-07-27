/**
 * Gera `docs/graph-sample.svg` — um recorte estatico da View Tree, para poder
 * OLHAR o resultado do motor sem subir o app.
 *
 * O desenho sai do mesmo `computeGraphLayout` e do mesmo `buildEdgePath` que a
 * UI usa; a unica diferenca e que aqui o SVG e um so (documento estatico), e nao
 * um por linha como na virtualizacao.
 *
 *   node web/src/graph/devtools/make-sample-svg.ts
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { buildEdgePath, laneX, rowY } from "../bezier.ts";
import { computeGraphLayout, DEFAULT_METRICS } from "../layout.ts";
import { DARK, hex, LIGHT, mix } from "./palette.ts";
import type { CommitRef, RawCommit } from "@/types/git";
import type { GraphMetrics } from "@/types/modules";

/* ------------------------------------------------------------------ */
/* A historia de exemplo — do mais antigo ao mais novo                 */
/* ------------------------------------------------------------------ */

type Spec = [name: string, parents: string[], subject: string, refs?: CommitRef[]];

const branch = (name: string, isHead = false): CommitRef => ({
  kind: "localBranch",
  name,
  fullName: `refs/heads/${name}`,
  isHead,
});
const remote = (name: string): CommitRef => ({
  kind: "remoteBranch",
  name,
  fullName: `refs/remotes/${name}`,
  isHead: false,
  remote: name.split("/")[0],
});
const tag = (name: string): CommitRef => ({
  kind: "tag",
  name,
  fullName: `refs/tags/${name}`,
  isHead: false,
});
const HEAD: CommitRef = { kind: "head", name: "HEAD", isHead: true };

const HISTORY: Spec[] = [
  ["m1", [], "chore: esqueleto do projeto"],
  ["m2", ["m1"], "feat: servidor http nativo"],
  ["api1", ["m2"], "feat(api): rota de log"],
  ["m3", ["m2"], "docs: arquitetura inicial"],
  ["next1", ["m3"], "spike: worktrees por chdir"],
  ["api2", ["api1"], "feat(api): parser do topo-order"],
  ["m4", ["m3"], "feat: watcher do .git"],
  ["ui1", ["m4"], "feat(ui): shell de tres colunas"],
  ["api3", ["api2"], "test(api): separador no assunto"],
  ["ui2", ["ui1"], "feat(ui): rail de branches"],
  ["m5", ["m4"], "fix: encoding do stdout"],
  ["next2", ["next1"], "spike: trampolim de askpass"],
  ["ui3", ["ui2"], "feat(ui): painel de detalhe"],
  ["m6", ["m5"], "refactor: exec com argv"],
  ["m7", ["m6", "api3"], "merge: feature/api"],
  ["ui4", ["ui3"], "feat(ui): chips de referencia"],
  ["m8", ["m7"], "perf: buffer de 64 MB"],
  ["hot1", ["m8"], "fix: timeout de 120 s"],
  ["next3", ["next2"], "spike: proxy-editor do squash"],
  ["hot2", ["hot1"], "fix: sinal de kill"],
  ["m9", ["m8", "hot2"], "merge: hotfix/timeout"],
  ["ui5", ["ui4"], "feat(ui): grafo virtualizado", [remote("origin/feature/ui")]],
  ["m10", ["m9", "ui5"], "merge: feature/ui"],
  ["m11", ["m10"], "chore: release 1.2.0", [tag("v1.2.0")]],
  ["next4", ["next3"], "spike: dnd semantico", [branch("next")]],
  ["m12", ["m11"], "docs: manual da View Tree", [HEAD, branch("main", true), remote("origin/main")]],
];

function buildCommits(): RawCommit[] {
  const hashes = new Map<string, string>();
  HISTORY.forEach(([name], i) => {
    /* hash estavel e legivel: o indice repetido enche os 40 hex. */
    hashes.set(name, (i + 1).toString(16).padStart(2, "0").repeat(20));
  });
  const ago = ["2 minutes ago", "1 hour ago", "5 hours ago", "2 days ago", "3 weeks ago"];

  return HISTORY.map(([name, parents, subject, refs], i) => ({
    hash: hashes.get(name) as string,
    parents: parents.map((p) => hashes.get(p) as string),
    authorName: ["Ada Lovelace", "Grace Hopper", "Alan Turing"][i % 3],
    authorEmail: "dev@gitcraque.dev",
    subject,
    relativeDate: ago[Math.floor((i / HISTORY.length) * ago.length)],
    decorationRaw: "",
    refs: refs ?? [],
  })).reverse();
}

/* ------------------------------------------------------------------ */
/* Renderizacao                                                        */
/* ------------------------------------------------------------------ */

const METRICS: GraphMetrics = { ...DEFAULT_METRICS, rowHeight: 30, laneWidth: 18 };
const HEADER = 30;
const TEXT_GAP = 14;
const SUBJECT_W = 330;
const AUTHOR_W = 120;
const DATE_W = 105;
const HASH_W = 72;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const CHIP_TONE: Record<string, { fill: string; text: string }> = {
  head: { fill: "primary-soft", text: "primary" },
  localBranch: { fill: "chip", text: "fg" },
  remoteBranch: { fill: "chip", text: "muted" },
  tag: { fill: "tag-soft", text: "tag" },
  stash: { fill: "chip", text: "muted" },
};

function render(): string {
  const commits = buildCommits();
  const layout = computeGraphLayout(commits);

  const graphW = METRICS.paddingLeft * 2 + (layout.laneCount - 1) * METRICS.laneWidth;
  const textX = graphW + TEXT_GAP;
  const width = textX + SUBJECT_W + AUTHOR_W + DATE_W + HASH_W + 16;
  const height = HEADER + commits.length * METRICS.rowHeight + 8;

  const parts: string[] = [];

  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
      `viewBox="0 0 ${width} ${height}" font-family="Geist, Inter, system-ui, sans-serif">`,
  );

  /* Tokens do tema, com a variante escura por media query. O arquivo abre solto
     no navegador e segue o esquema de cor do sistema. */
  const vars = (p: typeof LIGHT) =>
    [
      ...p.lanes.map((c, i) => `--lane-${i}:${hex(c)}`),
      `--bg:${hex(p.background)}`,
      `--surface:${hex(p.surface)}`,
      `--fg:${hex(p.foreground)}`,
      `--muted:${hex(p.muted)}`,
      `--border:${hex(p.border)}`,
      `--primary:${hex(p.primary)}`,
      /* fundos de chip ja MISTURADOS com o fundo: cor solida em vez de alfa,
         para o arquivo renderizar igual em qualquer visualizador de SVG. */
      `--chip-bg:${hex(mix(p.background, p.border, 0.55))}`,
      `--chip-head:${hex(mix(p.background, p.primary, 0.18))}`,
      `--chip-tag:${hex(mix(p.background, p.lanes[2], 0.22))}`,
    ].join(";");

  parts.push(
    `<style>` +
      `svg{${vars(LIGHT)}}` +
      `@media (prefers-color-scheme: dark){svg{${vars(DARK)}}}` +
      `.bg{fill:var(--bg)}.surface{fill:var(--surface)}` +
      `.hd{fill:var(--muted);font-size:10px;letter-spacing:.08em}` +
      `.sub{fill:var(--fg);font-size:12px}` +
      `.meta{fill:var(--muted);font-size:11px}` +
      `.hash{fill:var(--muted);font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}` +
      `.rule{stroke:var(--border);stroke-width:1}` +
      `.chip{fill:var(--chip-bg)}.chip-text{fill:var(--fg);font-size:9.5px}` +
      `.primary-soft{fill:var(--chip-head)}.primary{fill:var(--primary);font-size:9.5px}` +
      `.tag-soft{fill:var(--chip-tag)}.tag{fill:var(--lane-2);font-size:9.5px}` +
      `.muted{fill:var(--muted);font-size:9.5px}.fg{fill:var(--fg);font-size:9.5px}` +
      `</style>`,
  );

  parts.push(`<rect class="bg" x="0" y="0" width="${width}" height="${height}"/>`);
  parts.push(`<rect class="surface" x="0" y="${HEADER}" width="${graphW + 4}" height="${height - HEADER}"/>`);

  /* cabecalho de colunas */
  const columns: Array<[string, number]> = [
    ["Grafo", METRICS.paddingLeft - 4],
    ["Descricao", textX],
    ["Autor", textX + SUBJECT_W],
    ["Data", textX + SUBJECT_W + AUTHOR_W],
    ["Hash", textX + SUBJECT_W + AUTHOR_W + DATE_W],
  ];
  for (const [label, x] of columns) {
    parts.push(`<text class="hd" x="${x}" y="${HEADER - 11}">${label}</text>`);
  }
  parts.push(`<line class="rule" x1="0" y1="${HEADER - 0.5}" x2="${width}" y2="${HEADER - 0.5}"/>`);

  parts.push(`<g transform="translate(0 ${HEADER})">`);

  /* arestas primeiro, para os circulos ficarem por cima */
  for (const edge of layout.edges) {
    parts.push(
      `<path d="${buildEdgePath(edge, METRICS)}" fill="none" stroke="var(--lane-${edge.color})" ` +
        `stroke-width="${METRICS.strokeWidth}" stroke-linecap="round" opacity="0.9"/>`,
    );
  }

  for (const node of layout.nodes) {
    const cx = laneX(node.lane, METRICS);
    const cy = rowY(node.row, METRICS);
    const stroke = `var(--lane-${node.color})`;

    if (node.commit.refs.some((r) => r.kind === "head")) {
      parts.push(
        `<circle cx="${cx}" cy="${cy}" r="${METRICS.nodeRadius + 3}" fill="none" ` +
          `stroke="var(--primary)" stroke-width="1.25"/>`,
      );
    }
    parts.push(
      `<circle cx="${cx}" cy="${cy}" r="${node.isMerge ? METRICS.nodeRadius + 1.5 : METRICS.nodeRadius}" ` +
        `fill="${node.isMerge ? stroke : "var(--surface)"}" stroke="${stroke}" ` +
        `stroke-width="${METRICS.strokeWidth}"/>`,
    );
    if (node.isRoot && !node.isMerge) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${METRICS.nodeRadius - 2}" fill="${stroke}"/>`);
    }

    /* faixa de texto: chips de ref, assunto, autor, data e hash curto */
    let x = textX;
    for (const ref of node.commit.refs) {
      const tone = CHIP_TONE[ref.kind] ?? CHIP_TONE.localBranch;
      const w = 9 + ref.name.length * 5.6;
      parts.push(
        `<rect class="${tone.fill}" x="${x}" y="${cy - 7}" width="${w.toFixed(1)}" height="14" rx="4"/>` +
          `<text class="${tone.text}" x="${(x + 4.5).toFixed(1)}" y="${cy + 3.5}">${esc(ref.name)}</text>`,
      );
      x += w + 5;
    }
    const room = Math.max(0, textX + SUBJECT_W - x - 8);
    const subject =
      node.commit.subject.length > room / 6.4
        ? `${node.commit.subject.slice(0, Math.max(0, Math.floor(room / 6.4) - 1))}…`
        : node.commit.subject;
    parts.push(`<text class="sub" x="${x.toFixed(1)}" y="${cy + 4}">${esc(subject)}</text>`);
    parts.push(
      `<text class="meta" x="${textX + SUBJECT_W}" y="${cy + 4}">${esc(node.commit.authorName)}</text>`,
    );
    parts.push(
      `<text class="meta" x="${textX + SUBJECT_W + AUTHOR_W}" y="${cy + 4}">${esc(node.commit.relativeDate)}</text>`,
    );
    parts.push(
      `<text class="hash" x="${textX + SUBJECT_W + AUTHOR_W + DATE_W}" y="${cy + 4}">${node.commit.hash.slice(0, 7)}</text>`,
    );
  }

  parts.push(`</g>`);
  parts.push(`</svg>`);
  return `${parts.join("\n")}\n`;
}

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, "../../../../docs/graph-sample.svg");
const svg = render();
writeFileSync(target, svg, "utf8");
console.log(`docs/graph-sample.svg — ${svg.length} bytes, ${HISTORY.length} commits`);
