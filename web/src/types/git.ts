/**
 * CONTRATO COMPARTILHADO — GitCraque
 * ==================================
 * Este arquivo e a unica fonte de verdade entre o backend Node.js e a SPA React.
 * Backend e frontend sao escritos em paralelo; qualquer campo que nao esteja aqui
 * NAO existe. Mudou o contrato? Muda aqui primeiro.
 *
 * Espelho em runtime (JS puro, consumido pelo servidor): server/src/contract.mjs
 */

/* ------------------------------------------------------------------ *
 * 1. Historico / commits
 * ------------------------------------------------------------------ */

/**
 * Uma linha crua de:
 *   git log --pretty=format:"%H|%P|%an|%ae|%s|%ar|%d" --all --topo-order
 *
 * O parser do backend divide os 4 primeiros campos pela ESQUERDA e os 2 ultimos
 * pela DIREITA, porque `%s` (subject) pode conter o proprio separador `|`.
 */
export interface RawCommit {
  /** %H — hash completo (40 hex) */
  hash: string;
  /** %P — hashes dos pais, ja divididos por espaco. Vazio = commit raiz. */
  parents: string[];
  /** %an */
  authorName: string;
  /** %ae */
  authorEmail: string;
  /** %s — assunto (primeira linha da mensagem) */
  subject: string;
  /** %ar — data relativa ("3 days ago") */
  relativeDate: string;
  /** %d — decoracao crua, ex: " (HEAD -> main, origin/main, tag: v1.0)" */
  decorationRaw: string;
  /** decoracao ja normalizada em refs tipadas */
  refs: CommitRef[];
}

export type RefKind = "head" | "localBranch" | "remoteBranch" | "tag" | "stash";

export interface CommitRef {
  kind: RefKind;
  /** nome exibivel: "main", "origin/main", "v1.0" */
  name: string;
  /** nome completo do ref quando conhecido: "refs/heads/main" */
  fullName?: string;
  /** true quando HEAD aponta para este ref */
  isHead: boolean;
  /** para remoteBranch: "origin" */
  remote?: string;
}

/** Payload de GET /api/log */
export interface LogPayload {
  commits: RawCommit[];
  /** total de commits alcancaveis por --all (para paginacao/virtualizacao) */
  total: number;
  /** offset aplicado */
  skip: number;
  /** repositorio de onde este log saiu (muda com o chdir de worktree) */
  cwd: string;
  /** true quando o repo esta vazio (sem commits) */
  empty: boolean;
  /** ms gastos no `git log` — usado no rodape de diagnostico */
  elapsedMs: number;
}

/** Detalhe completo de um commit (GET /api/commit/:hash) */
export interface CommitDetail {
  hash: string;
  abbrevHash: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  authorDate: string;
  committerName: string;
  committerEmail: string;
  committerDate: string;
  subject: string;
  body: string;
  refs: CommitRef[];
  files: CommitFileChange[];
  stats: { filesChanged: number; insertions: number; deletions: number };
}

export type ChangeStatus =
  | "added"
  | "modified"
  | "deleted"
  | "renamed"
  | "copied"
  | "typechange"
  | "unmerged"
  | "untracked"
  | "unknown";

export interface CommitFileChange {
  path: string;
  oldPath?: string;
  status: ChangeStatus;
  insertions: number;
  deletions: number;
  binary: boolean;
}

/* ------------------------------------------------------------------ *
 * 2. Refs: branches, remotes, tags
 * ------------------------------------------------------------------ */

export interface Branch {
  name: string;
  fullName: string;
  /** hash do commit apontado */
  target: string;
  isHead: boolean;
  /** "origin/main" quando ha upstream configurado */
  upstream?: string;
  ahead: number;
  behind: number;
  /** true quando a branch esta checada em ALGUMA worktree (bloqueia checkout) */
  checkedOutIn?: string;
}

export interface RemoteBranch {
  name: string;
  fullName: string;
  remote: string;
  /** nome sem o prefixo do remote: "main" */
  shortName: string;
  target: string;
}

export interface Tag {
  name: string;
  fullName: string;
  target: string;
  annotated: boolean;
  message?: string;
}

