/**
 * Todas as acoes de repositorio que nascem nos PAINEIS, num lugar so.
 *
 * Duas regras governam este arquivo:
 *
 * 1. Nada executa direto quando e destrutivo ou precisa de entrada: a acao vira
 *    um `ConfirmAction` (`askConfirm`) e quem executa e o `ConfirmHost`, depois
 *    da confirmacao. As intencoes vindas do DRAG-AND-DROP tem outro caminho,
 *    que nao e meu: `setPendingIntent` → `DialogHost` de `@/dialogs`.
 * 2. Toda mutacao passa por `runOperation` do store — e ele que liga o
 *    indicador de operacao, emite o toast com o argv e dispara o refresh.
 *
 * Nenhuma rota e inventada aqui: tudo sai de `@/lib/api`.
 *
 * Texto: `t()` e chamado NA HORA de montar cada dialogo, nunca em constante de
 * modulo — senao o rotulo congelaria no idioma que valia quando o arquivo foi
 * carregado.
 */
import { api } from "@/lib/api";
import {
  getState,
  loadLog,
  openRepository,
  refreshAll,
  runOperation,
  switchWorktree,
  toast,
} from "@/state/store";
import { openDialog } from "@/dialogs";
import { askConfirm } from "@/hooks";
import type { ConfirmField } from "@/hooks";
import { t } from "@/i18n";
import type { CommitRef, PendingOperationKind, Remote, Worktree } from "@/types/git";
import { short, truncate } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const flag = (values: Record<string, string>, name: string) => values[name] === "true";
const text = (values: Record<string, string>, name: string) => (values[name] ?? "").trim();

/** As opcoes de remoto para os campos `select`, lidas do estado corrente. */
function remoteOptions(): Array<{ value: string; label: string }> {
  const remotes: Remote[] = getState().repo?.remotes ?? getState().refs?.remotes ?? [];
  return remotes.map((r) => ({ value: r.name, label: `${r.name} — ${r.pushUrl || r.fetchUrl}` }));
}

/** `origin` quando existe; senao o primeiro que `git remote -v` listou. */
const defaultRemote = () => {
  const names = remoteOptions().map((o) => o.value);
  return names.find((n) => n === "origin") ?? names[0] ?? "origin";
};

const currentBranch = () => getState().repo?.head.branch ?? getState().status?.branch ?? null;

/** O commit do log carregado, quando ele esta la — para rotular menus e dialogos. */
const commitOf = (hash: string) => getState().log?.commits.find((c) => c.hash === hash) ?? null;

/* ------------------------------------------------------------------ */
/* Area de transferencia                                               */
/* ------------------------------------------------------------------ */

/**
 * Copia e avisa. O `CopyButton` do catalogo resolve isso dentro de um botao com
 * estado proprio; um item de menu some no clique, entao o retorno visual aqui e
 * o toast — sem ele a pessoa nao sabe se copiou.
 */
export async function doCopy(text: string, label: string) {
  if (await writeClipboard(text)) toast("success", label, truncate(text, 72));
  else
    toast(
      "error",
      t("copy.failed", { label: label.toLowerCase() }),
      t("copy.failed.body"),
    );
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* segue para o plano B */
  }
  // Plano B para contexto nao seguro — o app servido pelo IP da maquina, e nao
  // por localhost, nao ganha `navigator.clipboard`.
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Rede — fetch / pull / push                                          */
/* ------------------------------------------------------------------ */

export const doFetch = () =>
  runOperation(t("action.fetch"), () => api.fetch({ all: true, prune: true }), {
    refresh: "refs",
    successMessage: t("action.fetch.done"),
  });

/** Fetch de UM remoto — o menu do remoto no rail. */
export const doFetchRemote = (remote: string) =>
  runOperation(t("action.fetchRemote.op", { remote }), () => api.fetch({ remote, prune: true }), {
    refresh: "refs",
    successMessage: t("action.fetchRemote.done", { remote }),
  });

export const doPull = (rebase = false) =>
  runOperation(rebase ? t("action.pullRebase") : t("action.pull"), () => api.pull({ rebase }), {
    successMessage: rebase ? t("action.pullRebase.done") : t("action.pull.done"),
  });

/**
 * Dialogo de push: escolhe o destino a partir de `git remote -v`, com
 * `--set-upstream`, `--tags` e `--force-with-lease` (que e destrutivo e por
 * isso exige o hold).
 */
