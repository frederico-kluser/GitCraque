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
 */

export {};