export interface Remote {
  name: string;
  fetchUrl: string;
  pushUrl: string;
  /** derivado da url: "github.com" — chave do cofre de credenciais */
  host?: string;
  /** true quando a url e https (usa o trampolim de askpass) */
  https: boolean;
}

export interface HeadState {
  /** nome da branch atual, ou null em detached HEAD */
  branch: string | null;
  hash: string | null;
  detached: boolean;
  /** operacao em curso detectada no .git: rebase, merge, cherry-pick, revert, bisect */
  pending: PendingOperation | null;
}

export type PendingOperationKind =
  | "rebase"
  | "rebase-interactive"
  | "merge"
  | "cherry-pick"
  | "revert"
  | "bisect";

export interface PendingOperation {
  kind: PendingOperationKind;
  /** passo atual / total, quando o git expoe (rebase-merge/msgnum) */
  step?: number;
  total?: number;
  /** hash sendo aplicado */
  current?: string;
  /** arquivos em conflito */
  conflicts: string[];
}

/** Payload de GET /api/refs */
export interface RefsPayload {
  head: HeadState;
  branches: Branch[];
  remoteBranches: RemoteBranch[];
  tags: Tag[];
  remotes: Remote[];
  stashes: StashEntry[];
}

export interface StashEntry {
  index: number;
  /** "stash@{0}" */
  ref: string;
  message: string;
  branch: string;
  hash: string;
  relativeDate: string;
}

/* ------------------------------------------------------------------ *
 * 3. Worktrees — `git worktree list --porcelain`
 * ------------------------------------------------------------------ */

export interface Worktree {
  /** caminho absoluto (linha `worktree <path>`) */
  path: string;
  /** HEAD da worktree (linha `HEAD <sha>`) */
  head: string | null;
  /** linha `branch refs/heads/x` → "x"; null em detached */
  branch: string | null;
  /** linha `bare` */
  bare: boolean;
  /** linha `detached` */
  detached: boolean;
  /** linha `locked [motivo]` */
  locked: boolean;
  lockReason?: string;
  /** linha `prunable [motivo]` */
  prunable: boolean;
  /** true na worktree principal (a primeira da listagem) */
  isMain: boolean;
  /** true quando o process.cwd() do servidor esta nesta worktree */
  isActive: boolean;
  /** basename do path, para exibicao */
  label: string;
}

export interface WorktreesPayload {
  worktrees: Worktree[];
  /** process.cwd() atual do servidor */
  cwd: string;
  /** raiz do repositorio principal (git rev-parse --path-format=absolute --git-common-dir) */
  mainRoot: string;
}

/* ------------------------------------------------------------------ *
 * 4. Working tree / staging
 * ------------------------------------------------------------------ */

export interface StatusEntry {
  path: string;
  oldPath?: string;
  /** codigo XY do porcelain v2 (ex.: "M.", ".M", "??") */
  code: string;
  indexStatus: ChangeStatus | null;
  worktreeStatus: ChangeStatus | null;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
}

export interface StatusPayload {
  branch: string | null;
  upstream?: string;
  ahead: number;
  behind: number;
  entries: StatusEntry[];
  clean: boolean;
  cwd: string;
}

/**
 * Estado dos botoes desfazer/refazer.
 *
 * O passo NAO viaja no payload: quem escolhe para onde o HEAD vai e o cursor do
 * servidor sobre o reflog, nunca a interface. Aqui chega so o suficiente para
 * pintar os dois botoes — se cada um esta vivo e o rotulo da acao envolvida.
 */
export interface UndoStatePayload {
  canUndo: boolean;
  canRedo: boolean;
  /** acao que o desfazer vai desfazer, como o reflog a descreve */
  undoLabel: string | null;
  redoLabel: string | null;
  /** por que os dois botoes estao mortos, quando estao */
  blocked: "empty" | "pending" | null;
}

export interface DiffHunk {
  header: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  lines: DiffLine[];
}

export interface DiffLine {
  kind: "context" | "add" | "del" | "meta";
  content: string;
  oldNumber: number | null;
  newNumber: number | null;
}

export interface DiffPayload {
  path: string;
  oldPath?: string;
  binary: boolean;
  hunks: DiffHunk[];
  /** patch cru, para copiar */
  raw: string;
}

/* ------------------------------------------------------------------ *
 * 5. Operacoes de git (o resultado padronizado de todo comando)
 * ------------------------------------------------------------------ */