export function openPushDialog(preset: { remote?: string; branch?: string } = {}) {
  const branch = preset.branch ?? currentBranch() ?? "";
  const remotes = remoteOptions();

  if (remotes.length === 0) {
    openAddRemote();
    toast("warning", t("action.push.noRemote.title"), t("action.push.noRemote.body"));
    return;
  }

  askConfirm({
    title: t("action.push.title"),
    description: t("action.push.description", { branch: branch || t("action.push.currentBranch") }),
    preview: ["git", "push", preset.remote ?? defaultRemote(), branch].filter(Boolean),
    confirmLabel: t("action.push.confirm"),
    fields: [
      {
        kind: "select",
        name: "remote",
        label: t("action.push.field.remote"),
        value: preset.remote ?? defaultRemote(),
        options: remotes,
      },
      {
        kind: "text",
        name: "branch",
        label: t("action.push.field.branch"),
        value: branch,
        placeholder: t("action.push.field.branch.placeholder"),
      },
      {
        kind: "toggle",
        name: "setUpstream",
        label: "--set-upstream",
        value: false,
        hint: t("action.push.field.setUpstream.hint"),
      },
      { kind: "toggle", name: "tags", label: "--tags", value: false, hint: t("action.push.field.tags.hint") },
      {
        kind: "toggle",
        name: "forceWithLease",
        label: "--force-with-lease",
        value: false,
        hint: t("action.push.field.force.hint"),
      },
    ],
    run: (values) =>
      runOperation(
        t("action.push.title"),
        () =>
          api.push({
            remote: text(values, "remote") || defaultRemote(),
            branch: text(values, "branch") || undefined,
            setUpstream: flag(values, "setUpstream"),
            tags: flag(values, "tags"),
            forceWithLease: flag(values, "forceWithLease"),
          }),
        { refresh: "refs", successMessage: t("action.push.done") },
      ),
  });
}

/* ------------------------------------------------------------------ */
/* Branches                                                            */
/* ------------------------------------------------------------------ */

/** Abre o seletor de repositorios da maquina (recentes, varredura, navegacao). */
export function openRepoPicker() {
  openDialog({ kind: "repo-picker" });
}

/**
 * Abre OUTRO repositorio direto, sem passar pelo seletor — o caminho ja e
 * conhecido (um favorito, um recente). Irma de `doSwitchWorktree`: as duas sao
 * `process.chdir()` no servidor, e o recarregamento vem do `cwd:changed`.
 */
export const doOpenRepository = (path: string) => openRepository(path);

export function openCreateBranch(startPoint?: string) {
  askConfirm({
    title: t("action.branch.new"),
    description: startPoint
      ? t("action.branch.new.from", { ref: short(startPoint) })
      : t("action.branch.new.fromHead"),
    preview: ["git", "branch", t("argv.name"), startPoint ?? ""].filter(Boolean),
    confirmLabel: t("common.create"),
    fields: [
      {
        kind: "text",
        name: "name",
        label: t("action.branch.field.name"),
        placeholder: t("action.branch.new.namePlaceholder"),
        required: true,
      },
      {
        kind: "text",
        name: "startPoint",
        label: t("action.branch.field.startPoint"),
        value: startPoint ?? "",
        placeholder: "HEAD",
      },
      { kind: "toggle", name: "checkout", label: t("action.branch.field.checkout"), value: true },
    ],
    run: (values) =>
      runOperation(
        t("action.branch.create"),
        () =>
          api.createBranch({
            name: text(values, "name"),
            startPoint: text(values, "startPoint") || undefined,
            checkout: flag(values, "checkout"),
          }),
        { refresh: "refs", successMessage: t("action.branch.created", { name: text(values, "name") }) },
      ),
  });
}

export const doCheckout = (ref: string) =>
  runOperation(t("action.checkout"), () => api.checkout({ ref }), {
    refresh: "head",
    successMessage: t("action.checkout.done", { ref }),
  });

/**
 * Duplo clique num chip de referencia da View Tree: troca para aquela branch.
 *
 * Tres casos, e os tres importam:
 *
 *  · branch local           checkout direto;
 *  · branch presa em OUTRA worktree  o git recusaria — a saida certa nao e
 *    forcar, e trocar de worktree, que e `process.chdir()` e nao mexe na arvore
 *    de ninguem. Aqui so avisamos, porque trocar sozinho seria surpresa;
 *  · branch remota          nao da para "entrar" num remoto: cria a branch
 *    local rastreando-a, que e o que a pessoa quis dizer.
 */
export function doActivateRef(refEntry: CommitRef) {
  const { refs } = getState();

  if (refEntry.kind === "localBranch") {
    const branch = refs?.branches.find((b) => b.name === refEntry.name);
    if (branch?.isHead) {
      toast("info", t("action.checkout.already", { name: refEntry.name }));
      return;
    }
    if (branch?.checkedOutIn) {
      toast(
        "warning",
        t("action.checkout.inUse", { name: refEntry.name }),
        t("action.checkout.inUse.body", { worktree: branch.checkedOutIn }),
      );
      return;
    }
    void doCheckout(refEntry.name);
    return;
  }

  if (refEntry.kind === "remoteBranch") {
    const local = refEntry.name.includes("/")
      ? refEntry.name.slice(refEntry.name.indexOf("/") + 1)
      : refEntry.name;
    const jaExiste = refs?.branches.some((b) => b.name === local);
    if (jaExiste) {
      void doCheckout(local);
      return;
    }
    void runOperation(
      t("action.checkout"),
      () => api.checkout({ ref: refEntry.name, createBranch: local }),
      {
        refresh: "refs",
        successMessage: t("action.checkout.tracking", { branch: local, remote: refEntry.name }),
      },
    );
  }
}

