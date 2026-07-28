/**
 * MOTOR SEMANTICO DE DND — as regras duras de intercepcao.
 *
 * `resolveDragIntent` e uma funcao PURA: mesma entrada, mesma saida, sem tocar
 * store, rede ou DOM. Ela decide O QUE vai acontecer; quem executa e o dialogo,
 * depois da confirmacao do usuario.
 *
 * A matriz obrigatoria do produto:
 *
 *   commit      -> branch   => cherry-pick (uma opcao, confirmacao simples)
 *   branch      -> branch   => merge | rebase (duas opcoes)
 *   qualquer    -> ele mesmo=> recusado
 *   commit      -> commit   => recusado
 *
 * O resto e recusado com motivo legivel, com tres excecoes deliberadas, todas
 * dentro do vocabulario ja congelado de `DragIntentKind`/`DropZoneType`:
 *
 *   remoteBranch -> branch  => merge (SO merge; ver nota em `integrate`)
 *   branch       -> trash   => delete-branch (local)
 *   remoteBranch -> trash   => delete-branch (no servidor)
 *
 * Este arquivo nao importa NADA em tempo de execucao (so `import type`), o que
 * o torna carregavel direto pelo `node --test` com type-stripping, sem bundler.
 * E por isso que `shortHash` esta duplicado de `@/lib/utils` aqui embaixo — e
 * tambem por que o TRADUTOR chega pelo contexto em vez de ser importado: um
 * `import { t } from "@/i18n"` aqui e um import de runtime com alias, e os dois
 * quebram o carregamento direto pelo node.
 */
import type {
  Branch,
  DragIntent,
  DragIntentOption,
  DragPayload,
  DropPayload,
  RefsPayload,
} from "@/types/git";
import type { Translate } from "@/i18n/types";
import type { ResolveDragIntent } from "@/types/modules";

/* ------------------------------------------------------------------ */
/* Rotas — espelho exato de `web/src/lib/api.ts`                       */
/* ------------------------------------------------------------------ */

/**
 * As unicas rotas que o motor pode emitir. Cada uma existe em
 * `web/src/lib/api.ts` com o corpo declarado ao lado; o teste da matriz
 * (`__tests__/intents.test.mjs`) confere campo a campo contra aquele arquivo.
 */
export const INTENT_ENDPOINTS = {
  /** api.cherryPick — { commits: string[]; onto?: string } */
  cherryPick: "/ops/cherry-pick",
  /** api.merge — { source: string; into?: string } */
  merge: "/ops/merge",
  /** api.rebase — { source: string; onto: string } */
  rebase: "/ops/rebase",
  /** api.deleteBranchLocal — { name: string; force?: boolean } */
  deleteBranchLocal: "/branch/delete-local",
  /** api.deleteBranchRemote — { remote: string; name: string } */
  deleteBranchRemote: "/branch/delete-remote",
} as const;

/**
 * O contexto que o provider passa: as refs carregadas, o ramo do HEAD e o
 * tradutor. `t` e obrigatorio de proposito — sem ele o motor teria de carregar
 * um catalogo, e a pureza do modulo (ver cabecalho) iria junto.
 */
export interface DragIntentContext {
  refs: RefsPayload | null;
  headBranch: string | null;
  t: Translate;
}

/* ------------------------------------------------------------------ */
/* Helpers puros                                                       */
/* ------------------------------------------------------------------ */

/** Abreviacao de hash como o git exibe. Duplicado de `@/lib/utils` de proposito
 *  (ver cabecalho: este modulo nao pode ter import de runtime). */
const shortHash = (hash: string) => hash.slice(0, 7);

/** Nome de ref pronto para o git. Um remoteBranch pode chegar como "main" com
 *  `remote: "origin"` ou ja como "origin/main"; as duas formas viram "origin/main". */
function refName(p: DragPayload | DropPayload): string {
  if (p.remote && !p.key.startsWith(`${p.remote}/`)) return `${p.remote}/${p.key}`;
  return p.key;
}

