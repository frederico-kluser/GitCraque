/**
 * Historicos sinteticos para os testes do motor do grafo.
 *
 * Tudo aqui e DETERMINISTICO: nada de `Math.random`, nada de `Date`. O gerador
 * grande usa um PRNG proprio com semente fixa, entao o repo de 20 000 commits e
 * sempre exatamente o mesmo.
 *
 * Convencao de ordem: os geradores montam a historia do MAIS ANTIGO para o mais
 * novo (que e a ordem natural em que pai existe antes do filho) e devolvem o
 * array invertido — que e uma ordem topologica valida, igual a que
 * `git log --topo-order` produz: nenhum pai aparece antes de um filho seu.
 */
import type { CommitRef, RawCommit } from "@/types/git";

export const hashOf = (n: number): string => n.toString(16).padStart(40, "0");

export function commitOf(
  hash: string,
  parents: string[],
  subject = "sem assunto",
  refs: CommitRef[] = [],
): RawCommit {
  return {
    hash,
    parents,
    authorName: "Ada Lovelace",
    authorEmail: "ada@example.com",
    subject,
    relativeDate: "3 days ago",
    decorationRaw: "",
    refs,
  };
}

/** Monta um historico a partir de pares [nome, pais], do mais antigo ao mais novo. */
export function buildHistory(spec: Array<[string, string[]]>): RawCommit[] {
  const byName = new Map<string, string>();
  spec.forEach(([name], i) => byName.set(name, hashOf(i + 1)));
  const hash = (name: string) => {
    const h = byName.get(name);
    if (h === undefined) throw new Error(`commit desconhecido: ${name}`);
    return h;
  };
  return spec
    .map(([name, parents]) => commitOf(hash(name), parents.map(hash), name))
    .reverse();
}

/** Encontra a linha de um commit pelo nome (o `subject` guarda o nome). */
export const rowOf = (commits: RawCommit[], name: string): number =>
  commits.findIndex((c) => c.subject === name);

/* ------------------------------------------------------------------ */
/* Casos nomeados                                                      */
/* ------------------------------------------------------------------ */

/** Historico estritamente linear: c1 <- c2 <- ... <- cN. */
export function linearHistory(n: number): RawCommit[] {
  const spec: Array<[string, string[]]> = [];
  for (let i = 1; i <= n; i++) spec.push([`c${i}`, i === 1 ? [] : [`c${i - 1}`]]);
  return buildHistory(spec);
}

/**
 * Uma branch que sai da main e volta por um merge.
 *
 *   A <- B <- C <----- M <- D      (main)
 *         \           /
 *          F1 <- F2 -+             (feature)
 */
export function branchAndMerge(): RawCommit[] {
  return buildHistory([
    ["A", []],
    ["B", ["A"]],
    ["F1", ["B"]],
    ["F2", ["F1"]],
    ["C", ["B"]],
    ["M", ["C", "F2"]],
    ["D", ["M"]],
  ]);
}

/** Duas linhas independentes, vivas ao mesmo tempo, sem ancestral comum. */
export function twoParallelBranches(): RawCommit[] {
  /* montado a mao para que as duas linhas fiquem INTERCALADAS na saida, que e o
     que acontece de verdade com `--all` quando os dois ramos tem commits novos. */
  const a1 = hashOf(1);
  const a2 = hashOf(2);
  const b1 = hashOf(3);
  const b2 = hashOf(4);
  return [
    commitOf(a2, [a1], "A2"),
    commitOf(b2, [b1], "B2"),
    commitOf(a1, [], "A1"),
    commitOf(b1, [], "B1"),
  ];
}

/** Duas raizes distintas costuradas por um merge (`--allow-unrelated-histories`). */
export function multiRootHistory(): RawCommit[] {
  return buildHistory([
    ["R1", []],
    ["P1", ["R1"]],
    ["R2", []],
    ["Q1", ["R2"]],
    ["M", ["P1", "Q1"]],
    ["Z", ["M"]],
  ]);
}

/** Octopus: um merge com quatro pais. */
export function octopusHistory(): RawCommit[] {
  return buildHistory([
    ["R", []],
    ["A", ["R"]],
    ["B", ["R"]],
    ["C", ["R"]],
    ["D", ["R"]],
    ["OCTO", ["A", "B", "C", "D"]],
  ]);
}

/**
 * Caso degenerado que quebra a geometria ingenua: `git merge --no-ff` de um
 * commit que JA e ancestral. O segundo pai do merge e o pai do primeiro pai,
 * entao a aresta de merge precisa desviar por uma lane propria para nao passar
 * por cima do commit do meio.
 */
export function mergeOfAncestor(): RawCommit[] {
  return buildHistory([
    ["P", []],
    ["A", ["P"]],
    ["M", ["A", "P"]],
  ]);
}

/* ------------------------------------------------------------------ */
/* Repositorio sintetico grande                                        */
/* ------------------------------------------------------------------ */

/** mulberry32 — PRNG deterministico de 32 bits, sem dependencia. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SyntheticOptions {
  seed?: number;
  /** quantas branches podem estar abertas ao mesmo tempo */
  maxOpen?: number;
}

/**
 * Um repositorio realista: uma `main` de vida longa, branches curtas que saem
 * dela e voltam por merge, e algumas branches ainda abertas no fim.
 *
 * Os commits da main tem `subject` comecando com "main" ou "merge", o que
 * permite ao teste provar que a lane dela nao serpenteia.
 */
export function syntheticRepo(target: number, options: SyntheticOptions = {}): RawCommit[] {
  const rand = mulberry32(options.seed ?? 20260727);
  const maxOpen = options.maxOpen ?? 6;
  const commits: RawCommit[] = [];
  let counter = 0;

  const mk = (parents: string[], subject: string): string => {
    const hash = hashOf(++counter);
    commits.push(commitOf(hash, parents, subject));
    return hash;
  };

  interface OpenBranch {
    name: string;
    tip: string;
    left: number;
  }

  let main = mk([], "main root");
  const open: OpenBranch[] = [];

  while (commits.length < target) {
    main = mk([main], `main ${counter}`);

    if (open.length < maxOpen && rand() < 0.28) {
      open.push({ name: `feat-${counter}`, tip: main, left: 2 + Math.floor(rand() * 14) });
    }

    for (const branch of open) {
      if (rand() < 0.7) {
        branch.tip = mk([branch.tip], `${branch.name} ${counter}`);
        branch.left -= 1;
      }
    }

    for (let i = open.length - 1; i >= 0; i--) {
      if (open[i].left <= 0) {
        main = mk([main, open[i].tip], `merge ${open[i].name}`);
        open.splice(i, 1);
      }
    }
  }

  /* o ultimo commit criado e da main, para que a ponta da main seja a linha 0. */
  mk([main], `main ${counter}`);

  /* invertido = ordem topologica; o corte deixa os MAIS NOVOS, exatamente como
     um `git log` com limite faz (e os pais que ficaram de fora exercitam a
     liberacao de lanes do algoritmo). */
  return commits.reverse().slice(0, target);
}

/** true quando o commit pertence a linha principal do repo sintetico. */
export const isMainLine = (c: RawCommit) =>
  c.subject.startsWith("main") || c.subject.startsWith("merge");