export interface GitCommandResult {
  ok: boolean;
  /** argv exato executado, para exibir no console da UI */
  argv: string[];
  cwd: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  signal: string | null;
  durationMs: number;
  /** mensagem amigavel derivada do stderr quando ok === false */
  error?: string;
  /** quando o comando deixou o repo em estado pendente (conflito) */
  pending?: PendingOperation | null;
  /**
   * O lado remoto foi PULADO porque nao havia branch correspondente. Nao e
   * falha: apagar so o local ainda foi o que a pessoa pediu.
   */
  skippedRemote?: boolean;
  /**
   * A operacao mudou o `process.cwd()` do servidor — hoje so o delete-all, ao
   * remover a worktree em que o servidor estava. O refresh de verdade vem do
   * `cwd:changed`; este campo existe para a UI poder DIZER o que aconteceu.
   */
  cwdChanged?: string;
}

/** Envelope de erro de qualquer rota REST */
export interface ApiError {
  error: string;
  detail?: string;
  /** presente quando o erro veio de um comando git */
  command?: GitCommandResult;
}

/* ------------------------------------------------------------------ *
 * 6. Motor semantico de drag-and-drop
 * ------------------------------------------------------------------ */

/** O que pode ser arrastado. `id` do @dnd-kit e serializado como `${type}:${key}`. */
export type DragEntityType = "commit" | "branch" | "remoteBranch" | "tag" | "stash";

export interface DragPayload {
  type: DragEntityType;
  /** hash para commit; nome para branch/tag/stash */
  key: string;
  label: string;
  /** para commit: subject; para branch: hash alvo */
  detail?: string;
  /** para remoteBranch */
  remote?: string;
}

export type DropZoneType = "branch" | "remoteBranch" | "commit" | "tag" | "trash";

export interface DropPayload {
  type: DropZoneType;
  key: string;
  label: string;
  remote?: string;
}

/**
 * As intencoes resolvidas pelo motor semantico em onDragEnd.
 * A regra dura do projeto:
 *   commit  -> branch  => cherry-pick (confirmacao simples)
 *   branch  -> branch  => escolha entre merge e rebase
 */
export type DragIntentKind =
  | "cherry-pick"
  | "merge"
  | "rebase"
  | "reset"
  | "tag-move"
  | "delete-branch"
  | "invalid";

export interface DragIntent {
  kind: DragIntentKind;
  source: DragPayload;
  target: DropPayload;
  /** titulo do dialogo */
  title: string;
  /** explicacao em uma frase do que vai acontecer */
  description: string;
  /** opcoes mutuamente exclusivas quando a intencao e ambigua (merge | rebase) */
  options: DragIntentOption[];
  /** false quando a combinacao nao faz sentido (ex.: soltar em si mesmo) */
  allowed: boolean;
  /** motivo da recusa quando allowed === false */
  reason?: string;
}

export interface DragIntentOption {
  id: string;
  label: string;
  description: string;
  /** o comando git que sera executado, ja montado, para preview na UI */
  preview: string[];
  /** rota REST que executa */
  endpoint: string;
  body: Record<string, unknown>;
  /** true quando reescreve historico — a UI exige hold-to-confirm */
  destructive: boolean;
}

/* ------------------------------------------------------------------ *
 * 7. Squash interativo (GIT_SEQUENCE_EDITOR)
 * ------------------------------------------------------------------ */

export interface SquashRequest {
  /** commit-base do `git rebase -i <base>`; o backend deriva de commits[] se ausente */
  base?: string;
  /**
   * Hashes selecionados no grafo, em qualquer ordem.
   * O primeiro em ordem topologica (o mais ANTIGO) permanece `pick`;
   * todos os demais viram `squash`.
   */
  commits: string[];
  /** mensagem final do commit resultante; ausente = concatena as originais */
  message?: string;
  /** usa `fixup` em vez de `squash` (descarta as mensagens) */
  fixup?: boolean;
}

export interface SquashPlanLine {
  action: "pick" | "squash" | "fixup" | "drop" | "reword" | "edit";
  hash: string;
  subject: string;
  /** true quando esta linha foi reescrita pelo proxy-editor */
  rewritten: boolean;
}