/**
 * Merge de uma ref na branch ATUAL — `git merge <origem>` sem trocar de branch.
 *
 * Irma da opcao "merge" do arrasto, mas com a direcao fixa e explicita: no
 * arrasto quem recebe e o alvo do drop, aqui e sempre a branch em que voce esta.
 * Um menu de contexto nao tem alvo — tem so o item clicado, e a unica leitura
 * sem ambiguidade e "traga isto para ca".
 */
export function openMergeInto(source: string) {
  const alvo = currentBranch();
  if (!alvo) {
    toast(
      "warning",
      t("action.detached.title"),
      t("action.merge.detached.body"),
    );
    return;
  }
  askConfirm({
    title: t("action.merge.title", { source, target: alvo }),
    description: t("action.merge.description", { source, target: alvo }),
    preview: ["git", "merge", "--no-edit", source],
    confirmLabel: t("action.merge.confirm"),
    fields: [
      {
        kind: "toggle",
        name: "noFf",
        label: "--no-ff",
        value: false,
        hint: t("action.merge.noFf.hint"),
      },
      {
        kind: "toggle",
        name: "squash",
        label: "--squash",
        value: false,
        hint: t("action.merge.squash.hint"),
      },
    ],
    run: (values) =>
      runOperation(
        t("action.merge.op"),
        () => api.merge({ source, noFf: flag(values, "noFf"), squash: flag(values, "squash") }),
        { refresh: "all", successMessage: t("action.merge.done", { source, target: alvo }) },
      ),
  });
}

/**
 * Rebase da branch ATUAL em cima de outra — o caso comum de "atualiza minha
 * branch com a main". Destrutivo: reescreve a branch atual, nao a outra.
 */
export function openRebaseOnto(onto: string) {
  const alvo = currentBranch();
  if (!alvo) {
    toast(
      "warning",
      t("action.detached.title"),
      t("action.rebase.detached.body"),
    );
    return;
  }
  askConfirm({
    title: t("action.rebase.title", { branch: alvo, onto }),
    description: t("action.rebase.description", { branch: alvo, onto }),
    preview: ["git", "rebase", "--autostash", onto, alvo],
    destructive: true,
    confirmLabel: t("action.rebase.confirm"),
    run: () =>
      runOperation(t("action.rebase.op"), () => api.rebase({ source: alvo, onto }), {
        refresh: "all",
        successMessage: t("action.rebase.done", { branch: alvo, onto }),
      }),
  });
}

export function openRenameBranch(from: string) {
  askConfirm({
    title: t("action.branch.rename.title", { name: from }),
    description: t("action.branch.rename.description"),
    preview: ["git", "branch", "-m", from, t("argv.newName")],
    confirmLabel: t("action.branch.rename.confirm"),
    fields: [{ kind: "text", name: "to", label: t("action.branch.rename.field"), value: from, required: true }],
    run: (values) =>
      runOperation(t("action.branch.rename.op"), () => api.renameBranch({ from, to: text(values, "to") }), {
        refresh: "refs",
      }),
  });
}

/** Destrutivo: exige hold. */
export function openDeleteBranchLocal(name: string) {
  askConfirm({
    title: t("action.branch.deleteLocal.title"),
    description: t("action.branch.deleteLocal.description", { name }),
    preview: ["git", "branch", "-d", name],
    destructive: true,
    confirmLabel: t("action.branch.deleteLocal.confirm"),
    fields: [
      {
        kind: "toggle",
        name: "force",
        label: t("action.branch.deleteLocal.force"),
        value: false,
        hint: t("action.branch.deleteLocal.force.hint"),
      },
    ],
    run: (values) =>
      runOperation(
        t("action.branch.deleteLocal.op"),
        () => api.deleteBranchLocal({ name, force: flag(values, "force") }),
        { refresh: "refs", successMessage: t("action.branch.deleteLocal.done", { name }) },
      ),
  });
}

/**
 * O remoto de uma branch: o do upstream quando ele existe, senao o padrao.
 *
 * `upstream` vem como "origin/main"; o que interessa e so a primeira parte. Uma
 * branch pode ter upstream num remoto que nao e o `origin`, e apagar no remoto
 * errado seria pior do que nao apagar.
 */