/** O remoto de um remoteBranch: o campo explicito ou o primeiro segmento da chave. */
function remoteOf(p: DragPayload | DropPayload): string | undefined {
  if (p.remote) return p.remote;
  const slash = p.key.indexOf("/");
  return slash > 0 ? p.key.slice(0, slash) : undefined;
}

/** Nome sem o prefixo do remoto — o que `git push <remote> --delete` espera. */
function bareName(p: DragPayload | DropPayload): string {
  const remote = remoteOf(p);
  return remote && p.key.startsWith(`${remote}/`) ? p.key.slice(remote.length + 1) : p.key;
}

function findBranch(refs: RefsPayload | null, name: string): Branch | undefined {
  return refs?.branches.find((b) => b.name === name || b.fullName === name);
}

function isHeadBranch(ctx: DragIntentContext, name: string): boolean {
  if (ctx.headBranch && ctx.headBranch === name) return true;
  return findBranch(ctx.refs, name)?.isHead === true;
}

/**
 * Caminho da worktree que segura o ramo, quando NAO e a worktree ativa.
 * `checkedOutIn` tambem vem preenchido para o ramo do HEAD atual — esse caso
 * nao bloqueia nada, por isso a exclusao explicita.
 */
function heldByOtherWorktree(
  ctx: DragIntentContext,
  name: string,
): string | undefined {
  const branch = findBranch(ctx.refs, name);
  if (!branch || isHeadBranch(ctx, name)) return undefined;
  return branch.checkedOutIn || undefined;
}

/** Resumo do upstream, para deixar claro no rebase o que sera republicado. */
function upstreamNote(ctx: DragIntentContext, name: string): string {
  const branch = findBranch(ctx.refs, name);
  if (!branch?.upstream) return "";
  const gap =
    branch.ahead || branch.behind
      ? ctx.t("intent.rebase.upstreamGap", { ahead: branch.ahead, behind: branch.behind })
      : "";
  return ctx.t("intent.rebase.upstreamNote", { name, upstream: branch.upstream, gap });
}

function invalid(
  source: DragPayload,
  target: DropPayload,
  reason: string,
  title: string,
): DragIntent {
  return {
    kind: "invalid",
    source,
    target,
    title,
    description: reason,
    options: [],
    allowed: false,
    reason,
  };
}

/* ------------------------------------------------------------------ */
/* A funcao publica                                                    */
/* ------------------------------------------------------------------ */

export function resolveDragIntent(
  source: DragPayload,
  target: DropPayload,
  context: DragIntentContext,
): DragIntent {
  const t = context.t;

  // Soltar em si mesmo nunca e operacao — vale para qualquer tipo.
  if (source.type === target.type && source.key === target.key) {
    return invalid(
      source,
      target,
      t("intent.sameRef", { label: source.label }),
      t("intent.sameRef.title"),
    );
  }

  switch (source.type) {
    case "commit":
      return fromCommit(source, target, context);
    case "branch":
      return fromBranch(source, target, context);
    case "remoteBranch":
      return fromRemoteBranch(source, target, context);
    case "tag":
      return invalid(
        source,
        target,
        t("intent.tag.noDrag", { label: source.label }),
        t("intent.invalid.title"),
      );
    case "stash":
      return invalid(
        source,
        target,
        t("intent.stash.noDrag", { label: source.label }),
        t("intent.invalid.title"),
      );
    default:
      return invalid(source, target, t("intent.unknownSource"), t("intent.invalid.title"));
  }
}

/** Prova em tempo de compilacao de que a assinatura casa com `types/modules.ts`. */
const _assertContract: ResolveDragIntent = resolveDragIntent;
void _assertContract;

/* ------------------------------------------------------------------ */
/* commit -> *                                                         */
/* ------------------------------------------------------------------ */

function fromCommit(
  source: DragPayload,
  target: DropPayload,
  ctx: DragIntentContext,
): DragIntent {
  const t = ctx.t;
  const title = t("intent.invalid.title");

  switch (target.type) {
    case "branch":
      return cherryPick(source, target, ctx);
    case "commit":
      return invalid(source, target, t("intent.commit.toCommit"), title);
    case "remoteBranch":
      return invalid(source, target, t("intent.commit.toRemote", { label: target.label }), title);
    case "tag":
      return invalid(source, target, t("intent.commit.toTag"), title);
    case "trash":
      return invalid(source, target, t("intent.commit.toTrash"), title);
    default:
      return invalid(source, target, t("intent.unknownTarget.commit"), title);
  }
}