export interface SquashResult extends GitCommandResult {
  /** o `git-rebase-todo` como o proxy-editor o deixou */
  plan: SquashPlanLine[];
  /** conteudo original do todo, para auditoria */
  originalTodo: string;
  rewrittenTodo: string;
}

/* ------------------------------------------------------------------ *
 * 7b. Rebase interativo visual (GIT_SEQUENCE_EDITOR)
 * ------------------------------------------------------------------ */

export type RebaseInteractiveAction = "pick" | "reword" | "squash" | "fixup" | "drop";

export interface RebaseInteractiveActionEntry {
  hash: string;
  action: RebaseInteractiveAction;
  /** nova mensagem quando action === "reword" */
  newMessage?: string;
}

export interface RebaseInteractiveRequest {
  /** commits com suas acoes, na ordem em que o usuario quer */
  actions: RebaseInteractiveActionEntry[];
  /** commit-base do `git rebase -i <onto>`; derivado do mais antigo se ausente */
  onto?: string;
}

export interface RebaseInteractivePlanLine {
  action: "pick" | "reword" | "squash" | "fixup" | "drop" | "edit";
  hash: string;
  subject: string;
  /** true quando esta linha foi reescrita pelo proxy-editor */
  rewritten: boolean;
}

export interface RebaseInteractiveResult extends GitCommandResult {
  /** o `git-rebase-todo` como o proxy-editor o deixou */
  plan: RebaseInteractivePlanLine[];
  /** conteudo original do todo, para auditoria */
  originalTodo: string;
  rewrittenTodo: string;
  /** quantos rewords foram aplicados com sucesso */
  rewordsApplied: number;
}

/* ------------------------------------------------------------------ *
 * 8. Credenciais / trampolim de askpass
 * ------------------------------------------------------------------ */

export interface CredentialEntry {
  /** "github.com" */
  host: string;
  username: string;
  /** NUNCA serializado de volta ao cliente */
  token?: string;
  /** presente na resposta: o token existe mas vem mascarado */
  masked?: string;
  createdAt: number;
}

export interface CredentialsPayload {
  entries: Array<Omit<CredentialEntry, "token">>;
}

/** Pedido vivo do askpass quando nao ha credencial no cofre. */
export interface CredentialPrompt {
  requestId: string;
  host: string;
  /** o prompt cru que o git passou como argv[2] */
  prompt: string;
  kind: "username" | "password";
  /** epoch ms em que o pedido expira (o askpass aborta e o git falha limpo) */
  expiresAt: number;
}

/* ------------------------------------------------------------------ *
 * 9. WebSocket — eventos servidor -> cliente
 * ------------------------------------------------------------------ */

export type ServerEvent =
  | { type: "hello"; cwd: string; mainRoot: string; version: string; pid: number }
  /** emitido apos process.chdir() — a UI DEVE recarregar a View Tree inteira */
  | { type: "cwd:changed"; cwd: string; worktree: Worktree | null; mainRoot: string }
  /** o watcher do .git detectou mutacao (commit, checkout, fetch...) */
  | { type: "repo:changed"; reason: RepoChangeReason; paths?: string[] }
  /** streaming do child_process de um comando git */
  | { type: "git:command"; id: string; phase: GitCommandPhase; argv?: string[]; cwd?: string; chunk?: string; result?: GitCommandResult }
  | { type: "op:progress"; id: string; op: string; message: string; percent?: number }
  /** o trampolim precisa de uma credencial que nao esta no cofre */
  | { type: "credentials:needed"; prompt: CredentialPrompt }
  | { type: "credentials:resolved"; requestId: string; ok: boolean }
  | { type: "error"; message: string; detail?: string }
  | { type: "pong"; ts: number }
  /** passo do agente: comando disparado, texto, custo ou falha */
  | { type: "ai:event"; id: string; event: AgentEvent }
  /** o agente terminou; `text` e o veredito de uma linha */
  | { type: "ai:done"; id: string; text: string; cost: number; error: string }
  | { type: "ai:error"; id: string; text: string; cost: number; error: string };

export type GitCommandPhase = "start" | "stdout" | "stderr" | "exit";

export type RepoChangeReason =
  | "refs"
  | "head"
  | "index"
  | "worktree"
  | "config"
  | "rebase-state"
  | "manual";