export function remoteOfBranch(name: string): string {
  const branch = getState().refs?.branches.find((b) => b.name === name);
  const upstream = branch?.upstream;
  const dono = upstream?.includes("/") ? upstream.slice(0, upstream.indexOf("/")) : null;
  return dono ?? defaultRemote();
}

/** A branch tem lado remoto conhecido por este clone? */
export function hasRemoteCounterpart(name: string, remote = remoteOfBranch(name)): boolean {
  const remotas = getState().refs?.remoteBranches ?? [];
  return remotas.some((rb) => rb.remote === remote && rb.shortName === name);
}

/**
 * Os dois lados de uma vez. Destrutivo: exige hold.
 *
 * `-D` e nao `-d`: quem pede para apagar tambem no remoto ja decidiu que a
 * branch acabou, e parar no meio com "not fully merged" deixaria o remoto
 * apagado e o local vivo — o pior dos dois mundos.
 */
export function openDeleteBranchBoth(name: string, remote = remoteOfBranch(name)) {
  askConfirm({
    title: t("action.branch.deleteBoth.title", { remote }),
    description: t("action.branch.deleteBoth.description", { name, remote }),
    preview: ["git", "branch", "-D", name, "&&", "git", "push", remote, "--delete", name],
    destructive: true,
    confirmLabel: t("action.branch.deleteBoth.confirm"),
    run: async () => {
      const result = await runOperation(
        t("action.branch.deleteBoth.op"),
        () => api.deleteBranchLocal({ name, force: true, remote }),
        { refresh: "refs" },
      );
      // O toast do `runOperation` ja saiu; este segundo existe para a pessoa
      // saber que o remoto nao tinha o que apagar, em vez de supor que apagou.
      if (result?.ok && result.skippedRemote) {
        toast("info", t("action.branch.deleteBoth.doneLocalOnly", { name, remote }));
      }
    },
  });
}

/**
 * A saida para a branch que se recusa a morrer. Destrutivo: exige hold.
 *
 * `git branch -d` recusa branch checada em worktree, e a worktree recusa sair
 * com codigo nao commitado. Os dois erros apontam um para o outro e a pessoa
 * fica presa no meio. Esta acao quebra o ciclo — e por isso a descricao diz,
 * antes do hold, exatamente o que vai ser destruido.
 */
export function openDeleteBranchAll(name: string) {
  const branch = getState().refs?.branches.find((b) => b.name === name);
  const worktree = branch?.checkedOutIn ?? null;
  const remote = remoteOfBranch(name);
  const comRemoto = hasRemoteCounterpart(name, remote);
  const naPrincipal = worktree ? worktree === getState().worktrees?.mainRoot : false;

  const descricao = comRemoto
    ? t("action.branch.deleteAll.description.withRemote", { name, remote })
    : t("action.branch.deleteAll.description", { name });
  const aviso = !worktree
    ? null
    : naPrincipal
      ? t("action.branch.deleteAll.pinnedMain")
      : t("action.branch.deleteAll.pinned", { worktree });

  askConfirm({
    title: t("action.branch.deleteAll.title", { name }),
    description: aviso ? `${descricao} ${aviso}` : descricao,
    preview: worktree
      ? naPrincipal
        ? ["git", "checkout", "--detach", "&&", "git", "reset", "--hard", "&&", "git", "clean", "-fd"]
        : ["git", "worktree", "remove", "--force", worktree, "&&", "git", "branch", "-D", name]
      : ["git", "branch", "-D", name],
    destructive: true,
    confirmLabel: t("action.branch.deleteAll.confirm"),
    run: () =>
      runOperation(
        t("action.branch.deleteAll.op"),
        () => api.deleteBranchAll({ name, ...(comRemoto ? { remote } : {}) }),
        // "all": a cascata pode ter mexido em worktree, HEAD, refs e no proprio
        // diretorio do servidor. Recarregar so as refs mentiria sobre o resto.
        { refresh: "all", successMessage: t("action.branch.deleteAll.done", { name }) },
      ),
  });
}

/** Destrutivo: exige hold. */
export function openDeleteBranchRemote(remote: string, name: string) {
  askConfirm({
    title: t("action.branch.deleteRemote.title"),
    description: t("action.branch.deleteRemote.description", { name, remote }),
    preview: ["git", "push", remote, "--delete", name],
    destructive: true,
    confirmLabel: t("action.branch.deleteRemote.confirm", { remote }),
    run: () =>
      runOperation(t("action.branch.deleteRemote.op"), () => api.deleteBranchRemote({ remote, name }), {
        refresh: "refs",
        successMessage: t("action.branch.deleteRemote.done", { remote, name }),
      }),
  });
}

