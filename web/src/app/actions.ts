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
      `Nao foi possivel copiar: ${label.toLowerCase()}`,
      "O navegador recusou o acesso a area de transferencia.",
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
  runOperation("Fetch", () => api.fetch({ all: true, prune: true }), {
    refresh: "refs",
    successMessage: "Fetch concluido",
  });

/** Fetch de UM remoto — o menu do remoto no rail. */
export const doFetchRemote = (remote: string) =>
  runOperation(`Fetch ${remote}`, () => api.fetch({ remote, prune: true }), {
    refresh: "refs",
    successMessage: `Fetch de ${remote} concluido`,
  });

export const doPull = (rebase = false) =>
  runOperation(rebase ? "Pull --rebase" : "Pull", () => api.pull({ rebase }), {
    successMessage: rebase ? "Pull --rebase concluido" : "Pull concluido",
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
    toast("warning", "Nenhum remoto configurado", "Adicione um origin antes de dar push.");
    return;
  }

  askConfirm({
    title: "Push",
    description: `Envia ${branch || "a branch atual"} para o remoto escolhido.`,
    preview: ["git", "push", preset.remote ?? defaultRemote(), branch].filter(Boolean),
    confirmLabel: "Push",
    fields: [
      { kind: "select", name: "remote", label: "Remoto", value: preset.remote ?? defaultRemote(), options: remotes },
      { kind: "text", name: "branch", label: "Branch", value: branch, placeholder: "branch a enviar" },
      { kind: "toggle", name: "setUpstream", label: "--set-upstream", value: false, hint: "grava o upstream da branch" },
      { kind: "toggle", name: "tags", label: "--tags", value: false, hint: "envia tambem as tags" },
      {
        kind: "toggle",
        name: "forceWithLease",
        label: "--force-with-lease",
        value: false,
        hint: "reescreve o remoto; so use apos rebase/squash",
      },
    ],
    run: (values) =>
      runOperation(
        "Push",
        () =>
          api.push({
            remote: text(values, "remote") || defaultRemote(),
            branch: text(values, "branch") || undefined,
            setUpstream: flag(values, "setUpstream"),
            tags: flag(values, "tags"),
            forceWithLease: flag(values, "forceWithLease"),
          }),
        { refresh: "refs", successMessage: "Push concluido" },
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
    title: "Nova branch",
    description: startPoint
      ? `Cria uma branch a partir de ${short(startPoint)}.`
      : "Cria uma branch a partir do HEAD atual.",
    preview: ["git", "branch", "<nome>", startPoint ?? ""].filter(Boolean),
    confirmLabel: "Criar",
    fields: [
      { kind: "text", name: "name", label: "Nome", placeholder: "feature/minha-branch", required: true },
      { kind: "text", name: "startPoint", label: "Ponto de partida", value: startPoint ?? "", placeholder: "HEAD" },
      { kind: "toggle", name: "checkout", label: "Fazer checkout depois", value: true },
    ],
    run: (values) =>
      runOperation(
        "Criar branch",
        () =>
          api.createBranch({
            name: text(values, "name"),
            startPoint: text(values, "startPoint") || undefined,
            checkout: flag(values, "checkout"),
          }),
        { refresh: "refs", successMessage: `Branch ${text(values, "name")} criada` },
      ),
  });
}

export const doCheckout = (ref: string) =>
  runOperation("Checkout", () => api.checkout({ ref }), { refresh: "head", successMessage: `Em ${ref}` });

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
      toast("info", `Voce ja esta em ${refEntry.name}`);
      return;
    }
    if (branch?.checkedOutIn) {
      toast(
        "warning",
        `${refEntry.name} esta em uso`,
        `A branch esta checada na worktree ${branch.checkedOutIn}. Clique nela em Worktrees para ir ate la — trocar de worktree nao faz checkout.`,
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
      "Checkout",
      () => api.checkout({ ref: refEntry.name, createBranch: local }),
      { refresh: "refs", successMessage: `Em ${local}, rastreando ${refEntry.name}` },
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
      "HEAD detached",
      "Nao ha branch atual para receber o merge. Faca checkout de uma branch antes.",
    );
    return;
  }
  askConfirm({
    title: `Merge de ${source} em ${alvo}`,
    description: `Traz os commits de ${source} para ${alvo}. NENHUM historico e reescrito; se houver divergencia, nasce um commit de merge.`,
    preview: ["git", "merge", "--no-edit", source],
    confirmLabel: "Merge",
    fields: [
      { kind: "toggle", name: "noFf", label: "--no-ff", value: false, hint: "commit de merge mesmo quando daria fast-forward" },
      { kind: "toggle", name: "squash", label: "--squash", value: false, hint: "junta tudo no index sem commitar nem gravar o merge" },
    ],
    run: (values) =>
      runOperation(
        "Merge",
        () => api.merge({ source, noFf: flag(values, "noFf"), squash: flag(values, "squash") }),
        { refresh: "all", successMessage: `${source} mesclado em ${alvo}` },
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
      "HEAD detached",
      "Rebase precisa de uma branch atual para reescrever. Faca checkout de uma branch antes.",
    );
    return;
  }
  askConfirm({
    title: `Rebase de ${alvo} sobre ${onto}`,
    description: `REESCREVE ${alvo}: os commits que ela tem e ${onto} nao tem sao reaplicados um a um em cima de ${onto}. ${onto} nao muda. Se ${alvo} ja foi publicada, o proximo push vai exigir --force-with-lease.`,
    preview: ["git", "rebase", "--autostash", onto, alvo],
    destructive: true,
    confirmLabel: "Rebase",
    run: () =>
      runOperation("Rebase", () => api.rebase({ source: alvo, onto }), {
        refresh: "all",
        successMessage: `${alvo} rebaseada sobre ${onto}`,
      }),
  });
}