/** WebSocket — eventos cliente -> servidor */
export type ClientEvent =
  | { type: "ping"; ts: number }
  /** resposta ao credentials:needed */
  | { type: "credentials:provide"; requestId: string; value: string; remember?: boolean }
  | { type: "credentials:cancel"; requestId: string }
  /** pede um refresh explicito */
  | { type: "refresh"; what?: RepoChangeReason };

/* ------------------------------------------------------------------ *
 * 10. Estado agregado do repositorio (GET /api/repo)
 * ------------------------------------------------------------------ */

export interface RepoPayload {
  /** process.cwd() do servidor */
  cwd: string;
  /** raiz da worktree ativa */
  root: string;
  /** .git comum (compartilhado entre worktrees) */
  gitCommonDir: string;
  isRepo: boolean;
  head: HeadState;
  worktrees: Worktree[];
  remotes: Remote[];
  gitVersion: string;
  /** nome do repo para o titulo da janela */
  name: string;
}

/* ------------------------------------------------------------------ *
 * 11. Seletor de repositorios da maquina
 * ------------------------------------------------------------------ *
 * Acrescentado depois das secoes acima (aditivo — nada foi removido nem
 * renomeado). Existe porque, sem isto, subir o gitcraque fora de um
 * repositorio e um beco sem saida.
 */

/** Uma pasta na navegacao. NUNCA representa arquivo: o seletor so lista pastas. */
export interface FsEntry {
  name: string;
  path: string;
  /** tem `.git` (diretorio ou arquivo), ou e um repositorio bare */
  isRepo: boolean;
  isBare: boolean;
  /** `.git` e ARQUIVO: worktree ligada a outro repositorio */
  isWorktree: boolean;
  hidden: boolean;
  symlink: boolean;
}

/** GET /api/fs/list */
export interface FsListPayload {
  path: string;
  /** null na raiz do sistema de arquivos */
  parent: string | null;
  home: string;
  separator: string;
  /** o que o proprio diretorio listado e */
  self: { isRepo: boolean; isBare: boolean; isWorktree: boolean };
  entries: FsEntry[];
  /** a pasta tinha mais subpastas do que o teto de listagem */
  truncated: boolean;
}

/** GET /api/fs/roots — pontos de partida que existem nesta maquina. */
export interface FsRootsPayload {
  home: string;
  separator: string;
  cwd: string;
  roots: Array<{ path: string; label: string; isRepo: boolean }>;
}

/** Um repositorio encontrado pela varredura. */
export interface DiscoveredRepo {
  path: string;
  name: string;
  /** ramo atual, "(detached abc1234)", ou null em repo vazio/bare */
  branch: string | null;
  /** `%ar` do ultimo commit */
  lastCommitRelative: string | null;
  bare: boolean;
  linkedWorktree: boolean;
  /** esta DENTRO de outro repositorio (submodulo, worktree, pasta versionada a parte) */
  nested: boolean;
  /** o repositorio que o contem de imediato, quando `nested` */
  parentRepo: string | null;
}

/**
 * Uma pasta git ja avistada alguma vez — pela varredura, pela navegacao ou por
 * uma abertura. Vive na tabela `discovered` do banco e nao tem teto: e o que
 * faz a busca do seletor achar um repositorio que nao esta em raiz nenhuma.
 */
export interface RepoSearchHit {
  path: string;
  name: string;
  branch: string | null;
  bare: boolean;
  linkedWorktree: boolean;
  nested: boolean;
  parentRepo: string | null;
  /** como ele foi avistado da ultima vez */
  source: "scan" | "browse" | "open";
  firstSeenAt: number;
  lastSeenAt: number;
  /** recalculado a cada busca: a pasta pode ter sumido desde que foi vista */
  exists: boolean;
}

/** GET /api/repos/search */
export interface RepoSearchPayload {
  entries: RepoSearchHit[];
  /** o termo depois do trim, para a UI saber que busca esta vendo */
  query: string;
  /** quantas pastas git o historico conhece no total */
  total: number;
  /** bateu o teto de resultados */
  truncated: boolean;
}

