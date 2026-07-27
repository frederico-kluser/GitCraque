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
 * E por isso que `shortHash` esta duplicado de `@/lib/utils` aqui embaixo.
 */
import type {
  Branch,
  DragIntent,
  DragIntentOption,
  DragPayload,
  DropPayload,
  RefsPayload,
} from "@/types/git";
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

/** O contexto que o provider passa: as refs carregadas e o ramo do HEAD. */
export interface DragIntentContext {
  refs: RefsPayload | null;
  headBranch: string | null;
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
      ? ` (${branch.ahead} a frente, ${branch.behind} atras)`
      : "";
  return ` ${name} acompanha ${branch.upstream}${gap}: depois do rebase o push vai exigir --force-with-lease.`;
}

function invalid(
  source: DragPayload,
  target: DropPayload,
  reason: string,
  title = "Movimento nao permitido",
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
  // Soltar em si mesmo nunca e operacao — vale para qualquer tipo.
  if (source.type === target.type && source.key === target.key) {
    return invalid(
      source,
      target,
      `Origem e destino sao a mesma referencia (${source.label}).`,
      "Mesma referencia",
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
        `Tags nao se movem por arrasto: mover a tag ${source.label} exigiria recria-la. Use o dialogo de tags.`,
      );
    case "stash":
      return invalid(
        source,
        target,
        `Stash nao se aplica por arrasto. Use aplicar ou descartar em ${source.label} no rail.`,
      );
    default:
      return invalid(source, target, "Tipo de origem desconhecido para o motor de intencoes.");
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
  switch (target.type) {
    case "branch":
      return cherryPick(source, target, ctx);
    case "commit":
      return invalid(
        source,
        target,
        "Dois commits nao formam operacao. Arraste o commit para um ramo para fazer cherry-pick.",
      );
    case "remoteBranch":
      return invalid(
        source,
        target,
        `Nao se aplica commit direto num ramo remoto. Faca cherry-pick no ramo local e depois push para ${target.label}.`,
      );
    case "tag":
      return invalid(
        source,
        target,
        "Uma tag aponta para um commit, ela nao recebe commits. Crie uma tag nova pelo dialogo de tags.",
      );
    case "trash":
      return invalid(
        source,
        target,
        "Commit nao se apaga por arrasto. Use reset ou revert pelo menu do commit.",
      );
    default:
      return invalid(source, target, "Alvo desconhecido para um commit.");
  }
}

function cherryPick(
  source: DragPayload,
  target: DropPayload,
  ctx: DragIntentContext,
): DragIntent {
  const branch = target.key;

  const held = heldByOtherWorktree(ctx, branch);
  if (held) {
    return invalid(
      source,
      target,
      `O ramo ${branch} esta checado na worktree ${held}. O cherry-pick precisa faze-lo virar HEAD; troque de worktree antes.`,
      "Ramo ocupado em outra worktree",
    );
  }

  const abbrev = shortHash(source.key);
  const subject = source.detail ? ` (${source.detail})` : "";
  const onHead = isHeadBranch(ctx, branch);
  const description = onHead
    ? `Aplica o commit ${abbrev}${subject} sobre ${branch}, que e o ramo atual. Cria um commit NOVO; nada e reescrito.`
    : `Aplica o commit ${abbrev}${subject} sobre ${branch}. Como ${branch} nao e o ramo atual, o backend faz o checkout antes — e para isso que vai o campo "onto". Cria um commit NOVO; nada e reescrito.`;

  const option: DragIntentOption = {
    id: "cherry-pick",
    label: `Cherry-pick em ${branch}`,
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
    title: `Cherry-pick em ${branch}`,
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
  switch (target.type) {
    case "branch":
      return integrate(source, target, ctx);
    case "trash":
      return deleteLocalBranch(source, target, ctx);
    case "remoteBranch":
      return invalid(
        source,
        target,
        `Arrastar um ramo local para um remoto seria um push, que precisa de remoto, upstream e force-with-lease. Use o dialogo de Push para enviar ${source.label}.`,
      );
    case "commit":
      return invalid(
        source,
        target,
        `Mover ${source.label} para outro commit e git reset, que descarta trabalho. Faca pelo menu do commit, nao por arrasto.`,
      );
    case "tag":
      return invalid(
        source,
        target,
        "Um ramo nao vira tag por arrasto. Crie a tag pelo dialogo de tags.",
      );
    default:
      return invalid(source, target, "Alvo desconhecido para um ramo.");
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
  const from = refName(source);
  const into = target.key;

  const heldTarget = heldByOtherWorktree(ctx, into);
  if (heldTarget) {
    return invalid(
      source,
      target,
      `O ramo ${into} esta checado na worktree ${heldTarget}. Merge e rebase precisam dele como HEAD; troque de worktree antes.`,
      "Ramo ocupado em outra worktree",
    );
  }

  const intoIsHead = isHeadBranch(ctx, into);
  const checkoutNote = intoIsHead
    ? ""
    : ` Como ${into} nao e o ramo atual, o backend faz o checkout antes — e para isso que vai o campo "into".`;

  const merge: DragIntentOption = {
    id: "merge",
    label: `Merge de ${from} em ${into}`,
    description: `Traz os commits de ${from} para ${into}, criando um commit de merge. NENHUM historico e reescrito.${checkoutNote}`,
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
      label: `Rebase de ${from} em cima de ${into}`,
      description: `REESCREVE ${from}: os commits de ${from} que ainda nao estao em ${into} sao reaplicados um a um em cima de ${into}. ${into} nao muda e nao recebe nada.${upstreamNote(ctx, from)}`,
      preview: ["rebase", into, from],
      endpoint: INTENT_ENDPOINTS.rebase,
      body: { source: from, onto: into },
      destructive: true,
    });
  }

  const tail = !rebasable
    ? ` Rebase nao entra na lista: ${from} e um ramo remoto e nao pode ser reescrito daqui — para reescrever ${into} em cima dele, use Pull com rebase.`
    : heldSource
      ? ` Rebase nao entra na lista: ${from} esta checado na worktree ${heldSource} e teria de virar HEAD.`
      : "";

  return {
    kind: "merge",
    source,
    target,
    title: `${from} para ${into}`,
    description: `Escolha como integrar ${from} em ${into}. Merge preserva o historico dos dois; rebase reescreve ${from}.${tail}`,
    options,
    allowed: true,
  };
}

function deleteLocalBranch(
  source: DragPayload,
  target: DropPayload,
  ctx: DragIntentContext,
): DragIntent {
  const name = source.key;

  if (isHeadBranch(ctx, name)) {
    return invalid(
      source,
      target,
      `${name} e o ramo atual e o git nao apaga o ramo em que voce esta. Troque de ramo antes.`,
      "Ramo atual",
    );
  }

  const held = heldByOtherWorktree(ctx, name);
  if (held) {
    return invalid(
      source,
      target,
      `${name} esta checado na worktree ${held}. O git nao apaga um ramo checado em nenhuma worktree.`,
      "Ramo ocupado em outra worktree",
    );
  }

  const description = `Remove o ramo LOCAL ${name}. Commits que so existiam nele ficam inalcancaveis. O remoto nao e tocado.`;

  return {
    kind: "delete-branch",
    source,
    target,
    title: `Apagar o ramo ${name}`,
    description,
    options: [
      {
        id: "delete-local",
        label: `Apagar ${name}`,
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
  switch (target.type) {
    case "branch":
      return integrate(source, target, ctx);
    case "trash":
      return deleteRemoteBranch(source, target);
    case "remoteBranch":
      return invalid(
        source,
        target,
        "Dois ramos remotos nao formam operacao local. Traga um deles para um ramo local primeiro.",
      );
    case "commit":
      return invalid(
        source,
        target,
        "Ramo remoto nao se move para um commit daqui: quem move um ref no servidor e o push.",
      );
    case "tag":
      return invalid(
        source,
        target,
        "Um ramo remoto nao vira tag por arrasto. Crie a tag pelo dialogo de tags.",
      );
    default:
      return invalid(source, target, "Alvo desconhecido para um ramo remoto.");
  }
}

function deleteRemoteBranch(source: DragPayload, target: DropPayload): DragIntent {
  const remote = remoteOf(source);
  if (!remote) {
    return invalid(
      source,
      target,
      `Nao da para descobrir o remoto de ${source.label}. Apague pelo dialogo de ramos remotos.`,
    );
  }

  const name = bareName(source);
  const description = `Apaga o ramo ${name} NO SERVIDOR ${remote}. Todo mundo que usa esse remoto perde a referencia; isso nao se desfaz com um comando local.`;

  return {
    kind: "delete-branch",
    source,
    target,
    title: `Apagar ${remote}/${name} no servidor`,
    description,
    options: [
      {
        id: "delete-remote",
        label: `Apagar ${remote}/${name}`,
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