function cherryPick(
  source: DragPayload,
  target: DropPayload,
  ctx: DragIntentContext,
): DragIntent {
  const t = ctx.t;
  const branch = target.key;

  const held = heldByOtherWorktree(ctx, branch);
  if (held) {
    return invalid(
      source,
      target,
      t("intent.cherryPick.busy", { branch, worktree: held }),
      t("intent.branchBusy.title"),
    );
  }

  const abbrev = shortHash(source.key);
  const subject = source.detail ? ` (${source.detail})` : "";
  const onHead = isHeadBranch(ctx, branch);
  const description = onHead
    ? t("intent.cherryPick.onHead", { hash: abbrev, subject, branch })
    : t("intent.cherryPick.offHead", { hash: abbrev, subject, branch });

  const option: DragIntentOption = {
    id: "cherry-pick",
    label: t("intent.cherryPick.label", { branch }),
    description,
    preview: ["cherry-pick", abbrev],
    endpoint: INTENT_ENDPOINTS.cherryPick,
    body: { commits: [source.key], onto: branch },
    destructive: false,
  };

  return {
    kind: "cherry-pick",
    source,
    target,
    title: t("intent.cherryPick.title", { branch }),
    description,
    options: [option],
    allowed: true,
  };
}

/* ------------------------------------------------------------------ */
/* branch -> *                                                         */
/* ------------------------------------------------------------------ */

function fromBranch(
  source: DragPayload,
  target: DropPayload,
  ctx: DragIntentContext,
): DragIntent {
  const t = ctx.t;
  const title = t("intent.invalid.title");

  switch (target.type) {
    case "branch":
      return integrate(source, target, ctx);
    case "trash":
      return deleteLocalBranch(source, target, ctx);
    case "remoteBranch":
      return invalid(source, target, t("intent.branch.toRemote", { label: source.label }), title);
    case "commit":
      return invalid(source, target, t("intent.branch.toCommit", { label: source.label }), title);
    case "tag":
      return invalid(source, target, t("intent.branch.toTag"), title);
    default:
      return invalid(source, target, t("intent.unknownTarget.branch"), title);
  }
}

/**
 * merge | rebase — o coracao da regra branch -> branch.
 *
 * Semantica do arrasto: o que e ARRASTADO e integrado ao ALVO.
 *   merge : `git merge <arrastado>` estando em <alvo> — ninguem e reescrito.
 *   rebase: `git rebase <alvo> <arrastado>` — o ARRASTADO e reescrito.
 *
 * Origem remoteBranch recebe SO o merge: `git rebase main origin/main` faria
 * checkout de um ref remoto e cairia em detached HEAD. Inverter os papeis
 * (reescrever o alvo em vez do arrastado) seria pior ainda — e exatamente a
 * confusao de "quem e reescrito" que a regra existe para evitar.
 */