export function openRenameBranch(from: string) {
  askConfirm({
    title: `Renomear ${from}`,
    description: "Renomeia a branch local. O upstream continua apontando para o mesmo remoto.",
    preview: ["git", "branch", "-m", from, "<novo-nome>"],
    confirmLabel: "Renomear",
    fields: [{ kind: "text", name: "to", label: "Novo nome", value: from, required: true }],
    run: (values) =>
      runOperation("Renomear branch", () => api.renameBranch({ from, to: text(values, "to") }), {
        refresh: "refs",
      }),
  });
}

/** Destrutivo: exige hold. */
export function openDeleteBranchLocal(name: string) {
  askConfirm({
    title: "Deletar Branch (Local)",
    description: `Apaga a branch local ${name}. Commits so alcancaveis por ela ficam orfaos.`,
    preview: ["git", "branch", "-d", name],
    destructive: true,
    confirmLabel: "Deletar local",
    fields: [
      { kind: "toggle", name: "force", label: "-D (forcar mesmo sem merge)", value: false, hint: "usa -D em vez de -d" },
    ],
    run: (values) =>
      runOperation(
        "Deletar branch local",
        () => api.deleteBranchLocal({ name, force: flag(values, "force") }),
        { refresh: "refs", successMessage: `Branch ${name} apagada` },
      ),
  });
}

