/**
 * GERADO — nao editar a mao.
 *
 * Payloads capturados de um repositorio git REAL (/tmp/gitcraque-lab) rodando os mesmos
 * comandos que o backend roda, incluindo o formato mandatorio do log. Serve so
 * ao modo de desenvolvimento `?mock=1`, para inspecionar a UI enquanto o
 * backend ainda esta sendo escrito por outra frente.
 */
import type {
  CommitDetail,
  DiffPayload,
  LogPayload,
  RefsPayload,
  RepoPayload,
  StatusPayload,
  WorktreesPayload,
} from "@/types/git";

export interface MockData {
  repo: RepoPayload;
  log: LogPayload;
  refs: RefsPayload;
  status: StatusPayload;
  worktrees: WorktreesPayload;
  commitDetails: Record<string, CommitDetail>;
  commitDiffs: Record<string, DiffPayload[]>;
  stagedDiff: DiffPayload[];
  worktreeDiff: DiffPayload[];
}

export const MOCK: MockData = {
  "repo": {
    "cwd": "/tmp/gitcraque-lab",
    "root": "/tmp/gitcraque-lab",
    "gitCommonDir": "/tmp/gitcraque-lab/.git",
    "isRepo": true,
    "head": {
      "branch": "main",
      "hash": "a72728077a4f370c0a70eceb39c134833f3094d7",
      "detached": false,
      "pending": null
    },
    "worktrees": [
      {
        "path": "/tmp/gitcraque-lab",
        "head": "a72728077a4f370c0a70eceb39c134833f3094d7",
        "branch": "main",
        "bare": false,
        "detached": false,
        "locked": false,
        "prunable": false,
        "isMain": true,
        "isActive": true,
        "label": "gitcraque-lab"
      },
      {
        "path": "/tmp/gitcraque-lab-hotfix",
        "head": "f1808377136219adb4c7622b95cecfdccebf8ea2",
        "branch": "experiment/lanes",
        "bare": false,
        "detached": false,
        "locked": false,
        "prunable": false,
        "isMain": false,
        "isActive": false,
        "label": "gitcraque-lab-hotfix"
      }
    ],
    "remotes": [
      {
        "name": "espelho",
        "fetchUrl": "git@gitlab.com:exemplo/gitcraque-lab.git",
        "pushUrl": "git@gitlab.com:exemplo/gitcraque-lab.git",
        "https": false,
        "host": "gitlab.com"
      },
      {
        "name": "origin",
        "fetchUrl": "https://github.com/exemplo/gitcraque-lab.git",
        "pushUrl": "https://github.com/exemplo/gitcraque-lab.git",
        "https": true,
        "host": "github.com"
      }
    ],
    "gitVersion": "git version 2.43.0",
    "name": "gitcraque-lab"
  },
  "log": {
    "commits": [
      {
        "hash": "ddbf0631de03f68db052ba965a01017aa161cd84",
        "parents": [
          "a72728077a4f370c0a70eceb39c134833f3094d7",
          "07cb2feed1bc1dcf59d802c553537f02fdcb52f3"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "On main: modulo em rascunho",
        "relativeDate": "8 minutes ago",
        "decorationRaw": " (refs/stash)",
        "refs": [
          {
            "kind": "remoteBranch",
            "name": "refs/stash",
            "fullName": "refs/remotes/refs/stash",
            "isHead": false,
            "remote": "refs"
          }
        ]
      },
      {
        "hash": "07cb2feed1bc1dcf59d802c553537f02fdcb52f3",
        "parents": [
          "a72728077a4f370c0a70eceb39c134833f3094d7"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "index on main: a727280 polish: pontuacao",
        "relativeDate": "8 minutes ago",
        "decorationRaw": "",
        "refs": []
      },
      {
        "hash": "a72728077a4f370c0a70eceb39c134833f3094d7",
        "parents": [
          "28d7440c1af5f9e79374bc292eed67ca02412af6"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "polish: pontuacao",
        "relativeDate": "7 days ago",
        "decorationRaw": " (HEAD -> main)",
        "refs": [
          {
            "kind": "localBranch",
            "name": "main",
            "fullName": "refs/heads/main",
            "isHead": true
          }
        ]
      },
      {
        "hash": "28d7440c1af5f9e79374bc292eed67ca02412af6",
        "parents": [
          "104a458cbd9aaab597957ef6cf5f1bf5b7bc8a29"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "chore: bump",
        "relativeDate": "13 days ago",
        "decorationRaw": "",
        "refs": []
      },
      {
        "hash": "104a458cbd9aaab597957ef6cf5f1bf5b7bc8a29",
        "parents": [
          "671534eaf34e5b94e53916fc0f54929eaa3585ec"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "feat: versao 0.2.0",
        "relativeDate": "4 weeks ago",
        "decorationRaw": "",
        "refs": []
      },
      {
        "hash": "f1808377136219adb4c7622b95cecfdccebf8ea2",
        "parents": [
          "bac084ed4c489b5d6af3fc1f6b1df289cf1e06d8"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "wip: experimento 3",
        "relativeDate": "6 weeks ago",
        "decorationRaw": " (experiment/lanes)",
        "refs": [
          {
            "kind": "remoteBranch",
            "name": "experiment/lanes",
            "fullName": "refs/remotes/experiment/lanes",
            "isHead": false,
            "remote": "experiment"
          }
        ]
      },
      {
        "hash": "bac084ed4c489b5d6af3fc1f6b1df289cf1e06d8",
        "parents": [
          "011710fb4d77f7cef380ffc811bc460112ce0b13"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "wip: experimento 2",
        "relativeDate": "6 weeks ago",
        "decorationRaw": "",
        "refs": []
      },
      {
        "hash": "011710fb4d77f7cef380ffc811bc460112ce0b13",
        "parents": [
          "671534eaf34e5b94e53916fc0f54929eaa3585ec"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "wip: experimento 1",
        "relativeDate": "7 weeks ago",
        "decorationRaw": "",
        "refs": []
      },
      {
        "hash": "671534eaf34e5b94e53916fc0f54929eaa3585ec",
        "parents": [
          "c6ce5805cf5b55574bca7ff74c6e68d8c3ecf6d8",
          "d646b596b43665dcd3aa320d8eccb4560923e444"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "merge: hotfix do NaN",
        "relativeDate": "7 weeks ago",
        "decorationRaw": " (tag: v0.1.1)",
        "refs": [
          {
            "kind": "tag",
            "name": "v0.1.1",
            "fullName": "refs/tags/v0.1.1",
            "isHead": false
          }
        ]
      },
      {
        "hash": "d646b596b43665dcd3aa320d8eccb4560923e444",
        "parents": [
          "c6ce5805cf5b55574bca7ff74c6e68d8c3ecf6d8"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "fix: nao quebra com NaN",
        "relativeDate": "7 weeks ago",
        "decorationRaw": " (hotfix/crash)",
        "refs": [
          {
            "kind": "remoteBranch",
            "name": "hotfix/crash",
            "fullName": "refs/remotes/hotfix/crash",
            "isHead": false,
            "remote": "hotfix"
          }
        ]
      },
      {
        "hash": "c6ce5805cf5b55574bca7ff74c6e68d8c3ecf6d8",
        "parents": [
          "5b3f26ec7929953c7b31ca8792559e5a83706924"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "docs: descreve o projeto",
        "relativeDate": "7 weeks ago",
        "decorationRaw": " (tag: v0.1.0)",
        "refs": [
          {
            "kind": "tag",
            "name": "v0.1.0",
            "fullName": "refs/tags/v0.1.0",
            "isHead": false
          }
        ]
      },
      {
        "hash": "20711f4a0cf0686c888b5363307f914216517a7f",
        "parents": [
          "104787efb3b37f00ed40ec9dc5b6b5f0314e9d41"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "style: reset",
        "relativeDate": "8 weeks ago",
        "decorationRaw": " (feature/ui)",
        "refs": [
          {
            "kind": "remoteBranch",
            "name": "feature/ui",
            "fullName": "refs/remotes/feature/ui",
            "isHead": false,
            "remote": "feature"
          }
        ]
      },
      {
        "hash": "104787efb3b37f00ed40ec9dc5b6b5f0314e9d41",
        "parents": [
          "f503aabd761fac43659f06d343a62f7785e2e4e9"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "feat(ui): mais conteudo",
        "relativeDate": "9 weeks ago",
        "decorationRaw": "",
        "refs": []
      },
      {
        "hash": "f503aabd761fac43659f06d343a62f7785e2e4e9",
        "parents": [
          "5b3f26ec7929953c7b31ca8792559e5a83706924"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "feat(ui): primeira tela",
        "relativeDate": "9 weeks ago",
        "decorationRaw": "",
        "refs": []
      },
      {
        "hash": "5b3f26ec7929953c7b31ca8792559e5a83706924",
        "parents": [
          "7c88546e9309a0a5ecfc19e39cd599f698d5fc19",
          "963a9d6e1e4e5ad704038dc8fdd5ca1cd619f41c"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "merge: traz o parser para a main",
        "relativeDate": "2 months ago",
        "decorationRaw": "",
        "refs": []
      },
      {
        "hash": "963a9d6e1e4e5ad704038dc8fdd5ca1cd619f41c",
        "parents": [
          "4479407a7c4a15a4972266d2f618d90d5b763a31"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "fix(parser): descarta vazios",
        "relativeDate": "2 months ago",
        "decorationRaw": " (feature/parser)",
        "refs": [
          {
            "kind": "remoteBranch",
            "name": "feature/parser",
            "fullName": "refs/remotes/feature/parser",
            "isHead": false,
            "remote": "feature"
          }
        ]
      },
      {
        "hash": "4479407a7c4a15a4972266d2f618d90d5b763a31",
        "parents": [
          "ad494866acbb027d5047540fc0de5bce206e1d2d"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "feat(parser): divide pela esquerda",
        "relativeDate": "3 months ago",
        "decorationRaw": "",
        "refs": []
      },
      {
        "hash": "7c88546e9309a0a5ecfc19e39cd599f698d5fc19",
        "parents": [
          "ad494866acbb027d5047540fc0de5bce206e1d2d"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "refactor: saudacao",
        "relativeDate": "2 months ago",
        "decorationRaw": "",
        "refs": []
      },
      {
        "hash": "ad494866acbb027d5047540fc0de5bce206e1d2d",
        "parents": [
          "24bd525fcb36d72890002e30573dca125c62b9f9"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "feat: util | com pipe no assunto",
        "relativeDate": "3 months ago",
        "decorationRaw": "",
        "refs": []
      },
      {
        "hash": "24bd525fcb36d72890002e30573dca125c62b9f9",
        "parents": [
          "e743921670072ae92627b5a6ddd0cbabc28c67d3"
        ],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "feat: primeiro modulo",
        "relativeDate": "3 months ago",
        "decorationRaw": "",
        "refs": []
      },
      {
        "hash": "e743921670072ae92627b5a6ddd0cbabc28c67d3",
        "parents": [],
        "authorName": "Ana Ribeiro",
        "authorEmail": "ana@exemplo.dev",
        "subject": "chore: esqueleto do projeto",
        "relativeDate": "3 months ago",
        "decorationRaw": "",
        "refs": []
      }
    ],
    "total": 21,
    "skip": 0,
    "cwd": "/tmp/gitcraque-lab",
    "empty": false,
    "elapsedMs": 4
  },
  "refs": {
    "head": {
      "branch": "main",
      "hash": "a72728077a4f370c0a70eceb39c134833f3094d7",
      "detached": false,
      "pending": null
    },
    "branches": [
      {
        "name": "experiment/lanes",
        "fullName": "refs/heads/experiment/lanes",
        "target": "f1808377136219adb4c7622b95cecfdccebf8ea2",
        "isHead": false,
        "ahead": 0,
        "behind": 0,
        "checkedOutIn": "/tmp/gitcraque-lab-hotfix"
      },
      {
        "name": "feature/parser",
        "fullName": "refs/heads/feature/parser",
        "target": "963a9d6e1e4e5ad704038dc8fdd5ca1cd619f41c",
        "isHead": false,
        "ahead": 0,
        "behind": 0
      },
      {
        "name": "feature/ui",
        "fullName": "refs/heads/feature/ui",
        "target": "20711f4a0cf0686c888b5363307f914216517a7f",
        "isHead": false,
        "ahead": 0,
        "behind": 0
      },
      {
        "name": "hotfix/crash",
        "fullName": "refs/heads/hotfix/crash",
        "target": "d646b596b43665dcd3aa320d8eccb4560923e444",
        "isHead": false,
        "ahead": 0,
        "behind": 0
      },
      {
        "name": "main",
        "fullName": "refs/heads/main",
        "target": "a72728077a4f370c0a70eceb39c134833f3094d7",
        "isHead": true,
        "ahead": 0,
        "behind": 0
      }
    ],
    "remoteBranches": [],
    "tags": [
      {
        "name": "v0.1.0",
        "fullName": "refs/tags/v0.1.0",
        "target": "acab2ae5f5beb2fa461305c51bf4db2d44064b19",
        "annotated": true,
        "message": "primeira versao utilizavel"
      },
      {
        "name": "v0.1.1",
        "fullName": "refs/tags/v0.1.1",
        "target": "671534eaf34e5b94e53916fc0f54929eaa3585ec",
        "annotated": false
      }
    ],
    "remotes": [
      {
        "name": "espelho",
        "fetchUrl": "git@gitlab.com:exemplo/gitcraque-lab.git",
        "pushUrl": "git@gitlab.com:exemplo/gitcraque-lab.git",
        "https": false,
        "host": "gitlab.com"
      },
      {
        "name": "origin",
        "fetchUrl": "https://github.com/exemplo/gitcraque-lab.git",
        "pushUrl": "https://github.com/exemplo/gitcraque-lab.git",
        "https": true,
        "host": "github.com"
      }
    ],
    "stashes": [
      {
        "index": 0,
        "ref": "stash@{0}",
        "message": "modulo em rascunho",
        "branch": "main",
        "hash": "ddbf0631de03f68db052ba965a01017aa161cd84",
        "relativeDate": "8 minutes ago"
      },
      {
        "index": 1,
        "ref": "stash@{1}",
        "message": "rascunho do readme",
        "branch": "main",
        "hash": "44fc3e7d1bfaeafbc651ac53e32b017034d6b43b",
        "relativeDate": "8 minutes ago"
      }
    ]
  },
  "status": {
    "branch": "main",
    "ahead": 0,
    "behind": 0,
    "entries": [
      {
        "path": "src/app.ts",
        "code": ".M",
        "indexStatus": null,
        "worktreeStatus": "modified",
        "staged": false,
        "unstaged": true,
        "untracked": false,
        "conflicted": false
      },
      {
        "path": "src/novo.ts",
        "code": "A.",
        "indexStatus": "added",
        "worktreeStatus": null,
        "staged": true,
        "unstaged": false,
        "untracked": false,
        "conflicted": false
      },
      {
        "path": "src/version.ts",
        "code": ".D",
        "indexStatus": null,
        "worktreeStatus": "deleted",
        "staged": false,
        "unstaged": true,
        "untracked": false,
        "conflicted": false
      },
      {
        "path": "tmp.txt",
        "code": "??",
        "indexStatus": null,
        "worktreeStatus": "untracked",
        "staged": false,
        "unstaged": true,
        "untracked": true,
        "conflicted": false
      }
    ],
    "clean": false,
    "cwd": "/tmp/gitcraque-lab"
  },
  "worktrees": {
    "worktrees": [
      {
        "path": "/tmp/gitcraque-lab",
        "head": "a72728077a4f370c0a70eceb39c134833f3094d7",
        "branch": "main",
        "bare": false,
        "detached": false,
        "locked": false,
        "prunable": false,
        "isMain": true,
        "isActive": true,
        "label": "gitcraque-lab"
      },
      {
        "path": "/tmp/gitcraque-lab-hotfix",
        "head": "f1808377136219adb4c7622b95cecfdccebf8ea2",
        "branch": "experiment/lanes",
        "bare": false,
        "detached": false,
        "locked": false,
        "prunable": false,
        "isMain": false,
        "isActive": false,
        "label": "gitcraque-lab-hotfix"
      }
    ],
    "cwd": "/tmp/gitcraque-lab",
    "mainRoot": "/tmp/gitcraque-lab"
  },
  "commitDetails": {
    "ddbf0631de03f68db052ba965a01017aa161cd84": {
      "hash": "ddbf0631de03f68db052ba965a01017aa161cd84",
      "abbrevHash": "ddbf063",
      "parents": [
        "a72728077a4f370c0a70eceb39c134833f3094d7",
        "07cb2feed1bc1dcf59d802c553537f02fdcb52f3"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-07-27T19:49:40-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-07-27T19:49:40-03:00",
      "subject": "On main: modulo em rascunho",
      "body": "",
      "refs": [
        {
          "kind": "remoteBranch",
          "name": "refs/stash",
          "fullName": "refs/remotes/refs/stash",
          "isHead": false,
          "remote": "refs"
        }
      ],
      "files": [
        {
          "path": "src/rascunho.ts",
          "status": "modified",
          "insertions": 1,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 0
      }
    },
    "07cb2feed1bc1dcf59d802c553537f02fdcb52f3": {
      "hash": "07cb2feed1bc1dcf59d802c553537f02fdcb52f3",
      "abbrevHash": "07cb2fe",
      "parents": [
        "a72728077a4f370c0a70eceb39c134833f3094d7"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-07-27T19:49:40-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-07-27T19:49:40-03:00",
      "subject": "index on main: a727280 polish: pontuacao",
      "body": "",
      "refs": [],
      "files": [
        {
          "path": "src/rascunho.ts",
          "status": "added",
          "insertions": 1,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 0
      }
    },
    "a72728077a4f370c0a70eceb39c134833f3094d7": {
      "hash": "a72728077a4f370c0a70eceb39c134833f3094d7",
      "abbrevHash": "a727280",
      "parents": [
        "28d7440c1af5f9e79374bc292eed67ca02412af6"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-07-20T10:00:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-07-20T10:00:00-03:00",
      "subject": "polish: pontuacao",
      "body": "",
      "refs": [
        {
          "kind": "localBranch",
          "name": "main",
          "fullName": "refs/heads/main",
          "isHead": true
        }
      ],
      "files": [
        {
          "path": "src/app.ts",
          "status": "modified",
          "insertions": 1,
          "deletions": 1,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 1
      }
    },
    "28d7440c1af5f9e79374bc292eed67ca02412af6": {
      "hash": "28d7440c1af5f9e79374bc292eed67ca02412af6",
      "abbrevHash": "28d7440",
      "parents": [
        "104a458cbd9aaab597957ef6cf5f1bf5b7bc8a29"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-07-14T10:00:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-07-14T10:00:00-03:00",
      "subject": "chore: bump",
      "body": "",
      "refs": [],
      "files": [
        {
          "path": "src/version.ts",
          "status": "modified",
          "insertions": 1,
          "deletions": 1,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 1
      }
    },
    "104a458cbd9aaab597957ef6cf5f1bf5b7bc8a29": {
      "hash": "104a458cbd9aaab597957ef6cf5f1bf5b7bc8a29",
      "abbrevHash": "104a458",
      "parents": [
        "671534eaf34e5b94e53916fc0f54929eaa3585ec"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-07-01T10:00:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-07-01T10:00:00-03:00",
      "subject": "feat: versao 0.2.0",
      "body": "",
      "refs": [],
      "files": [
        {
          "path": "src/version.ts",
          "status": "added",
          "insertions": 1,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 0
      }
    },
    "f1808377136219adb4c7622b95cecfdccebf8ea2": {
      "hash": "f1808377136219adb4c7622b95cecfdccebf8ea2",
      "abbrevHash": "f180837",
      "parents": [
        "bac084ed4c489b5d6af3fc1f6b1df289cf1e06d8"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-06-13T12:00:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-06-13T12:00:00-03:00",
      "subject": "wip: experimento 3",
      "body": "",
      "refs": [
        {
          "kind": "remoteBranch",
          "name": "experiment/lanes",
          "fullName": "refs/remotes/experiment/lanes",
          "isHead": false,
          "remote": "experiment"
        }
      ],
      "files": [
        {
          "path": "notes.md",
          "status": "modified",
          "insertions": 1,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 0
      }
    },
    "bac084ed4c489b5d6af3fc1f6b1df289cf1e06d8": {
      "hash": "bac084ed4c489b5d6af3fc1f6b1df289cf1e06d8",
      "abbrevHash": "bac084e",
      "parents": [
        "011710fb4d77f7cef380ffc811bc460112ce0b13"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-06-12T12:00:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-06-12T12:00:00-03:00",
      "subject": "wip: experimento 2",
      "body": "",
      "refs": [],
      "files": [
        {
          "path": "notes.md",
          "status": "modified",
          "insertions": 1,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 0
      }
    },
    "011710fb4d77f7cef380ffc811bc460112ce0b13": {
      "hash": "011710fb4d77f7cef380ffc811bc460112ce0b13",
      "abbrevHash": "011710f",
      "parents": [
        "671534eaf34e5b94e53916fc0f54929eaa3585ec"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-06-11T12:00:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-06-11T12:00:00-03:00",
      "subject": "wip: experimento 1",
      "body": "",
      "refs": [],
      "files": [
        {
          "path": "notes.md",
          "status": "added",
          "insertions": 1,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 0
      }
    },
    "671534eaf34e5b94e53916fc0f54929eaa3585ec": {
      "hash": "671534eaf34e5b94e53916fc0f54929eaa3585ec",
      "abbrevHash": "671534e",
      "parents": [
        "c6ce5805cf5b55574bca7ff74c6e68d8c3ecf6d8",
        "d646b596b43665dcd3aa320d8eccb4560923e444"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-06-11T09:00:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-06-11T09:00:00-03:00",
      "subject": "merge: hotfix do NaN",
      "body": "",
      "refs": [
        {
          "kind": "tag",
          "name": "v0.1.1",
          "fullName": "refs/tags/v0.1.1",
          "isHead": false
        }
      ],
      "files": [
        {
          "path": "src/util.ts",
          "status": "modified",
          "insertions": 1,
          "deletions": 1,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 1
      }
    },
    "d646b596b43665dcd3aa320d8eccb4560923e444": {
      "hash": "d646b596b43665dcd3aa320d8eccb4560923e444",
      "abbrevHash": "d646b59",
      "parents": [
        "c6ce5805cf5b55574bca7ff74c6e68d8c3ecf6d8"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-06-09T19:00:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-06-09T19:00:00-03:00",
      "subject": "fix: nao quebra com NaN",
      "body": "",
      "refs": [
        {
          "kind": "remoteBranch",
          "name": "hotfix/crash",
          "fullName": "refs/remotes/hotfix/crash",
          "isHead": false,
          "remote": "hotfix"
        }
      ],
      "files": [
        {
          "path": "src/util.ts",
          "status": "modified",
          "insertions": 1,
          "deletions": 1,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 1
      }
    },
    "c6ce5805cf5b55574bca7ff74c6e68d8c3ecf6d8": {
      "hash": "c6ce5805cf5b55574bca7ff74c6e68d8c3ecf6d8",
      "abbrevHash": "c6ce580",
      "parents": [
        "5b3f26ec7929953c7b31ca8792559e5a83706924"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-06-05T08:30:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-06-05T08:30:00-03:00",
      "subject": "docs: descreve o projeto",
      "body": "",
      "refs": [
        {
          "kind": "tag",
          "name": "v0.1.0",
          "fullName": "refs/tags/v0.1.0",
          "isHead": false
        }
      ],
      "files": [
        {
          "path": "README.md",
          "status": "modified",
          "insertions": 2,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 2,
        "deletions": 0
      }
    },
    "20711f4a0cf0686c888b5363307f914216517a7f": {
      "hash": "20711f4a0cf0686c888b5363307f914216517a7f",
      "abbrevHash": "20711f4",
      "parents": [
        "104787efb3b37f00ed40ec9dc5b6b5f0314e9d41"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-06-02T10:05:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-06-02T10:05:00-03:00",
      "subject": "style: reset",
      "body": "",
      "refs": [
        {
          "kind": "remoteBranch",
          "name": "feature/ui",
          "fullName": "refs/remotes/feature/ui",
          "isHead": false,
          "remote": "feature"
        }
      ],
      "files": [
        {
          "path": "web/style.css",
          "status": "added",
          "insertions": 1,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 0
      }
    },
    "104787efb3b37f00ed40ec9dc5b6b5f0314e9d41": {
      "hash": "104787efb3b37f00ed40ec9dc5b6b5f0314e9d41",
      "abbrevHash": "104787e",
      "parents": [
        "f503aabd761fac43659f06d343a62f7785e2e4e9"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-05-26T15:45:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-05-26T15:45:00-03:00",
      "subject": "feat(ui): mais conteudo",
      "body": "",
      "refs": [],
      "files": [
        {
          "path": "web/index.html",
          "status": "modified",
          "insertions": 1,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 0
      }
    },
    "f503aabd761fac43659f06d343a62f7785e2e4e9": {
      "hash": "f503aabd761fac43659f06d343a62f7785e2e4e9",
      "abbrevHash": "f503aab",
      "parents": [
        "5b3f26ec7929953c7b31ca8792559e5a83706924"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-05-22T13:00:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-05-22T13:00:00-03:00",
      "subject": "feat(ui): primeira tela",
      "body": "",
      "refs": [],
      "files": [
        {
          "path": "web/index.html",
          "status": "added",
          "insertions": 1,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 0
      }
    },
    "5b3f26ec7929953c7b31ca8792559e5a83706924": {
      "hash": "5b3f26ec7929953c7b31ca8792559e5a83706924",
      "abbrevHash": "5b3f26e",
      "parents": [
        "7c88546e9309a0a5ecfc19e39cd599f698d5fc19",
        "963a9d6e1e4e5ad704038dc8fdd5ca1cd619f41c"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-05-18T09:00:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-05-18T09:00:00-03:00",
      "subject": "merge: traz o parser para a main",
      "body": "",
      "refs": [],
      "files": [
        {
          "path": "src/parser.ts",
          "status": "modified",
          "insertions": 4,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 4,
        "deletions": 0
      }
    },
    "963a9d6e1e4e5ad704038dc8fdd5ca1cd619f41c": {
      "hash": "963a9d6e1e4e5ad704038dc8fdd5ca1cd619f41c",
      "abbrevHash": "963a9d6",
      "parents": [
        "4479407a7c4a15a4972266d2f618d90d5b763a31"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-05-15T16:20:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-05-15T16:20:00-03:00",
      "subject": "fix(parser): descarta vazios",
      "body": "",
      "refs": [
        {
          "kind": "remoteBranch",
          "name": "feature/parser",
          "fullName": "refs/remotes/feature/parser",
          "isHead": false,
          "remote": "feature"
        }
      ],
      "files": [
        {
          "path": "src/parser.ts",
          "status": "modified",
          "insertions": 2,
          "deletions": 1,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 2,
        "deletions": 1
      }
    },
    "4479407a7c4a15a4972266d2f618d90d5b763a31": {
      "hash": "4479407a7c4a15a4972266d2f618d90d5b763a31",
      "abbrevHash": "4479407",
      "parents": [
        "ad494866acbb027d5047540fc0de5bce206e1d2d"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-05-12T14:00:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-05-12T14:00:00-03:00",
      "subject": "feat(parser): divide pela esquerda",
      "body": "",
      "refs": [],
      "files": [
        {
          "path": "src/parser.ts",
          "status": "added",
          "insertions": 3,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 3,
        "deletions": 0
      }
    },
    "7c88546e9309a0a5ecfc19e39cd599f698d5fc19": {
      "hash": "7c88546e9309a0a5ecfc19e39cd599f698d5fc19",
      "abbrevHash": "7c88546",
      "parents": [
        "ad494866acbb027d5047540fc0de5bce206e1d2d"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-05-16T09:10:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-05-16T09:10:00-03:00",
      "subject": "refactor: saudacao",
      "body": "",
      "refs": [],
      "files": [
        {
          "path": "src/app.ts",
          "status": "modified",
          "insertions": 1,
          "deletions": 1,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 1
      }
    },
    "ad494866acbb027d5047540fc0de5bce206e1d2d": {
      "hash": "ad494866acbb027d5047540fc0de5bce206e1d2d",
      "abbrevHash": "ad49486",
      "parents": [
        "24bd525fcb36d72890002e30573dca125c62b9f9"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-05-08T11:30:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-05-08T11:30:00-03:00",
      "subject": "feat: util | com pipe no assunto",
      "body": "",
      "refs": [],
      "files": [
        {
          "path": "src/util.ts",
          "status": "added",
          "insertions": 1,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 0
      }
    },
    "24bd525fcb36d72890002e30573dca125c62b9f9": {
      "hash": "24bd525fcb36d72890002e30573dca125c62b9f9",
      "abbrevHash": "24bd525",
      "parents": [
        "e743921670072ae92627b5a6ddd0cbabc28c67d3"
      ],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-05-04T10:00:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-05-04T10:00:00-03:00",
      "subject": "feat: primeiro modulo",
      "body": "",
      "refs": [],
      "files": [
        {
          "path": "src/app.ts",
          "status": "added",
          "insertions": 1,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 0
      }
    },
    "e743921670072ae92627b5a6ddd0cbabc28c67d3": {
      "hash": "e743921670072ae92627b5a6ddd0cbabc28c67d3",
      "abbrevHash": "e743921",
      "parents": [],
      "authorName": "Ana Ribeiro",
      "authorEmail": "ana@exemplo.dev",
      "authorDate": "2026-05-02T09:00:00-03:00",
      "committerName": "Ana Ribeiro",
      "committerEmail": "ana@exemplo.dev",
      "committerDate": "2026-05-02T09:00:00-03:00",
      "subject": "chore: esqueleto do projeto",
      "body": "",
      "refs": [],
      "files": [
        {
          "path": "README.md",
          "status": "added",
          "insertions": 1,
          "deletions": 0,
          "binary": false
        }
      ],
      "stats": {
        "filesChanged": 1,
        "insertions": 1,
        "deletions": 0
      }
    }
  },
  "commitDiffs": {
    "ddbf0631de03f68db052ba965a01017aa161cd84": [],
    "07cb2feed1bc1dcf59d802c553537f02fdcb52f3": [
      {
        "path": "src/rascunho.ts",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -0,0 +1 @@",
            "oldStart": 0,
            "oldLines": 0,
            "newStart": 1,
            "newLines": 1,
            "lines": [
              {
                "kind": "add",
                "content": "outro rascunho",
                "oldNumber": null,
                "newNumber": 1
              }
            ]
          }
        ],
        "raw": "diff --git a/src/rascunho.ts b/src/rascunho.ts\nnew file mode 100644\nindex 0000000..31068f9\n--- /dev/null\n+++ b/src/rascunho.ts\n@@ -0,0 +1 @@\n+outro rascunho\n"
      }
    ],
    "a72728077a4f370c0a70eceb39c134833f3094d7": [
      {
        "path": "src/app.ts",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -1 +1 @@",
            "oldStart": 1,
            "oldLines": 1,
            "newStart": 1,
            "newLines": 1,
            "lines": [
              {
                "kind": "del",
                "content": "export const app = () => \"ola mundo\"",
                "oldNumber": 1,
                "newNumber": null
              },
              {
                "kind": "add",
                "content": "export const app = () => \"ola, mundo!\"",
                "oldNumber": null,
                "newNumber": 1
              }
            ]
          }
        ],
        "raw": "diff --git a/src/app.ts b/src/app.ts\nindex 145dd8b..8858025 100644\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-export const app = () => \"ola mundo\"\n+export const app = () => \"ola, mundo!\"\n"
      }
    ],
    "28d7440c1af5f9e79374bc292eed67ca02412af6": [
      {
        "path": "src/version.ts",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -1 +1 @@",
            "oldStart": 1,
            "oldLines": 1,
            "newStart": 1,
            "newLines": 1,
            "lines": [
              {
                "kind": "del",
                "content": "export const version = \"0.2.0\"",
                "oldNumber": 1,
                "newNumber": null
              },
              {
                "kind": "add",
                "content": "export const version = \"0.2.1\"",
                "oldNumber": null,
                "newNumber": 1
              }
            ]
          }
        ],
        "raw": "diff --git a/src/version.ts b/src/version.ts\nindex edc2476..ab312c6 100644\n--- a/src/version.ts\n+++ b/src/version.ts\n@@ -1 +1 @@\n-export const version = \"0.2.0\"\n+export const version = \"0.2.1\"\n"
      }
    ],
    "104a458cbd9aaab597957ef6cf5f1bf5b7bc8a29": [
      {
        "path": "src/version.ts",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -0,0 +1 @@",
            "oldStart": 0,
            "oldLines": 0,
            "newStart": 1,
            "newLines": 1,
            "lines": [
              {
                "kind": "add",
                "content": "export const version = \"0.2.0\"",
                "oldNumber": null,
                "newNumber": 1
              }
            ]
          }
        ],
        "raw": "diff --git a/src/version.ts b/src/version.ts\nnew file mode 100644\nindex 0000000..edc2476\n--- /dev/null\n+++ b/src/version.ts\n@@ -0,0 +1 @@\n+export const version = \"0.2.0\"\n"
      }
    ],
    "f1808377136219adb4c7622b95cecfdccebf8ea2": [
      {
        "path": "notes.md",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -1,2 +1,3 @@",
            "oldStart": 1,
            "oldLines": 2,
            "newStart": 1,
            "newLines": 3,
            "lines": [
              {
                "kind": "context",
                "content": "linha 1",
                "oldNumber": 1,
                "newNumber": 1
              },
              {
                "kind": "context",
                "content": "linha 2",
                "oldNumber": 2,
                "newNumber": 2
              },
              {
                "kind": "add",
                "content": "linha 3",
                "oldNumber": null,
                "newNumber": 3
              }
            ]
          }
        ],
        "raw": "diff --git a/notes.md b/notes.md\nindex b657d30..c38618b 100644\n--- a/notes.md\n+++ b/notes.md\n@@ -1,2 +1,3 @@\n linha 1\n linha 2\n+linha 3\n"
      }
    ],
    "bac084ed4c489b5d6af3fc1f6b1df289cf1e06d8": [
      {
        "path": "notes.md",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -1 +1,2 @@",
            "oldStart": 1,
            "oldLines": 1,
            "newStart": 1,
            "newLines": 2,
            "lines": [
              {
                "kind": "context",
                "content": "linha 1",
                "oldNumber": 1,
                "newNumber": 1
              },
              {
                "kind": "add",
                "content": "linha 2",
                "oldNumber": null,
                "newNumber": 2
              }
            ]
          }
        ],
        "raw": "diff --git a/notes.md b/notes.md\nindex 9ece502..b657d30 100644\n--- a/notes.md\n+++ b/notes.md\n@@ -1 +1,2 @@\n linha 1\n+linha 2\n"
      }
    ],
    "011710fb4d77f7cef380ffc811bc460112ce0b13": [
      {
        "path": "notes.md",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -0,0 +1 @@",
            "oldStart": 0,
            "oldLines": 0,
            "newStart": 1,
            "newLines": 1,
            "lines": [
              {
                "kind": "add",
                "content": "linha 1",
                "oldNumber": null,
                "newNumber": 1
              }
            ]
          }
        ],
        "raw": "diff --git a/notes.md b/notes.md\nnew file mode 100644\nindex 0000000..9ece502\n--- /dev/null\n+++ b/notes.md\n@@ -0,0 +1 @@\n+linha 1\n"
      }
    ],
    "671534eaf34e5b94e53916fc0f54929eaa3585ec": [],
    "d646b596b43665dcd3aa320d8eccb4560923e444": [
      {
        "path": "src/util.ts",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -1 +1 @@",
            "oldStart": 1,
            "oldLines": 1,
            "newStart": 1,
            "newLines": 1,
            "lines": [
              {
                "kind": "del",
                "content": "export const util = (n: number) => n * 2",
                "oldNumber": 1,
                "newNumber": null
              },
              {
                "kind": "add",
                "content": "export const util = (n: number) => (Number.isFinite(n) ? n * 2 : 0)",
                "oldNumber": null,
                "newNumber": 1
              }
            ]
          }
        ],
        "raw": "diff --git a/src/util.ts b/src/util.ts\nindex 03d3f8d..a210e21 100644\n--- a/src/util.ts\n+++ b/src/util.ts\n@@ -1 +1 @@\n-export const util = (n: number) => n * 2\n+export const util = (n: number) => (Number.isFinite(n) ? n * 2 : 0)\n"
      }
    ],
    "c6ce5805cf5b55574bca7ff74c6e68d8c3ecf6d8": [
      {
        "path": "README.md",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -1 +1,3 @@",
            "oldStart": 1,
            "oldLines": 1,
            "newStart": 1,
            "newLines": 3,
            "lines": [
              {
                "kind": "context",
                "content": "projeto de teste",
                "oldNumber": 1,
                "newNumber": 1
              },
              {
                "kind": "add",
                "content": "",
                "oldNumber": null,
                "newNumber": 2
              },
              {
                "kind": "add",
                "content": "agora com parser e ui",
                "oldNumber": null,
                "newNumber": 3
              }
            ]
          }
        ],
        "raw": "diff --git a/README.md b/README.md\nindex 67a8aa8..06b7acf 100644\n--- a/README.md\n+++ b/README.md\n@@ -1 +1,3 @@\n projeto de teste\n+\n+agora com parser e ui\n"
      }
    ],
    "20711f4a0cf0686c888b5363307f914216517a7f": [
      {
        "path": "web/style.css",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -0,0 +1 @@",
            "oldStart": 0,
            "oldLines": 0,
            "newStart": 1,
            "newLines": 1,
            "lines": [
              {
                "kind": "add",
                "content": "body { margin: 0 }",
                "oldNumber": null,
                "newNumber": 1
              }
            ]
          }
        ],
        "raw": "diff --git a/web/style.css b/web/style.css\nnew file mode 100644\nindex 0000000..4739e6d\n--- /dev/null\n+++ b/web/style.css\n@@ -0,0 +1 @@\n+body { margin: 0 }\n"
      }
    ],
    "104787efb3b37f00ed40ec9dc5b6b5f0314e9d41": [
      {
        "path": "web/index.html",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -1 +1,2 @@",
            "oldStart": 1,
            "oldLines": 1,
            "newStart": 1,
            "newLines": 2,
            "lines": [
              {
                "kind": "context",
                "content": "<h1>ui</h1>",
                "oldNumber": 1,
                "newNumber": 1
              },
              {
                "kind": "add",
                "content": "<p>segunda linha</p>",
                "oldNumber": null,
                "newNumber": 2
              }
            ]
          }
        ],
        "raw": "diff --git a/web/index.html b/web/index.html\nindex bb4f42d..11eeb8b 100644\n--- a/web/index.html\n+++ b/web/index.html\n@@ -1 +1,2 @@\n <h1>ui</h1>\n+<p>segunda linha</p>\n"
      }
    ],
    "f503aabd761fac43659f06d343a62f7785e2e4e9": [
      {
        "path": "web/index.html",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -0,0 +1 @@",
            "oldStart": 0,
            "oldLines": 0,
            "newStart": 1,
            "newLines": 1,
            "lines": [
              {
                "kind": "add",
                "content": "<h1>ui</h1>",
                "oldNumber": null,
                "newNumber": 1
              }
            ]
          }
        ],
        "raw": "diff --git a/web/index.html b/web/index.html\nnew file mode 100644\nindex 0000000..bb4f42d\n--- /dev/null\n+++ b/web/index.html\n@@ -0,0 +1 @@\n+<h1>ui</h1>\n"
      }
    ],
    "5b3f26ec7929953c7b31ca8792559e5a83706924": [],
    "963a9d6e1e4e5ad704038dc8fdd5ca1cd619f41c": [
      {
        "path": "src/parser.ts",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -1,3 +1,4 @@",
            "oldStart": 1,
            "oldLines": 3,
            "newStart": 1,
            "newLines": 4,
            "lines": [
              {
                "kind": "context",
                "content": "export function parse(s: string) {",
                "oldNumber": 1,
                "newNumber": 1
              },
              {
                "kind": "del",
                "content": "  return s.split(\"|\")",
                "oldNumber": 2,
                "newNumber": null
              },
              {
                "kind": "add",
                "content": "  const parts = s.split(\"|\")",
                "oldNumber": null,
                "newNumber": 2
              },
              {
                "kind": "add",
                "content": "  return parts.filter(Boolean)",
                "oldNumber": null,
                "newNumber": 3
              },
              {
                "kind": "context",
                "content": "}",
                "oldNumber": 3,
                "newNumber": 4
              }
            ]
          }
        ],
        "raw": "diff --git a/src/parser.ts b/src/parser.ts\nindex e6e4168..fff2305 100644\n--- a/src/parser.ts\n+++ b/src/parser.ts\n@@ -1,3 +1,4 @@\n export function parse(s: string) {\n-  return s.split(\"|\")\n+  const parts = s.split(\"|\")\n+  return parts.filter(Boolean)\n }\n"
      }
    ],
    "4479407a7c4a15a4972266d2f618d90d5b763a31": [
      {
        "path": "src/parser.ts",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -0,0 +1,3 @@",
            "oldStart": 0,
            "oldLines": 0,
            "newStart": 1,
            "newLines": 3,
            "lines": [
              {
                "kind": "add",
                "content": "export function parse(s: string) {",
                "oldNumber": null,
                "newNumber": 1
              },
              {
                "kind": "add",
                "content": "  return s.split(\"|\")",
                "oldNumber": null,
                "newNumber": 2
              },
              {
                "kind": "add",
                "content": "}",
                "oldNumber": null,
                "newNumber": 3
              }
            ]
          }
        ],
        "raw": "diff --git a/src/parser.ts b/src/parser.ts\nnew file mode 100644\nindex 0000000..e6e4168\n--- /dev/null\n+++ b/src/parser.ts\n@@ -0,0 +1,3 @@\n+export function parse(s: string) {\n+  return s.split(\"|\")\n+}\n"
      }
    ],
    "7c88546e9309a0a5ecfc19e39cd599f698d5fc19": [
      {
        "path": "src/app.ts",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -1 +1 @@",
            "oldStart": 1,
            "oldLines": 1,
            "newStart": 1,
            "newLines": 1,
            "lines": [
              {
                "kind": "del",
                "content": "export const app = () => \"oi\"",
                "oldNumber": 1,
                "newNumber": null
              },
              {
                "kind": "add",
                "content": "export const app = () => \"ola mundo\"",
                "oldNumber": null,
                "newNumber": 1
              }
            ]
          }
        ],
        "raw": "diff --git a/src/app.ts b/src/app.ts\nindex 0bc754f..145dd8b 100644\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-export const app = () => \"oi\"\n+export const app = () => \"ola mundo\"\n"
      }
    ],
    "ad494866acbb027d5047540fc0de5bce206e1d2d": [
      {
        "path": "src/util.ts",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -0,0 +1 @@",
            "oldStart": 0,
            "oldLines": 0,
            "newStart": 1,
            "newLines": 1,
            "lines": [
              {
                "kind": "add",
                "content": "export const util = (n: number) => n * 2",
                "oldNumber": null,
                "newNumber": 1
              }
            ]
          }
        ],
        "raw": "diff --git a/src/util.ts b/src/util.ts\nnew file mode 100644\nindex 0000000..03d3f8d\n--- /dev/null\n+++ b/src/util.ts\n@@ -0,0 +1 @@\n+export const util = (n: number) => n * 2\n"
      }
    ],
    "24bd525fcb36d72890002e30573dca125c62b9f9": [
      {
        "path": "src/app.ts",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -0,0 +1 @@",
            "oldStart": 0,
            "oldLines": 0,
            "newStart": 1,
            "newLines": 1,
            "lines": [
              {
                "kind": "add",
                "content": "export const app = () => \"oi\"",
                "oldNumber": null,
                "newNumber": 1
              }
            ]
          }
        ],
        "raw": "diff --git a/src/app.ts b/src/app.ts\nnew file mode 100644\nindex 0000000..0bc754f\n--- /dev/null\n+++ b/src/app.ts\n@@ -0,0 +1 @@\n+export const app = () => \"oi\"\n"
      }
    ],
    "e743921670072ae92627b5a6ddd0cbabc28c67d3": [
      {
        "path": "README.md",
        "binary": false,
        "hunks": [
          {
            "header": "@@ -0,0 +1 @@",
            "oldStart": 0,
            "oldLines": 0,
            "newStart": 1,
            "newLines": 1,
            "lines": [
              {
                "kind": "add",
                "content": "projeto de teste",
                "oldNumber": null,
                "newNumber": 1
              }
            ]
          }
        ],
        "raw": "diff --git a/README.md b/README.md\nnew file mode 100644\nindex 0000000..67a8aa8\n--- /dev/null\n+++ b/README.md\n@@ -0,0 +1 @@\n+projeto de teste\n"
      }
    ]
  },
  "stagedDiff": [
    {
      "path": "src/novo.ts",
      "binary": false,
      "hunks": [
        {
          "header": "@@ -0,0 +1 @@",
          "oldStart": 0,
          "oldLines": 0,
          "newStart": 1,
          "newLines": 1,
          "lines": [
            {
              "kind": "add",
              "content": "export const novo = true",
              "oldNumber": null,
              "newNumber": 1
            }
          ]
        }
      ],
      "raw": "diff --git a/src/novo.ts b/src/novo.ts\nnew file mode 100644\nindex 0000000..a5fb4e2\n--- /dev/null\n+++ b/src/novo.ts\n@@ -0,0 +1 @@\n+export const novo = true\n"
    }
  ],
  "worktreeDiff": [
    {
      "path": "src/app.ts",
      "binary": false,
      "hunks": [
        {
          "header": "@@ -1 +1 @@",
          "oldStart": 1,
          "oldLines": 1,
          "newStart": 1,
          "newLines": 1,
          "lines": [
            {
              "kind": "del",
              "content": "export const app = () => \"ola, mundo!\"",
              "oldNumber": 1,
              "newNumber": null
            },
            {
              "kind": "add",
              "content": "export const app = () => \"ola, MUNDO!\"",
              "oldNumber": null,
              "newNumber": 1
            }
          ]
        }
      ],
      "raw": "diff --git a/src/app.ts b/src/app.ts\nindex 8858025..3847650 100644\n--- a/src/app.ts\n+++ b/src/app.ts\n@@ -1 +1 @@\n-export const app = () => \"ola, mundo!\"\n+export const app = () => \"ola, MUNDO!\"\n"
    },
    {
      "path": "src/version.ts",
      "binary": false,
      "hunks": [
        {
          "header": "@@ -1 +0,0 @@",
          "oldStart": 1,
          "oldLines": 1,
          "newStart": 0,
          "newLines": 0,
          "lines": [
            {
              "kind": "del",
              "content": "export const version = \"0.2.1\"",
              "oldNumber": 1,
              "newNumber": null
            }
          ]
        }
      ],
      "raw": "diff --git a/src/version.ts b/src/version.ts\ndeleted file mode 100644\nindex ab312c6..0000000\n--- a/src/version.ts\n+++ /dev/null\n@@ -1 +0,0 @@\n-export const version = \"0.2.1\"\n"
    }
  ]
};