/* ------------------------------------------------------------------ */
/* Commits — checkout, cherry-pick, revert, reset                      */
/* ------------------------------------------------------------------ */

/**
 * Checkout de um COMMIT, nao de uma branch: o HEAD fica detached.
 *
 * Isso precisa estar escrito na cara. Um cliente grafico que leva a pessoa para
 * detached HEAD sem avisar produz o classico "commitei e perdi tudo" — os
 * commits ficam sem nenhuma ref apontando para eles.
 */
export function openCheckoutCommit(hash: string) {
  const subject = commitOf(hash)?.subject;
  askConfirm({
    title: t("action.checkoutCommit.title", { hash: short(hash) }),
    description: t("action.checkoutCommit.description", {
      what: subject ? `"${truncate(subject, 60)}"` : short(hash),
    }),
    preview: ["git", "checkout", short(hash)],
    confirmLabel: t("action.checkout"),
    run: () =>
      runOperation(t("action.checkout"), () => api.checkout({ ref: hash }), {
        refresh: "head",
        successMessage: t("action.checkoutCommit.done", { hash: short(hash) }),
      }),
  });
}

/**
 * Cherry-pick na branch atual. Sem `onto`: o backend aplica sobre o HEAD.
 *
 * A ordem enviada nao importa — o backend reordena topologicamente antes de
 * chamar o git, porque cherry-pick fora de ordem gera conflito a toa.
 */
export function openCherryPick(commits: string[]) {
  if (commits.length === 0) return;
  const alvo = currentBranch();
  const um = commits.length === 1;
  const subject = um ? commitOf(commits[0])?.subject : null;

  askConfirm({
    title: t("action.cherryPick.title", { count: commits.length, hash: short(commits[0]) }),
    description: t("action.cherryPick.description", {
      what: t("action.cherryPick.what", {
        count: commits.length,
        subject: subject ? `"${truncate(subject, 48)}"` : short(commits[0]),
      }),
      target: alvo ?? t("action.cherryPick.currentHead"),
    }),
    preview: ["git", "cherry-pick", ...commits.slice(0, 4).map((h) => short(h)), commits.length > 4 ? "…" : ""].filter(Boolean),
    confirmLabel: t("action.cherryPick.confirm"),
    fields: [
      {
        kind: "toggle",
        name: "noCommit",
        label: "-n (--no-commit)",
        value: false,
        hint: t("action.cherryPick.noCommit.hint"),
      },
    ],
    run: (values) =>
      runOperation(
        t("action.cherryPick.op"),
        () => api.cherryPick({ commits, noCommit: flag(values, "noCommit") }),
        { refresh: "all", successMessage: t("action.cherryPick.done") },
      ),
  });
}

/** Revert: cria um commit que DESFAZ outro. Nao reescreve nada. */
export function openRevert(hash: string) {
  const subject = commitOf(hash)?.subject;
  askConfirm({
    title: t("action.revert.title", { hash: short(hash) }),
    description: t("action.revert.description", {
      what: subject ? `"${truncate(subject, 48)}"` : short(hash),
    }),
    preview: ["git", "revert", "--no-edit", short(hash)],
    confirmLabel: t("action.revert.confirm"),
    fields: [
      {
        kind: "toggle",
        name: "noCommit",
        label: "-n (--no-commit)",
        value: false,
        hint: t("action.revert.noCommit.hint"),
      },
    ],
    run: (values) =>
      runOperation(t("action.revert.op"), () => api.revert({ hash, noCommit: flag(values, "noCommit") }), {
        refresh: "all",
        successMessage: t("action.revert.done", { hash: short(hash) }),
      }),
  });
}

/**
 * Reset da branch atual ate um commit. O modo e a escolha inteira, e por isso
 * ele e um campo do dialogo em vez de tres itens de menu quase iguais.
 */