/** Destrutivo: exige hold. */
export function openDeleteBranchRemote(remote: string, name: string) {
  askConfirm({
    title: "Deletar Branch (Origin)",
    description: `Apaga ${name} em ${remote}. A operacao atinge quem mais usa o repositorio.`,
    preview: ["git", "push", remote, "--delete", name],
    destructive: true,
    confirmLabel: `Deletar em ${remote}`,
    run: () =>
      runOperation("Deletar branch remota", () => api.deleteBranchRemote({ remote, name }), {
        refresh: "refs",
        successMessage: `${remote}/${name} apagada`,
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
    title: `Checkout de ${short(hash)}`,
    description: `Leva a arvore de trabalho ate ${subject ? `"${truncate(subject, 60)}"` : short(hash)} com o HEAD DETACHED: nenhuma branch acompanha o que voce commitar daqui. Para voltar, faca checkout de uma branch; para ficar, crie uma branch neste ponto.`,
    preview: ["git", "checkout", short(hash)],
    confirmLabel: "Checkout",
    run: () =>
      runOperation("Checkout", () => api.checkout({ ref: hash }), {
        refresh: "head",
        successMessage: `Detached em ${short(hash)}`,
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
    title: um ? `Cherry-pick de ${short(commits[0])}` : `Cherry-pick de ${commits.length} commits`,
    description: `Aplica ${um ? (subject ? `"${truncate(subject, 48)}"` : short(commits[0])) : `os ${commits.length} commits selecionados`} sobre ${alvo ?? "o HEAD atual"}. Cria commits NOVOS, com hashes novos; nada e reescrito. O backend reordena do mais antigo para o mais novo antes de aplicar.`,
    preview: ["git", "cherry-pick", ...commits.slice(0, 4).map((h) => short(h)), commits.length > 4 ? "…" : ""].filter(Boolean),
    confirmLabel: "Cherry-pick",
    fields: [
      {
        kind: "toggle",
        name: "noCommit",
        label: "-n (--no-commit)",
        value: false,
        hint: "aplica no index e para, sem criar commit",
      },
    ],
    run: (values) =>
      runOperation(
        "Cherry-pick",
        () => api.cherryPick({ commits, noCommit: flag(values, "noCommit") }),
        { refresh: "all", successMessage: "Cherry-pick concluido" },
      ),
  });
}

/** Revert: cria um commit que DESFAZ outro. Nao reescreve nada. */
export function openRevert(hash: string) {
  const subject = commitOf(hash)?.subject;
  askConfirm({
    title: `Reverter ${short(hash)}`,
    description: `Cria um commit NOVO que desfaz ${subject ? `"${truncate(subject, 48)}"` : short(hash)}. O commit original continua no historico — nada e reescrito.`,
    preview: ["git", "revert", "--no-edit", short(hash)],
    confirmLabel: "Reverter",
    fields: [
      {
        kind: "toggle",
        name: "noCommit",
        label: "-n (--no-commit)",
        value: false,
        hint: "desfaz no index e para, sem criar commit",
      },
    ],
    run: (values) =>
      runOperation("Revert", () => api.revert({ hash, noCommit: flag(values, "noCommit") }), {
        refresh: "all",
        successMessage: `${short(hash)} revertido`,
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
    title: `Reset de ${alvo ?? "HEAD"} para ${short(hash)}`,
    description: `Move ${alvo ?? "o HEAD"} para ${short(hash)}. Os commits que ficarem para tras deixam de ser alcancaveis por esta branch. Com --hard, as alteracoes da arvore de trabalho tambem vao embora e nao ha desfazer.`,
    preview: ["git", "reset", "--mixed", short(hash)],
    destructive: true,
    confirmLabel: "Reset",
    fields: [
      {
        kind: "select",
        name: "mode",
        label: "Modo",
        value: "mixed",
        options: [
          { value: "soft", label: "--soft — move a branch; index e arvore intactos" },
          { value: "mixed", label: "--mixed — move a branch e limpa o index; arvore intacta" },
          { value: "hard", label: "--hard — move tudo e DESCARTA a arvore de trabalho" },
        ],
      },
    ],
    run: (values) => {
      const mode = (text(values, "mode") || "mixed") as "soft" | "mixed" | "hard";
      return runOperation("Reset", () => api.reset({ ref: hash, mode }), {
        refresh: "all",
        successMessage: `Reset --${mode} para ${short(hash)}`,
      });
    },
  });
}

/* ------------------------------------------------------------------ */
/* Tags                                                                */
/* ------------------------------------------------------------------ */

export function openCreateTag(ref?: string) {
  askConfirm({
    title: "Nova tag",
    description: ref ? `Cria uma tag em ${short(ref)}.` : "Cria uma tag no HEAD atual.",
    preview: ["git", "tag", "<nome>", ref ?? ""].filter(Boolean),
    confirmLabel: "Criar tag",
    fields: [
      { kind: "text", name: "name", label: "Nome", placeholder: "v1.0.0", required: true },
      { kind: "text", name: "ref", label: "Alvo", value: ref ?? "", placeholder: "HEAD" },
      { kind: "textarea", name: "message", label: "Mensagem (deixa a tag anotada)", placeholder: "opcional" },
    ],
    run: (values) =>
      runOperation(
        "Criar tag",
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
    title: `Deletar tag ${name}`,
    description: "Apaga a tag local; opcionalmente tambem no remoto.",
    preview: ["git", "tag", "-d", name],
    destructive: true,
    confirmLabel: "Deletar tag",
    fields:
      remotes.length > 0
        ? [
            {
              kind: "select",
              name: "remote",
              label: "Apagar tambem em",
              value: "",
              options: [{ value: "", label: "so local" }, ...remotes.map((r) => ({ value: r, label: r }))],
            } satisfies ConfirmField,
          ]
        : undefined,
    run: (values) =>
      runOperation(
        "Deletar tag",
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
    title: "Adicionar Origin",
    description: "Registra um remoto novo. Url https usa o trampolim de credencial (GIT_ASKPASS).",
    preview: ["git", "remote", "add", name, "<url>"],
    confirmLabel: "Adicionar",
    fields: [
      { kind: "text", name: "name", label: "Nome", value: name, required: true },
      {
        kind: "text",
        name: "url",
        label: "Url",
        placeholder: "https://github.com/usuario/repo.git",
        required: true,
      },
    ],
    run: (values) =>
      runOperation(
        "Adicionar remoto",
        () => api.addRemote({ name: text(values, "name"), url: text(values, "url") }),
        { refresh: "config" },
      ),
  });
}

export function openEditRemoteUrl(remote: Remote) {
  askConfirm({
    title: `Url de ${remote.name}`,
    description: "Troca a url do remoto. Marque para alterar apenas a url de push.",
    preview: ["git", "remote", "set-url", remote.name, "<url>"],
    confirmLabel: "Salvar url",
    fields: [
      { kind: "text", name: "url", label: "Url", value: remote.fetchUrl, required: true },
      { kind: "toggle", name: "push", label: "--push (so a url de push)", value: false },
    ],
    run: (values) =>
      runOperation(
        "Alterar url do remoto",
        () => api.setRemoteUrl({ name: remote.name, url: text(values, "url"), push: flag(values, "push") }),
        { refresh: "config" },
      ),
  });
}

export function openRemoveRemote(name: string) {
  askConfirm({
    title: `Remover remoto ${name}`,
    description: `Apaga o remoto e todas as refs remotas de ${name} do repositorio local.`,
    preview: ["git", "remote", "remove", name],
    destructive: true,
    confirmLabel: "Remover remoto",
    run: () => runOperation("Remover remoto", () => api.removeRemote({ name }), { refresh: "config" }),
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
    title: "Adicionar worktree",
    description: "Cria um diretorio de trabalho novo ligado a este repositorio.",
    preview: ["git", "worktree", "add", "<caminho>"],
    confirmLabel: "Adicionar",
    fields: [
      { kind: "text", name: "path", label: "Caminho", placeholder: "/caminho/para/nova-worktree", required: true },
      { kind: "text", name: "newBranch", label: "Criar branch (-b)", placeholder: "opcional" },
      { kind: "text", name: "ref", label: "A partir de", placeholder: "HEAD" },
    ],
    run: (values) =>
      runOperation(
        "Adicionar worktree",
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
    title: `Remover worktree ${wt.label}`,
    description: `Desregistra ${wt.path}. O diretorio sai do disco se o git conseguir remove-lo.`,
    preview: ["git", "worktree", "remove", wt.path],
    destructive: true,
    confirmLabel: "Remover worktree",
    fields: [{ kind: "toggle", name: "force", label: "--force", value: false, hint: "remove mesmo com alteracoes" }],
    run: (values) =>
      runOperation(
        "Remover worktree",
        () => api.removeWorktree({ path: wt.path, force: flag(values, "force") }),
        { refresh: "all" },
      ),
  });
}

export function openPruneWorktrees() {
  askConfirm({
    title: "Prune de worktrees",
    description: "Remove o registro das worktrees cujo diretorio nao existe mais.",
    preview: ["git", "worktree", "prune"],
    confirmLabel: "Fazer prune",
    run: () => runOperation("Prune de worktrees", () => api.pruneWorktrees(), { refresh: "all" }),
  });
}

/* ------------------------------------------------------------------ */
/* Stash                                                               */
/* ------------------------------------------------------------------ */

export function openStashPush() {
  askConfirm({
    title: "Stash",
    description: "Guarda as alteracoes da arvore de trabalho numa pilha.",
    preview: ["git", "stash", "push"],
    confirmLabel: "Guardar",
    fields: [
      { kind: "text", name: "message", label: "Mensagem", placeholder: "opcional" },
      { kind: "toggle", name: "includeUntracked", label: "-u (incluir nao rastreados)", value: false },
    ],
    run: (values) =>
      runOperation(
        "Stash",
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
  runOperation("Aplicar stash", () => api.stashApply({ ref }), { refresh: "all" });

export function openStashPop(ref: string) {
  askConfirm({
    title: `Pop de ${ref}`,
    description: "Aplica o stash e o remove da pilha. Se der conflito, o stash some mesmo assim.",
    preview: ["git", "stash", "pop", ref],
    destructive: true,
    confirmLabel: "Pop",
    run: () => runOperation("Pop do stash", () => api.stashApply({ ref, pop: true }), { refresh: "all" }),
  });
}

export function openStashDrop(ref: string) {
  askConfirm({
    title: `Descartar ${ref}`,
    description: "Apaga o stash. Nao ha desfazer.",
    preview: ["git", "stash", "drop", ref],
    destructive: true,
    confirmLabel: "Descartar stash",
    run: () => runOperation("Descartar stash", () => api.stashDrop({ ref }), { refresh: "all" }),
  });
}

/* ------------------------------------------------------------------ */
/* Staging e commit                                                    */
/* ------------------------------------------------------------------ */

export const doStage = (paths: string[]) =>
  runOperation("Preparar", () => api.stage({ paths }), { refresh: "index", successMessage: "Preparado" });

export const doUnstage = (paths: string[]) =>
  runOperation("Despreparar", () => api.unstage({ paths }), { refresh: "index", successMessage: "Despreparado" });

/** Sem dialogo: o `HoldToConfirmButton` da propria linha ja e a confirmacao. */
export const doDiscard = (paths: string[]) =>
  runOperation("Descartar alteracoes", () => api.discard({ paths }), {
    refresh: "worktree",
    successMessage: "Alteracoes descartadas",
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
  const um = paths.length === 1;
  askConfirm({
    title: um ? `Descartar ${paths[0]}` : `Descartar ${paths.length} arquivos`,
    description: `Devolve ${um ? "o arquivo" : "os arquivos"} ao estado do ultimo commit. O que nao estava commitado se perde, e o git nao guarda copia disso.`,
    preview: ["git", "restore", "--", ...paths.slice(0, 3), paths.length > 3 ? "…" : ""].filter(Boolean),
    destructive: true,
    confirmLabel: "Descartar",
    run: () => doDiscard(paths),
  });
}

export const doCommit = (body: { message: string; amend?: boolean; signoff?: boolean }) =>
  runOperation("Commit", () => api.doCommit(body), { refresh: "all", successMessage: "Commit criado" });

/* ------------------------------------------------------------------ */
/* Squash — GIT_SEQUENCE_EDITOR + proxy-editor                         */
/* ------------------------------------------------------------------ */

export function openSquash(commits: string[]) {
  if (commits.length < 2) {
    toast("warning", "Squash precisa de dois ou mais commits", "Selecione um intervalo no grafo.");
    return;
  }
  askConfirm({
    title: `Squash de ${commits.length} commits`,
    description:
      "Reescreve o historico com `git rebase -i` e GIT_SEQUENCE_EDITOR. O commit mais antigo permanece `pick`; os demais viram `squash`.",
    preview: ["git", "rebase", "-i", `${short(commits[commits.length - 1])}^`],
    destructive: true,
    confirmLabel: "Squash",
    fields: [
      { kind: "textarea", name: "message", label: "Mensagem final", placeholder: "vazio concatena as originais" },
      { kind: "toggle", name: "fixup", label: "fixup (descarta as mensagens)", value: false },
    ],
    run: (values) =>
      runOperation(
        "Squash",
        () =>
          api.squash({
            commits,
            message: text(values, "message") || undefined,
            fixup: flag(values, "fixup"),
          }),
        { refresh: "all", successMessage: "Squash concluido" },
      ),
  });
}

/* ------------------------------------------------------------------ */
/* Operacao pendente (rebase/merge/cherry-pick/revert em curso)        */
/* ------------------------------------------------------------------ */

export const doContinue = (kind: PendingOperationKind) =>
  runOperation(`Continuar ${kind}`, () => api.continueOp({ kind: normalizeKind(kind) }), {
    refresh: "rebase-state",
  });

export function openAbort(kind: PendingOperationKind) {
  askConfirm({
    title: `Abortar ${kind}`,
    description: "Desfaz a operacao em curso e volta o repositorio ao estado anterior.",
    preview: ["git", normalizeKind(kind), "--abort"],
    destructive: true,
    confirmLabel: "Abortar",
    run: () =>
      runOperation(`Abortar ${kind}`, () => api.abort({ kind: normalizeKind(kind) }), {
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
/* Diversos                                                            */
/* ------------------------------------------------------------------ */

export const doRefresh = () => refreshAll();

/** Carrega mais historico — o store guarda o limite corrente. */
export const doLoadMore = (step = 2000) => loadLog(getState().limit + step);
