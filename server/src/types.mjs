/**
 * Espelho em JSDoc dos tipos de `web/src/types/git.ts`.
 *
 * O arquivo nao exporta valor nenhum: existe so para o editor/tsserver checar
 * o backend contra o mesmo contrato que o front-end consome. Se um campo mudar
 * la, muda aqui — os dois arquivos andam juntos.
 */

/**
 * @typedef {"head"|"localBranch"|"remoteBranch"|"tag"|"stash"} RefKind
 *
 * @typedef {object} CommitRef
 * @property {RefKind} kind
 * @property {string}  name
 * @property {string}  [fullName]
 * @property {boolean} isHead
 * @property {string}  [remote]
 *
 * @typedef {object} RawCommit
 * @property {string}   hash
 * @property {string[]} parents
 * @property {string}   authorName
 * @property {string}   authorEmail
 * @property {string}   subject
 * @property {string}   relativeDate
 * @property {string}   decorationRaw
 * @property {CommitRef[]} refs
 *
 * @typedef {object} LogPayload
 * @property {RawCommit[]} commits
 * @property {number} total
 * @property {number} skip
 * @property {string} cwd
 * @property {boolean} empty
 * @property {number} elapsedMs
 *
 * @typedef {"added"|"modified"|"deleted"|"renamed"|"copied"|"typechange"|"unmerged"|"untracked"|"unknown"} ChangeStatus
 *
 * @typedef {"rebase"|"rebase-interactive"|"merge"|"cherry-pick"|"revert"|"bisect"} PendingOperationKind
 *
 * @typedef {object} PendingOperation
 * @property {PendingOperationKind} kind
 * @property {number} [step]
 * @property {number} [total]
 * @property {string} [current]
 * @property {string[]} conflicts
 *
 * @typedef {object} HeadState
 * @property {string|null} branch
 * @property {string|null} hash
 * @property {boolean} detached
 * @property {PendingOperation|null} pending
 *
 * @typedef {object} GitCommandResult
 * @property {boolean} ok
 * @property {string[]} argv
 * @property {string} cwd
 * @property {string} stdout
 * @property {string} stderr
 * @property {number|null} exitCode
 * @property {string|null} signal
 * @property {number} durationMs
 * @property {string} [error]
 * @property {PendingOperation|null} [pending]
 *
 * @typedef {object} Worktree
 * @property {string} path
 * @property {string|null} head
 * @property {string|null} branch
 * @property {boolean} bare
 * @property {boolean} detached
 * @property {boolean} locked
 * @property {string} [lockReason]
 * @property {boolean} prunable
 * @property {boolean} isMain
 * @property {boolean} isActive
 * @property {string} label
 *
 * @typedef {object} FileContentPayload
 * @property {string} path
 * @property {string|null} hash commit de origem; null quando veio da working tree
 * @property {string} content vazio quando `binary`
 * @property {number} size bytes do blob
 * @property {boolean} binary
 * @property {boolean} truncated passou do teto; `content` traz so o inicio
 * @property {string} language extensao normalizada, sem o ponto
 * @property {boolean} markdown
 *
 * @typedef {object} FavoriteRepo
 * @property {string} path
 * @property {string} label apelido opcional; vazio usa o basename
 * @property {string} name
 * @property {string|null} branch
 * @property {number} order ordem manual na lista
 * @property {number} addedAt
 * @property {boolean} exists recalculado a cada leitura
 *
 * @typedef {object} FavoritesPayload
 * @property {FavoriteRepo[]} entries
 * @property {string} file
 */

export {};