function integrate(
  source: DragPayload,
  target: DropPayload,
  ctx: DragIntentContext,
): DragIntent {
  const t = ctx.t;
  const from = refName(source);
  const into = target.key;

  const heldTarget = heldByOtherWorktree(ctx, into);
  if (heldTarget) {
    return invalid(
      source,
      target,
      t("intent.integrate.busy", { branch: into, worktree: heldTarget }),
      t("intent.branchBusy.title"),
    );
  }

  const intoIsHead = isHeadBranch(ctx, into);
  const checkoutNote = intoIsHead ? "" : t("intent.integrate.checkoutNote", { into });

  const merge: DragIntentOption = {
    id: "merge",
    label: t("intent.merge.label", { from, into }),
    description: t("intent.merge.description", { from, into, checkoutNote }),
    preview: ["merge", from],
    endpoint: INTENT_ENDPOINTS.merge,
    body: { source: from, into },
    destructive: false,
  };

  const options: DragIntentOption[] = [merge];

  // Rebase so faz sentido quando a origem e um ramo LOCAL que pode virar HEAD.
  const rebasable = source.type === "branch";
  const heldSource = rebasable ? heldByOtherWorktree(ctx, from) : undefined;

  if (rebasable && !heldSource) {
    options.push({
      id: "rebase",
      label: t("intent.rebase.label", { from, into }),
      description: t("intent.rebase.description", {
        from,
        into,
        upstreamNote: upstreamNote(ctx, from),
      }),
      preview: ["rebase", into, from],
      endpoint: INTENT_ENDPOINTS.rebase,
      body: { source: from, onto: into },
      destructive: true,
    });
  }

  const tail = !rebasable
    ? t("intent.integrate.noRebaseRemote", { from, into })
    : heldSource
      ? t("intent.integrate.noRebaseBusy", { from, worktree: heldSource })
      : "";

  return {
    kind: "merge",
    source,
    target,
    title: t("intent.integrate.title", { from, into }),
    description: t("intent.integrate.description", { from, into, tail }),
    options,
    allowed: true,
  };
}

function deleteLocalBranch(
  source: DragPayload,
  target: DropPayload,
  ctx: DragIntentContext,
): DragIntent {
  const t = ctx.t;
  const name = source.key;

  if (isHeadBranch(ctx, name)) {
    return invalid(
      source,
      target,
      t("intent.delete.currentBranch", { name }),
      t("intent.delete.currentBranch.title"),
    );
  }

  const held = heldByOtherWorktree(ctx, name);
  if (held) {
    return invalid(
      source,
      target,
      t("intent.delete.busy", { name, worktree: held }),
      t("intent.branchBusy.title"),
    );
  }

  const description = t("intent.delete.local.description", { name });

  return {
    kind: "delete-branch",
    source,
    target,
    title: t("intent.delete.local.title", { name }),
    description,
    options: [
      {
        id: "delete-local",
        label: t("intent.delete.local.label", { name }),
        description,
        preview: ["branch", "-d", name],
        endpoint: INTENT_ENDPOINTS.deleteBranchLocal,
        body: { name, force: false },
        destructive: true,
      },
    ],
    allowed: true,
  };
}

/* ------------------------------------------------------------------ */
/* remoteBranch -> *                                                   */
/* ------------------------------------------------------------------ */

function fromRemoteBranch(
  source: DragPayload,
  target: DropPayload,
  ctx: DragIntentContext,
): DragIntent {
  const t = ctx.t;
  const title = t("intent.invalid.title");

  switch (target.type) {
    case "branch":
      return integrate(source, target, ctx);
    case "trash":
      return deleteRemoteBranch(source, target, ctx);
    case "remoteBranch":
      return invalid(source, target, t("intent.remote.toRemote"), title);
    case "commit":
      return invalid(source, target, t("intent.remote.toCommit"), title);
    case "tag":
      return invalid(source, target, t("intent.remote.toTag"), title);
    default:
      return invalid(source, target, t("intent.unknownTarget.remoteBranch"), title);
  }
}

function deleteRemoteBranch(
  source: DragPayload,
  target: DropPayload,
  ctx: DragIntentContext,
): DragIntent {
  const t = ctx.t;
  const remote = remoteOf(source);
  if (!remote) {
    return invalid(
      source,
      target,
      t("intent.remote.noRemote", { label: source.label }),
      t("intent.invalid.title"),
    );
  }

  const name = bareName(source);
  const description = t("intent.delete.remote.description", { name, remote });

  return {
    kind: "delete-branch",
    source,
    target,
    title: t("intent.delete.remote.title", { remote, name }),
    description,
    options: [
      {
        id: "delete-remote",
        label: t("intent.delete.remote.label", { remote, name }),
        description,
        preview: ["push", remote, "--delete", name],
        endpoint: INTENT_ENDPOINTS.deleteBranchRemote,
        body: { remote, name },
        destructive: true,
      },
    ],
    allowed: true,
  };
}