/** POST /api/repos/scan */
export interface ScanPayload {
  repos: DiscoveredRepo[];
  roots: string[];
  /** quantos diretorios foram visitados */
  scanned: number;
  /** a varredura parou por teto de tempo/resultados antes de terminar */
  truncated: boolean;
  elapsedMs: number;
}

/** Um repositorio ja aberto antes, persistido em ~/.config/gitcraque/gitcraque.db */
export interface RecentRepo {
  path: string;
  name: string;
  branch: string | null;
  lastOpenedAt: number;
  /** recalculado a cada leitura: a pasta pode ter sido movida ou apagada */
  exists: boolean;
}

/** GET /api/repos/recent */
export interface RecentReposPayload {
  entries: RecentRepo[];
  /** caminho do arquivo, exibido na UI para quem quiser editar na mao */
  file: string;
}

/* ------------------------------------------------------------------ *
 * 12. Conteudo de arquivo (visualizador: diff, markdown, cru)
 * ------------------------------------------------------------------ */

/**
 * GET /api/file — o conteudo de UM arquivo, num commit ou na working tree.
 *
 * Sai de `git show <hash>:<path>` (ou da leitura do disco quando `hash` e
 * omitido). Serve o visualizador do rodape: markdown renderizado, codigo cru e
 * o lado "depois" do diff.
 */
export interface FileContentPayload {
  path: string;
  /** commit de origem; null quando veio da working tree */
  hash: string | null;
  /** texto do arquivo. Vazio quando `binary` ou `truncated` por tamanho. */
  content: string;
  /** bytes do blob */
  size: number;
  /** heuristica de binario (NUL nos primeiros KB) — nao renderize */
  binary: boolean;
  /** passou do teto de bytes; `content` traz so o inicio */
  truncated: boolean;
  /** extensao normalizada ("md", "ts", "json"), para escolher o realce */
  language: string;
  /** true quando a extensao e de markdown — a UI oferece "Formatado" */
  markdown: boolean;
}

/* ------------------------------------------------------------------ *
 * 13. Projetos favoritos
 * ------------------------------------------------------------------ */

/**
 * Um repositorio fixado pelo usuario. Diferente de "recente": recente e
 * historico automatico e rotativo; favorito e escolha explicita e permanente.
 */
export interface FavoriteRepo {
  path: string;
  /** apelido opcional; vazio usa o basename */
  label: string;
  name: string;
  branch: string | null;
  /** ordem manual na lista */
  order: number;
  addedAt: number;
  /** recalculado a cada leitura: a pasta pode ter sumido */
  exists: boolean;
}

/** GET /api/repos/favorites */
export interface FavoritesPayload {
  entries: FavoriteRepo[];
  file: string;
}

/* ------------------------------------------------------------------ *
 * 14. Console de comandos (buffer interno de auditoria)
 * ------------------------------------------------------------------ */

export interface ConsoleLine {
  id: string;
  ts: number;
  kind: "command" | "stdout" | "stderr" | "exit" | "info" | "error";
  text: string;
  /** presente em kind === "command" */
  argv?: string[];
  cwd?: string;
  exitCode?: number | null;
  durationMs?: number;
}

/* ------------------------------------------------------------------ *
 * 15. Blame — `git blame --porcelain`
 * ------------------------------------------------------------------ */

/** Uma linha do arquivo com o commit que a tocou pela ultima vez. */
export interface BlameLine {
  /** numero da linha no arquivo (1-indexado) */
  lineNumber: number;
  /** hash do commit */
  hash: string;
  /** numero da linha original no commit */
  originalLine: number;
  /** nome do autor */
  author: string;
  /** email do autor */
  email: string;
  /** timestamp Unix do commit (author-time) */
  date: number;
  /** fuso horario ("+0000") */
  tz: string;
  /** assunto do commit */
  summary: string;
  /** conteudo da linha */
  content: string;
}

/** Payload de GET /api/blame */
export interface BlamePayload {
  lines: BlameLine[];
  path: string;
  /** commit contra o qual o blame foi rodado; null = working tree */
  hash: string | null;
}

/* ------------------------------------------------------------------ *
 * 16. Agente: microfone -> transcricao -> pi coding agent
 * ------------------------------------------------------------------ */

/**
 * Um passo do agente, ja traduzido pelo backend a partir do fluxo NDJSON do pi.
 *
 * `kind: "tool"` com `tool: "bash"` e o unico que traz `command` preenchido: e
 * nele que o git acontece, e mostrar o comando literal e a promessa do produto.
 */