export function openResetTo(hash: string) {
  const alvo = currentBranch();
  askConfirm({
    title: t("action.reset.title", { branch: alvo ?? "HEAD", hash: short(hash) }),
    description: t("action.reset.description", {
      branch: alvo ?? t("action.reset.head"),
      hash: short(hash),
    }),
    preview: ["git", "reset", "--mixed", short(hash)],
    destructive: true,
    confirmLabel: t("action.reset.confirm"),
    fields: [
      {
        kind: "select",
        name: "mode",
        label: t("action.reset.field.mode"),
        value: "mixed",
        options: [
          { value: "soft", label: t("action.reset.mode.soft") },
          { value: "mixed", label: t("action.reset.mode.mixed") },
          { value: "hard", label: t("action.reset.mode.hard") },
        ],
      },
    ],
    run: (values) => {
      const mode = (text(values, "mode") || "mixed") as "soft" | "mixed" | "hard";
      return runOperation(t("action.reset.op"), () => api.reset({ ref: hash, mode }), {
        refresh: "all",
        successMessage: t("action.reset.done", { mode, hash: short(hash) }),
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Tags                                                                */
/* ------------------------------------------------------------------ */

export function openCreateTag(ref?: string) {
  askConfirm({
    title: t("action.tag.new"),
    description: ref ? t("action.tag.new.at", { ref: short(ref) }) : t("action.tag.new.atHead"),
    preview: ["git", "tag", t("argv.name"), ref ?? ""].filter(Boolean),
    confirmLabel: t("action.tag.confirm"),
    fields: [
      { kind: "text", name: "name", label: t("action.tag.field.name"), placeholder: "v1.0.0", required: true },
      { kind: "text", name: "ref", label: t("action.tag.field.target"), value: ref ?? "", placeholder: "HEAD" },
      {
        kind: "textarea",
        name: "message",
        label: t("action.tag.field.message"),
        placeholder: t("common.optional"),
      },
    ],
    run: (values) =>
      runOperation(
        t("action.tag.op"),
        () =>
          api.createTag({
            name: text(values, "name"),
            ref: text(values, "ref") || undefined,
            message: text(values, "message") || undefined,
          }),
        { refresh: "refs" },
      ),
  });
}

export function openDeleteTag(name: string, remotes: string[] = []) {
  askConfirm({
    title: t("action.tag.delete.title", { name }),
    description: t("action.tag.delete.description"),
    preview: ["git", "tag", "-d", name],
    destructive: true,
    confirmLabel: t("action.tag.delete.confirm"),
    fields:
      remotes.length > 0
        ? [
            {
              kind: "select",
              name: "remote",
              label: t("action.tag.delete.field"),
              value: "",
              options: [
                { value: "", label: t("action.tag.delete.localOnly") },
                ...remotes.map((r) => ({ value: r, label: r })),
              ],
            } satisfies ConfirmField,
          ]
        : undefined,
    run: (values) =>
      runOperation(
        t("action.tag.delete.op"),
        () => api.deleteTag({ name, remote: text(values, "remote") || undefined }),
        { refresh: "refs" },
      ),
  });
}

/* ------------------------------------------------------------------ */
/* Remotos                                                             */
/* ------------------------------------------------------------------ */

export function openAddRemote(name = "origin") {
  askConfirm({
    title: t("action.remote.add.title"),
    description: t("action.remote.add.description"),
    preview: ["git", "remote", "add", name, t("argv.url")],
    confirmLabel: t("action.remote.add.confirm"),
    fields: [
      { kind: "text", name: "name", label: t("action.remote.field.name"), value: name, required: true },
      {
        kind: "text",
        name: "url",
        label: t("action.remote.field.url"),
        // Exemplo sem palavra de idioma nenhum: `org/repo` serve para os quatro.
        placeholder: "https://github.com/org/repo.git",
        required: true,
      },
    ],
    run: (values) =>
      runOperation(
        t("action.remote.add.op"),
        () => api.addRemote({ name: text(values, "name"), url: text(values, "url") }),
        { refresh: "config" },
      ),
  });
}

export function openEditRemoteUrl(remote: Remote) {
  askConfirm({
    title: t("action.remote.url.title", { name: remote.name }),
    description: t("action.remote.url.description"),
    preview: ["git", "remote", "set-url", remote.name, t("argv.url")],
    confirmLabel: t("action.remote.url.confirm"),
    fields: [
      { kind: "text", name: "url", label: t("action.remote.field.url"), value: remote.fetchUrl, required: true },
      { kind: "toggle", name: "push", label: t("action.remote.url.pushOnly"), value: false },
    ],
    run: (values) =>
      runOperation(
        t("action.remote.url.op"),
        () => api.setRemoteUrl({ name: remote.name, url: text(values, "url"), push: flag(values, "push") }),
        { refresh: "config" },
      ),
  });
}

export function openRemoveRemote(name: string) {
  askConfirm({
    title: t("action.remote.remove.title", { name }),
    description: t("action.remote.remove.description", { name }),
    preview: ["git", "remote", "remove", name],
    destructive: true,
    confirmLabel: t("action.remote.remove.confirm"),
    run: () => runOperation(t("action.remote.remove.op"), () => api.removeRemote({ name }), { refresh: "config" }),
  });
}

/* ------------------------------------------------------------------ */
/* Worktrees — a troca e chdir, nunca checkout                         */
/* ------------------------------------------------------------------ */

/**
 * A UNICA forma de trocar de worktree: `switchWorktree` bate em
 * `POST /api/worktrees/switch`, que faz `process.chdir()` no servidor.
 * Nao existe `api.checkout` neste caminho.
 */
export const doSwitchWorktree = (wt: Worktree | string) => switchWorktree(wt);

export function openAddWorktree() {
  askConfirm({
    title: t("action.worktree.add.title"),
    description: t("action.worktree.add.description"),
    preview: ["git", "worktree", "add", t("argv.path")],
    confirmLabel: t("action.worktree.add.confirm"),
    fields: [
      {
        kind: "text",
        name: "path",
        label: t("action.worktree.field.path"),
        placeholder: t("action.worktree.field.path.placeholder"),
        required: true,
      },
      {
        kind: "text",
        name: "newBranch",
        label: t("action.worktree.field.newBranch"),
        placeholder: t("common.optional"),
      },
      { kind: "text", name: "ref", label: t("action.worktree.field.ref"), placeholder: "HEAD" },
    ],
    run: (values) =>
      runOperation(
        t("action.worktree.add.op"),
        () =>
          api.addWorktree({
            path: text(values, "path"),
            newBranch: text(values, "newBranch") || undefined,
            ref: text(values, "ref") || undefined,
          }),
        { refresh: "all" },
      ),
  });
}

export function openRemoveWorktree(wt: Worktree) {
  askConfirm({
    title: t("action.worktree.remove.title", { label: wt.label }),
    description: t("action.worktree.remove.description", { path: wt.path }),
    preview: ["git", "worktree", "remove", wt.path],
    destructive: true,
    confirmLabel: t("action.worktree.remove.confirm"),
    fields: [
      {
        kind: "toggle",
        name: "force",
        label: "--force",
        value: false,
        hint: t("action.worktree.remove.force.hint"),
      },
    ],
    run: (values) =>
      runOperation(
        t("action.worktree.remove.op"),
        () => api.removeWorktree({ path: wt.path, force: flag(values, "force") }),
        { refresh: "all" },
      ),
  });
}

export function openPruneWorktrees() {
  askConfirm({
    title: t("action.worktree.prune.title"),
    description: t("action.worktree.prune.description"),
    preview: ["git", "worktree", "prune"],
    confirmLabel: t("action.worktree.prune.confirm"),
    run: () => runOperation(t("action.worktree.prune.op"), () => api.pruneWorktrees(), { refresh: "all" }),
  });
}

/* ------------------------------------------------------------------ */
/* Stash                                                               */
/* ------------------------------------------------------------------ */

export function openStashPush() {
  askConfirm({
    title: t("action.stash.title"),
    description: t("action.stash.description"),
    preview: ["git", "stash", "push"],
    confirmLabel: t("action.stash.confirm"),
    fields: [
      {
        kind: "text",
        name: "message",
        label: t("action.stash.field.message"),
        placeholder: t("common.optional"),
      },
      { kind: "toggle", name: "includeUntracked", label: t("action.stash.field.untracked"), value: false },
    ],
    run: (values) =>
      runOperation(
        t("action.stash.title"),
        () =>
          api.stashPush({
            message: text(values, "message") || undefined,
            includeUntracked: flag(values, "includeUntracked"),
          }),
        { refresh: "all" },
      ),
  });
}

export const doStashApply = (ref: string) =>
  runOperation(t("action.stash.apply.op"), () => api.stashApply({ ref }), { refresh: "all" });

export function openStashPop(ref: string) {
  askConfirm({
    title: t("action.stash.pop.title", { ref }),
    description: t("action.stash.pop.description"),
    preview: ["git", "stash", "pop", ref],
    destructive: true,
    confirmLabel: t("action.stash.pop.confirm"),
    run: () => runOperation(t("action.stash.pop.op"), () => api.stashApply({ ref, pop: true }), { refresh: "all" }),
  });
}

export function openStashDrop(ref: string) {
  askConfirm({
    title: t("action.stash.drop.title", { ref }),
    description: t("action.stash.drop.description"),
    preview: ["git", "stash", "drop", ref],
    destructive: true,
    confirmLabel: t("action.stash.drop.confirm"),
    run: () => runOperation(t("action.stash.drop.op"), () => api.stashDrop({ ref }), { refresh: "all" }),
  });
}

/* ------------------------------------------------------------------ */
/* Staging e commit                                                    */
/* ------------------------------------------------------------------ */

export const doStage = (paths: string[]) =>
  runOperation(t("action.stage.op"), () => api.stage({ paths }), {
    refresh: "index",
    successMessage: t("action.stage.done"),
  });

export const doUnstage = (paths: string[]) =>
  runOperation(t("action.unstage.op"), () => api.unstage({ paths }), {
    refresh: "index",
    successMessage: t("action.unstage.done"),
  });

/** Sem dialogo: o `HoldToConfirmButton` da propria linha ja e a confirmacao. */
export const doDiscard = (paths: string[]) =>
  runOperation(t("action.discard.op"), () => api.discard({ paths }), {
    refresh: "worktree",
    successMessage: t("action.discard.done"),
  });

/**
 * Descartar a partir do MENU, onde nao existe o hold da linha.
 *
 * O dialogo destrutivo traz o `HoldToConfirmButton` de volta — descartar apaga
 * trabalho que o git nao guarda em lugar nenhum, e essa e a unica acao do painel
 * de alteracoes sem rede de seguranca.
 */
export function openDiscard(paths: string[]) {
  if (paths.length === 0) return;
  askConfirm({
    title: t("action.discard.title", { count: paths.length, path: paths[0] }),
    description: t("action.discard.description", { count: paths.length }),
    preview: ["git", "restore", "--", ...paths.slice(0, 3), paths.length > 3 ? "…" : ""].filter(Boolean),
    destructive: true,
    confirmLabel: t("action.discard.confirm"),
    run: () => doDiscard(paths),
  });
}

export const doCommit = (body: { message: string; amend?: boolean; signoff?: boolean }) =>
  runOperation(t("action.commit.op"), () => api.doCommit(body), {
    refresh: "all",
    successMessage: t("action.commit.done"),
  });

/* ------------------------------------------------------------------ */
/* Squash — GIT_SEQUENCE_EDITOR + proxy-editor                         */
/* ------------------------------------------------------------------ */

export function openSquash(commits: string[]) {
  if (commits.length < 2) {
    toast("warning", t("action.squash.needsTwo"), t("action.squash.needsTwo.body"));
    return;
  }
  askConfirm({
    title: t("action.squash.title", { count: commits.length }),
    description: t("action.squash.description"),
    preview: ["git", "rebase", "-i", `${short(commits[commits.length - 1])}^`],
    destructive: true,
    confirmLabel: t("action.squash.confirm"),
    fields: [
      {
        kind: "textarea",
        name: "message",
        label: t("action.squash.field.message"),
        placeholder: t("action.squash.field.message.placeholder"),
      },
      { kind: "toggle", name: "fixup", label: t("action.squash.field.fixup"), value: false },
    ],
    run: (values) =>
      runOperation(
        t("action.squash.confirm"),
        () =>
          api.squash({
            commits,
            message: text(values, "message") || undefined,
            fixup: flag(values, "fixup"),
          }),
        { refresh: "all", successMessage: t("action.squash.done") },
      ),
  });
}

/* ------------------------------------------------------------------ */
/* Operacao pendente (rebase/merge/cherry-pick/revert em curso)        */
/* ------------------------------------------------------------------ */

export const doContinue = (kind: PendingOperationKind) =>
  runOperation(t("action.continue.op", { kind }), () => api.continueOp({ kind: normalizeKind(kind) }), {
    refresh: "rebase-state",
  });

export function openAbort(kind: PendingOperationKind) {
  askConfirm({
    title: t("action.abort.title", { kind }),
    description: t("action.abort.description"),
    preview: ["git", normalizeKind(kind), "--abort"],
    destructive: true,
    confirmLabel: t("action.abort.confirm"),
    run: () =>
      runOperation(t("action.abort.op", { kind }), () => api.abort({ kind: normalizeKind(kind) }), {
        refresh: "rebase-state",
      }),
  });
}

/** O contrato de `/ops/abort` e `/ops/continue` nao conhece "rebase-interactive" nem "bisect". */
function normalizeKind(kind: PendingOperationKind): "rebase" | "merge" | "cherry-pick" | "revert" {
  if (kind === "rebase-interactive" || kind === "bisect") return "rebase";
  return kind;
}

/* ------------------------------------------------------------------ */
/* Desfazer / refazer                                                  */
/* ------------------------------------------------------------------ */

/**
 * Os dois unicos botoes que mexem no HEAD sem `askConfirm`.
 *
 * A regra da casa e que acao destrutiva pede pressao continua, e `reset --hard`
 * e destrutivo — mas aqui o servidor guarda o trabalho pendente num stash
 * amarrado ao passo antes de resetar, e o refazer devolve tudo. Como o passo e
 * reversivel por construcao, exigir o hold seria cobrar por um risco que nao
 * existe. Se essa garantia cair no backend, o gate volta junto.
 *
 * Nenhum sha viaja daqui: o passo sai do cursor do servidor sobre o reflog.
 */
export const doUndo = () =>
  runOperation(t("action.undo.op"), () => api.undo(), {
    refresh: "all",
    successMessage: t("action.undo.done"),
  });

export const doRedo = () =>
  runOperation(t("action.redo.op"), () => api.redo(), {
    refresh: "all",
    successMessage: t("action.redo.done"),
  });

/* ------------------------------------------------------------------ */
/* Diversos                                                            */
/* ------------------------------------------------------------------ */

export const doRefresh = () => refreshAll();

/** Carrega mais historico — o store guarda o limite corrente. */
export const doLoadMore = (step = 2000) => loadLog(getState().limit + step);