export type AgentEvent =
  | { kind: "session-start"; utterance: string; source: AgentSource }
  | { kind: "start" }
  | { kind: "tool"; tool: string; command: string; file: string }
  | { kind: "tool-end"; tool: string; failed: boolean }
  | { kind: "text"; delta: string }
  | { kind: "usage"; cost: number }
  | { kind: "end" }
  | { kind: "error"; message: string };

/** De onde veio o pedido. O agente calibra a desconfianca com isso. */
export type AgentSource = "voice" | "text";

/** De qual camada a chave da OpenRouter foi resolvida. */
export type AiKeySource = "stored" | "env-file" | "env" | "none";

/** GET /api/ai/status */
export interface AiStatusPayload {
  hasKey: boolean;
  keySource: AiKeySource;
  /** impressao digital da chave; nunca a chave */
  masked: string;
  transcribeModel: string;
  agentModel: string;
  pi: {
    /** "path" = binario encontrado; "npx" = baixa na primeira execucao */
    kind: "path" | "npx";
    needsDownload: boolean;
  };
  busy: boolean;
  session: AgentSessionInfo | null;
}

export interface AgentSessionInfo {
  id: string;
  startedAt: number;
  utterance: string;
  source: AgentSource;
}

/** POST /api/ai/transcribe */
export interface TranscriptionPayload {
  text: string;
  /** custo real em USD, vindo do `usage.cost` da OpenRouter */
  cost: number;
  /** duracao do audio em segundos */
  seconds: number;
}

/** POST /api/ai/run — responde na hora; o andamento vem pelo WebSocket */
export interface AgentRunPayload {
  id: string;
  startedAt: number;
}

/* ------------------------------------------------------------------ *
 * 16. Clone — POST /api/repos/clone
 * ------------------------------------------------------------------ */

/** Corpo de POST /api/repos/clone */
export interface CloneRequest {
  /** url do remoto (https://..., git@..., ssh://..., ou caminho local) */
  url: string;
  /** diretorio destino (absoluto ou ~/relativo) */
  path: string;
  /** branch opcional (--branch) */
  branch?: string;
  /** repositorio bare (--bare) */
  bare?: boolean;
}

/* ------------------------------------------------------------------ *
 * 17. Conflitos — deteccao, parse e resolucao
 * ------------------------------------------------------------------ */

/** GET /api/conflicts — estado de conflito do repositorio */
export interface ConflictState {
  kind: PendingOperationKind;
  step?: number;
  total?: number;
  current?: string;
  conflicts: string[];
  branch: string | null;
}

/** Uma regiao de conflito dentro de um arquivo */
export interface ConflictRegion {
  /** conteudo entre <<<<<<< e ======= */
  ours: string;
  /** conteudo entre ======= e >>>>>>> */
  theirs: string;
  /** numero da linha do separador =======, ou null */
  separator: number | null;
  /** numero da linha do fechamento >>>>>>>, ou null */
  end: number | null;
  /** rotulo do lado "nosso" (ex.: "HEAD") */
  oursLabel: string;
  /** rotulo do lado "deles" (ex.: "feature/login") */
  theirsLabel: string;
  /** indice da linha onde comeca <<<<<<< (0-indexado) */
  startLine: number;
  /** indice da linha onde termina >>>>>>> (0-indexado) */
  endLine: number;
  /** ja foi resolvida no cliente */
  resolved: boolean;
}

/** GET /api/conflicts/file — arquivo parseado em regioes de conflito */
export interface ConflictFile {
  path: string;
  regions: ConflictRegion[];
  totalRegions: number;
}

/** Corpo de POST /api/conflicts/resolve */
export interface ResolveRequest {
  path: string;
  resolutions: ResolveRegion[];
}

export interface ResolveRegion {
  /** indice da regiao (0-indexado, pela ordem no arquivo) */
  region: number;
  /** "ours" | "theirs" | "both" */
  resolution: "ours" | "theirs" | "both";
}

/** Resposta de POST /api/conflicts/resolve */
export interface ResolveResult extends GitCommandResult {
  path: string;
  resolvedRegions: number;
  remainingConflicts: number;
}
