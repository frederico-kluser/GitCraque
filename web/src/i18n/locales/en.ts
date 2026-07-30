/**
 * English — the app's default language and the fallback for any key a catalog
 * misses. Git command names, flags and git's own output stay verbatim.
 */
import type { Messages } from "../types.ts";

export const en: Messages = {
  /* ---------------------------------------------------------------- */
  /* Common                                                            */
  /* ---------------------------------------------------------------- */
  "common.cancel": "Cancel",
  "common.close": "Close",
  "common.create": "Create",
  "common.save": "Save",
  "common.add": "Add",
  "common.remove": "Remove",
  "common.open": "Open",
  "common.retry": "try again",
  "common.done": "Done",
  "common.failed": "Failed",
  "common.running": "Running…",
  "common.error": "error",
  "common.ok": "ok",
  "common.unknownError": "unknown error",
  "common.optional": "optional",
  "common.command": "Command",
  "common.copyCommand": "Copy command",
  "common.commandCopied": "Command copied",
  "common.willRun": "Will run",
  "common.holdToConfirm": "Hold the button to confirm. Release early to cancel.",
  "common.holdTo": "Hold to {action}",
  "common.dismiss": "Dismiss",
  "common.missingFromDisk": "gone from disk",
  "common.opened": "open",
  "common.binaryShort": "bin",

  /* ---------------------------------------------------------------- */
  /* Language                                                          */
  /* ---------------------------------------------------------------- */
  "language.label": "Language",
  "language.change": "Change language",
  "language.group": "Language",
  "language.switchTo": "Interface in {name}",
  "language.changed": "Language changed",
  "language.changedTo": "The interface is now in {name}.",

  /* ---------------------------------------------------------------- */
  /* Settings — language, theme, fetch routine and the AI key          */
  /* ---------------------------------------------------------------- */
  "settings.title": "Settings",
  "settings.subtitle": "Your preferences, for every repository you open.",
  "settings.open": "Settings",
  "settings.close": "Close settings",
  "settings.theme": "Theme",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.autoFetch": "Fetch from the remote automatically",
  "settings.autoFetch.hint":
    "Runs git fetch --all --prune every so often, silently. Nothing is pulled: your local branch only moves when you say so. A tick is skipped while a git command is running or the tab is hidden.",
  "settings.autoFetch.off": "Off",
  "settings.autoFetch.seconds_one": "Every {count} second",
  "settings.autoFetch.seconds_other": "Every {count} seconds",
  "settings.autoFetch.minutes_one": "Every {count} minute",
  "settings.autoFetch.minutes_other": "Every {count} minutes",
  "settings.ai.title": "AI features",
  "settings.ai.hint":
    "A single OpenRouter key pays for the agent. It stays on the server, in ~/.config/gitcraque/openrouter.json, and never comes back to the browser.",
  "settings.ai.envHint":
    "This key came from the server's environment. Save one here and it takes priority — the variable left behind in your shell is usually the stale one.",
  "settings.ai.absent": "no key",
  "settings.ai.add": "Add",
  "settings.ai.change": "Replace",
  "settings.ai.remove": "Remove",
  "settings.ai.source.stored": "saved",
  "settings.ai.source.env": "OPENROUTER_API_KEY",
  "settings.ai.source.envFile": "OPENROUTER_API_KEY_FILE",
  "settings.ai.source.none": "—",

  /* ---------------------------------------------------------------- */
  /* Shell                                                             */
  /* ---------------------------------------------------------------- */
  "app.fatal.title": "GitCraque could not open the repository",
  "app.fatal.hint": "Check that the backend is up on {port} and that the given directory exists.",
  "app.emptyRepo.title": "Repository with no commits",
  "app.emptyRepo.body":
    "{command} returned nothing. Stage files in the changes panel and make the first commit — the View Tree shows up right away.",
  "app.picker.title": "Choose a repository",
  "app.picker.body":
    "The server is at {cwd}, and there is no {dotgit} there. Open one of your repositories below — or create a new one with {init} from the Browse tab.",
  "app.splitter.rail": "Rail width",
  "app.splitter.detail": "Detail panel width",
  "app.reconnecting": "Reconnecting to the server…",

  /* ---------------------------------------------------------------- */
  /* Recovery — RecoveryBoundary.tsx                                   */
  /* ---------------------------------------------------------------- */
  "recovery.title": "The interface stopped responding",
  "recovery.body":
    "Something broke while drawing the screen. Reloading brings the app back — nothing was done to the repository.",
  "recovery.reloading": "Reloading GitCraque…",
  "recovery.reload": "Reload now",

  /* ---------------------------------------------------------------- */
  /* Leftovers from the command palette, still used elsewhere        */
  /* ---------------------------------------------------------------- */
  "commands.branch.checkout.pinned": "held by {worktree}",
  "commands.remote.add": "Add Origin",
  "commands.theme.light": "Light theme",
  "commands.theme.dark": "Dark theme",

  /* ---------------------------------------------------------------- */
  /* Toolbar                                                           */
  /* ---------------------------------------------------------------- */
  "toolbar.connection.open": "connected",
  "toolbar.connection.connecting": "connecting",
  "toolbar.connection.reconnecting": "reconnecting",
  "toolbar.connection.closed": "disconnected",
  "toolbar.connection.title": "WebSocket {state}",
  "toolbar.project.trigger": "Switch project — favorites, recents or open another folder",
  "toolbar.project.section": "Projects",
  "toolbar.project.note":
    "Opening another project is also {chdir} on the server: the whole View Tree is reloaded from scratch.",
  "toolbar.project.favorites": "Favorites",
  "toolbar.project.recents": "Recents",
  "toolbar.project.loading": "Reading favorites and recents…",
  "toolbar.project.empty":
    "No favorites or recents yet. Open a folder with the picker below and it shows up here next time.",
  "toolbar.project.openOther": "Open another…",
  "toolbar.head.detached": "detached at {hash}",
  "toolbar.commit.label": "Open changes and commit",
  "toolbar.commit.clean": "Nothing to commit",
  "toolbar.worktree.trigger": "Switch worktree — the server runs process.chdir, no checkout",
  "toolbar.worktree.none": "no worktree",
  "toolbar.worktree.note":
    "Switching worktrees runs {chdir} on the server. No {checkout} happens.",
  "toolbar.worktree.emptyList": "No worktrees listed.",
  "toolbar.activity.label": "Activity: {count} commits in the last {weeks} weeks",
  "toolbar.activity.weeks": "/{weeks} wk",
  "toolbar.pending.step": "{step} of {total}",
  "toolbar.pending.inProgress": "in progress",
  "toolbar.pending.banner": "{kind} in progress, {step}",
  "toolbar.pending.conflicts_one": "{count} conflict",
  "toolbar.pending.conflicts_other": "{count} conflicts",
  "toolbar.pending.continue": "Continue",
  "toolbar.pending.abort": "Abort",
  "toolbar.action.open": "Open",
  "toolbar.action.open.title": "Open another repository from this machine (process.chdir, no checkout)",
  "toolbar.action.branch": "Branch",
  "toolbar.action.stash": "Stash",
  "toolbar.action.refresh": "Reload",
  "toolbar.action.refresh.title": "Reload (⌘R)",
  "toolbar.progress.label": "Operation running",
  "toolbar.progress.running": "Running git command",
  "toolbar.ws.closed": "WebSocket closed — the app is not receiving repository events.",
  "toolbar.ws.reconnecting": "Re-establishing the connection to the server…",

  /* ---------------------------------------------------------------- */
  /* Rail                                                              */
  /* ---------------------------------------------------------------- */
  "rail.label": "Repository references",
  "rail.chip.main": "main",
  "rail.chip.bare": "bare",
  "rail.chip.detached": "detached",
  "rail.chip.locked": "locked",
  "rail.chip.prunable": "prunable",
  "rail.chip.active": "active",
  "rail.chip.pinned": "held",
  "rail.chip.pinnedTitle": "Checked out in {worktree}",
  "rail.chip.annotated": "annotated",
  "rail.chip.lightweight": "lightweight",
  "rail.chip.ssh": "ssh",
  "rail.chip.askpass": "https · askpass",
  "rail.chip.askpassTitle": "https url: uses the GIT_ASKPASS trampoline",

  "rail.worktrees.title": "Worktrees",
  "rail.worktrees.add": "Add worktree",
  "rail.worktrees.prune": "Prune (clear records)",
  "rail.worktrees.removeThis": "Remove this worktree",
  "rail.worktrees.actions": "Actions for worktree {label}",
  "rail.worktrees.empty.title": "No worktrees",
  "rail.worktrees.empty.body": "The server has not listed `git worktree list --porcelain` yet.",

  "rail.branches.title": "Local branches",
  "rail.branches.new": "New branch",
  "rail.branches.actions": "Actions for branch {name}",
  "rail.branches.checkout": "Checkout",
  "rail.branches.pinnedIn": "Held by {worktree}",
  "rail.branches.rename": "Rename",
  "rail.branches.tagHere": "Create tag here",
  "rail.branches.push": "Push this branch",
  "rail.branches.deleteLocal": "Delete Branch (Local)",
  "rail.branches.deleteBoth": "Delete Branch (Local and {remote})",
  "rail.branches.deleteAll": "Delete Everything (worktree, changes, local and remote)",
  "rail.branches.deleteBoth.noRemote": "no matching branch on the remote",
  "rail.branches.ahead": "{count} commits ahead of upstream",
  "rail.branches.behind": "{count} commits behind upstream",
  "rail.branches.empty.title": "No local branches",
  "rail.branches.empty.body": "Repository with no commits, or no refs under refs/heads.",
  "rail.branches.empty.action": "Create the first one",

  "rail.remotes.title": "Remotes",
  "rail.remotes.actions": "Actions for remote {name}",
  "rail.remotes.branchActions": "Actions for {name}",
  "rail.remotes.editUrl": "Edit url",
  "rail.remotes.push": "Push to this remote",
  "rail.remotes.removeRemote": "Remove remote",
  "rail.remotes.createLocal": "Create local branch from here",
  "rail.remotes.deleteRemote": "Delete Branch (Origin)",
  "rail.remotes.noBranches": "No known remote branches.",
  "rail.remotes.empty.title": "No remotes",
  "rail.remotes.empty.body":
    "`git remote -v` returned nothing. Add an origin so you can fetch and push.",

  "rail.tags.title": "Tags",
  "rail.tags.create": "Create tag",
  "rail.tags.actions": "Actions for tag {name}",
  "rail.tags.delete": "Delete tag",
  "rail.tags.empty.title": "No tags",
  "rail.tags.empty.body": "Mark a release from a commit or a branch.",

  "rail.stashes.title": "Stashes",
  "rail.stashes.push": "Stash changes",
  "rail.stashes.pushTitle": "Stash changes (stash push)",
  "rail.stashes.actions": "Actions for {ref}",
  "rail.stashes.apply": "Apply (keep on the stack)",
  "rail.stashes.pop": "Pop (apply and remove)",
  "rail.stashes.drop": "Drop",
  "rail.stashes.empty.title": "Empty stack",
  "rail.stashes.empty.body": "Nothing saved with `git stash`.",

  "parts.actions": "Actions",

  /* ---------------------------------------------------------------- */
  /* File status                                                       */
  /* ---------------------------------------------------------------- */
  "status.added": "added",
  "status.modified": "modified",
  "status.deleted": "deleted",
  "status.renamed": "renamed",
  "status.copied": "copied",
  "status.typechange": "type changed",
  "status.unmerged": "conflict",
  "status.untracked": "untracked",
  "status.unknown": "unknown",

  /* ---------------------------------------------------------------- */
  /* Right column                                                      */
  /* ---------------------------------------------------------------- */
  "side.label": "Commit detail",

  /* ---------------------------------------------------------------- */
  /* File view                                                         */
  /* ---------------------------------------------------------------- */
  "view.label": "Open file",
  "view.back.detail": "Detail",
  "view.back.changes": "Changes",

  /* ---------------------------------------------------------------- */
  /* Changes and commit                                                */
  /* ---------------------------------------------------------------- */
  "changes.label": "Working tree changes",
  "changes.sheet.label": "Changes and commit",
  "changes.sheet.title": "Changes",
  "changes.sheet.close": "Close changes",
  "changes.group.conflicted": "Conflicts",
  "changes.group.staged": "Staged",
  "changes.group.untracked": "Untracked",
  "changes.group.modified": "Modified",
  "changes.stage": "Stage",
  "changes.unstage": "Unstage",
  "changes.discard": "Discard",
  "changes.stageFile": "Stage {path}",
  "changes.unstageFile": "Unstage {path}",
  "changes.discardFile": "Discard {path}",
  "changes.stageAll": "Stage all",
  "changes.unstageAll": "Unstage all",
  "changes.viewFile": "View {path} in the viewer",
  "changes.hold": "hold",
  "changes.filesChanged_one": "{count} file changed",
  "changes.filesChanged_other": "{count} files changed",
  "changes.staged_one": "{count} file staged",
  "changes.staged_other": "{count} files staged",
  "changes.conflictsLeft_one": "{count} conflict left",
  "changes.conflictsLeft_other": "{count} conflicts left",
  "changes.clean.title": "Working tree clean",
  "changes.clean.body":
    "Nothing to stage. Change a file and it shows up here as soon as the .git watcher reports it.",
  "commit.placeholder": "Commit message",
  "commit.placeholder.amend": "New message (empty keeps the original)",
  "commit.subjectCounter": "First line: {length} of {limit} recommended characters",
  "commit.subjectTooLong": "The first line passed {limit} characters — it is the commit subject.",
  "commit.button": "Commit",
  "commit.button.loading": "Committing…",
  "commit.button.ok": "Committed",
  "commit.button.error": "Failed",
  "commit.button.label": "Create commit",

  /* ---------------------------------------------------------------- */
  /* Commit detail                                                     */
  /* ---------------------------------------------------------------- */
  "detail.label": "Commit detail",
  "detail.selectionLabel": "Selection summary",
  "detail.empty.title": "No commit selected",
  "detail.empty.body":
    "Click a commit in the View Tree. Hold ⇧ to mark a range and unlock the squash.",
  "detail.error.title": "Could not read the commit",
  "detail.author": "author",
  "detail.committer": "committer",
  "detail.parent": "parent",
  "detail.parents": "parents",
  "detail.goTo": "Go to {hash}",
  "detail.copyHash": "Copy the full hash",
  "detail.hashCopied": "Hash copied",
  "detail.files": "Files",
  "detail.files.hint": "click to see the diff below",
  "detail.files.empty.title": "No files",
  "detail.files.empty.body": "The commit changed no files.",
  "detail.viewFile": "View {path} in the viewer",
  "detail.fileCount_one": "{count} file",
  "detail.fileCount_other": "{count} files",
  "detail.working.title": "Uncommitted changes",
  "detail.working.hint": "click to see the diff",
  "detail.working.stage": "Stage and commit",
  "detail.stash.label": "Contents of {ref}",
  "detail.stash.back": "Close",
  "detail.stash.body": "Changes saved in this stash. Click to apply, or use the menu to pop them.",
  "detail.stash.empty.title": "Empty stash",
  "detail.stash.empty.body": "This stash contains no changes.",

  "selection.title": "Selection",
  "selection.count_one": "{count} commit",
  "selection.count_other": "{count} commits",
  "selection.range": "Range",
  "selection.newest": "newest",
  "selection.oldest": "oldest",
  "selection.squash": "Squash",
  "selection.squash.body":
    "Joins the {count} commits into one with {command}, via {editor}. The oldest stays {pick}; the rest become {squash}.",
  "selection.squash.button_one": "Squash {count} commit",
  "selection.squash.button_other": "Squash {count} commits",

  /* ---------------------------------------------------------------- */
  /* Graph                                                             */
  /* ---------------------------------------------------------------- */
  "graph.label": "Commit history",
  "graph.column.graph": "Graph",
  "graph.column.description": "Description",
  "graph.column.author": "Author",
  "graph.column.date": "Date",
  "graph.column.hash": "Hash",
  "graph.empty.title": "No commits to draw",
  "graph.empty.body":
    "This repository has no history yet. Make the first commit and the View Tree appears here.",
  "graph.refChip.hint":
    "{ref} — double click switches to this branch; drag it onto another to merge or rebase",

  /* ---------------------------------------------------------------- */
  /* File viewer                                                       */
  /* ---------------------------------------------------------------- */
  "viewer.label": "Viewer for {path}",
  "viewer.mode.diff": "Diff",
  "viewer.mode.markdown": "Rendered",
  "viewer.mode.raw": "Raw",
  "viewer.mode.aria": "File display mode",
  "viewer.workingTree": "working tree",
  "viewer.workingTreeTitle": "file from the working tree",
  "viewer.copyPath": "Copy the file path",
  "viewer.pathCopied": "Path copied",
  "viewer.close": "Close the viewer",
  "viewer.empty.title": "No file open",
  "viewer.empty.body":
    "Pick a file in the commit detail or in the changes panel. It shows up here as diff, rendered (when markdown) and raw.",
  "viewer.error.patch": "Could not read the patch",
  "viewer.error.file": "Could not read the file",
  "viewer.summary.lines_one": "{count} line · {size}",
  "viewer.summary.lines_other": "{count} lines · {size}",

  "diff.noChanges.title": "No changes in this commit",
  "diff.noChanges.body": "{path} was not touched here — the content is in the Raw and Rendered tabs.",
  "diff.binary.title": "Binary file",
  "diff.binary.body": "Git produces no text patch for {path}.",
  "diff.emptyPatch.title": "Empty patch",
  "diff.emptyPatch.body":
    "No hunk changed — git recorded the change without touching content (mode, rename).",
  "diff.renamedFrom": "renamed from {path}",

  "raw.binary.title": "Binary file",
  "raw.binary.body": "{size} — nothing to render as text.",
  "raw.truncated.title": "File truncated",
  "raw.truncated.body": "The backend sent only the start of the blob ({size} in total).",
  "raw.empty.title": "Empty file",
  "raw.empty.body": "Zero bytes.",

  "markdown.error.title": "Could not render safely",
  "markdown.truncated.title": "Document truncated",
  "markdown.truncated.body":
    "The backend sent only the start of the file — the end of the markdown is not here.",
  "markdown.empty.title": "Empty file",
  "markdown.empty.body": "Nothing to render.",
  "markdown.linkRefused": "link refused (scheme {scheme})",
  "markdown.relativeLink": "path relative to the repository — not resolved: {href}",
  "markdown.unknownScheme": "unknown",
  "markdown.image": "image",
  "markdown.imageUnresolved": "· image not resolved",
  "sanitize.noDom": "DOMPurify has no DOM available — the markdown cannot be shown safely",

  /* ---------------------------------------------------------------- */
  /* Status footer                                                     */
  /* ---------------------------------------------------------------- */
  "footer.cwd": "server process.cwd()",
  "footer.gitVersion": "git binary version",
  "footer.commits": "Commits loaded / reachable via --all",
  "footer.commitsSuffix": "commits",
  "footer.elapsed": "Time of the last `git log`",
  "footer.websocket": "WebSocket",

  /* ---------------------------------------------------------------- */
  /* Confirmations                                                     */
  /* ---------------------------------------------------------------- */
  "confirm.close": "Close",

  /* ---------------------------------------------------------------- */
  /* Panel actions                                                     */
  /* ---------------------------------------------------------------- */
  "action.fetch": "Fetch",
  "action.fetch.done": "Fetch done",
  "action.pull": "Pull",
  "action.pull.done": "Pull done",
  "action.pullRebase": "Pull --rebase",
  "action.pullRebase.done": "Pull --rebase done",

  "action.push.noRemote.title": "No remote configured",
  "action.push.noRemote.body": "Add an origin before pushing.",
  "action.push.title": "Push",
  "action.push.description": "Sends {branch} to the chosen remote.",
  "action.push.currentBranch": "the current branch",
  "action.push.confirm": "Push",
  "action.push.done": "Push done",
  "action.push.field.remote": "Remote",
  "action.push.field.branch": "Branch",
  "action.push.field.branch.placeholder": "branch to send",
  "action.push.field.setUpstream.hint": "records the branch upstream",
  "action.push.field.tags.hint": "also sends the tags",
  "action.push.field.force.hint": "rewrites the remote; only use after rebase/squash",

  "action.branch.new": "New branch",
  "action.branch.new.from": "Creates a branch from {ref}.",
  "action.branch.new.fromHead": "Creates a branch from the current HEAD.",
  "action.branch.new.namePlaceholder": "feature/my-branch",
  "action.branch.field.name": "Name",
  "action.branch.field.startPoint": "Start point",
  "action.branch.field.checkout": "Check out afterwards",
  "action.branch.create": "Create branch",
  "action.branch.created": "Branch {name} created",
  "action.checkout": "Checkout",
  "action.checkout.done": "On {ref}",
  "action.checkout.tracking": "On {branch}, tracking {remote}",
  "action.checkout.already": "You are already on {name}",
  "action.checkout.inUse": "{name} is in use",
  "action.checkout.inUse.body":
    "The branch is checked out in worktree {worktree}. Click it under Worktrees to go there — switching worktrees does not check out.",

  "action.branch.rename.title": "Rename {name}",
  "action.branch.rename.description":
    "Renames the local branch. The upstream keeps pointing at the same remote.",
  "action.branch.rename.confirm": "Rename",
  "action.branch.rename.field": "New name",
  "action.branch.rename.op": "Rename branch",

  "action.branch.deleteLocal.title": "Delete Branch (Local)",
  "action.branch.deleteLocal.description":
    "Deletes the local branch {name}. Commits reachable only from it are orphaned.",
  "action.branch.deleteLocal.confirm": "Delete local",
  "action.branch.deleteLocal.force": "-D (force even when unmerged)",
  "action.branch.deleteLocal.force.hint": "uses -D instead of -d",
  "action.branch.deleteLocal.op": "Delete local branch",
  "action.branch.deleteLocal.done": "Branch {name} deleted",

  "action.branch.deleteRemote.title": "Delete Branch (Origin)",
  "action.branch.deleteRemote.description":
    "Deletes {name} on {remote}. The operation hits everyone else using the repository.",
  "action.branch.deleteRemote.confirm": "Delete on {remote}",
  "action.branch.deleteRemote.op": "Delete remote branch",
  "action.branch.deleteRemote.done": "{remote}/{name} deleted",

  "action.branch.deleteBoth.title": "Delete Branch (Local and {remote})",
  "action.branch.deleteBoth.description":
    "Deletes {name} here and on {remote}, in one operation. If there is nothing on {remote}, only the local side is deleted.",
  "action.branch.deleteBoth.confirm": "Delete both sides",
  "action.branch.deleteBoth.op": "Delete local and remote branch",
  "action.branch.deleteBoth.done": "{name} deleted here and on {remote}",
  "action.branch.deleteBoth.doneLocalOnly": "{name} deleted — there was nothing on {remote}",

  "action.branch.deleteAll.title": "Delete Everything for {name}",
  "action.branch.deleteAll.description":
    "Removes the worktree holding {name}, throws away its uncommitted code and deletes the local branch.",
  "action.branch.deleteAll.description.withRemote":
    "Removes the worktree holding {name}, throws away its uncommitted code and deletes the branch locally and on {remote}.",
  "action.branch.deleteAll.pinned": "The worktree {worktree} will be removed from disk.",
  "action.branch.deleteAll.pinnedMain":
    "The branch is on the main worktree: it cannot be removed, so HEAD is detached and uncommitted changes are discarded.",
  "action.branch.deleteAll.confirm": "Delete everything",
  "action.branch.deleteAll.op": "Delete branch, worktree and changes",
  "action.branch.deleteAll.done": "{name} deleted along with its worktree and changes",

  "action.tag.new": "New tag",
  "action.tag.new.at": "Creates a tag at {ref}.",
  "action.tag.new.atHead": "Creates a tag at the current HEAD.",
  "action.tag.confirm": "Create tag",
  "action.tag.field.name": "Name",
  "action.tag.field.target": "Target",
  "action.tag.field.message": "Message (makes the tag annotated)",
  "action.tag.op": "Create tag",
  "action.tag.delete.title": "Delete tag {name}",
  "action.tag.delete.description": "Deletes the local tag; optionally on the remote too.",
  "action.tag.delete.confirm": "Delete tag",
  "action.tag.delete.field": "Also delete on",
  "action.tag.delete.localOnly": "local only",
  "action.tag.delete.op": "Delete tag",

  "action.remote.add.title": "Add Origin",
  "action.remote.add.description":
    "Registers a new remote. An https url uses the credential trampoline (GIT_ASKPASS).",
  "action.remote.add.confirm": "Add",
  "action.remote.field.name": "Name",
  "action.remote.field.url": "Url",
  "action.remote.add.op": "Add remote",
  "action.remote.url.title": "Url for {name}",
  "action.remote.url.description": "Changes the remote url. Check to change only the push url.",
  "action.remote.url.confirm": "Save url",
  "action.remote.url.pushOnly": "--push (push url only)",
  "action.remote.url.op": "Change remote url",
  "action.remote.remove.title": "Remove remote {name}",
  "action.remote.remove.description":
    "Deletes the remote and every remote ref from {name} in the local repository.",
  "action.remote.remove.confirm": "Remove remote",
  "action.remote.remove.op": "Remove remote",

  "action.worktree.add.title": "Add worktree",
  "action.worktree.add.description": "Creates a new working directory linked to this repository.",
  "action.worktree.add.confirm": "Add",
  "action.worktree.field.path": "Path",
  "action.worktree.field.path.placeholder": "/path/to/new-worktree",
  "action.worktree.field.newBranch": "Create branch (-b)",
  "action.worktree.field.ref": "Starting from",
  "action.worktree.add.op": "Add worktree",
  "action.worktree.remove.title": "Remove worktree {label}",
  "action.worktree.remove.description":
    "Unregisters {path}. The directory leaves the disk if git manages to remove it.",
  "action.worktree.remove.confirm": "Remove worktree",
  "action.worktree.remove.force.hint": "removes even with pending changes",
  "action.worktree.remove.op": "Remove worktree",
  "action.worktree.prune.title": "Prune worktrees",
  "action.worktree.prune.description":
    "Removes the record of worktrees whose directory no longer exists.",
  "action.worktree.prune.confirm": "Prune",
  "action.worktree.prune.op": "Prune worktrees",

  "action.stash.title": "Stash",
  "action.stash.description": "Saves the working tree changes onto a stack.",
  "action.stash.confirm": "Save",
  "action.stash.field.message": "Message",
  "action.stash.field.untracked": "-u (include untracked)",
  "action.stash.apply.op": "Apply stash",
  "action.stash.pop.title": "Pop {ref}",
  "action.stash.pop.description":
    "Applies the stash and removes it from the stack. On conflict, the stash is gone anyway.",
  "action.stash.pop.confirm": "Pop",
  "action.stash.pop.op": "Pop stash",
  "action.stash.drop.title": "Drop {ref}",
  "action.stash.drop.description": "Deletes the stash. There is no undo.",
  "action.stash.drop.confirm": "Drop stash",
  "action.stash.drop.op": "Drop stash",

  "action.stage.op": "Stage",
  "action.stage.done": "Staged",
  "action.unstage.op": "Unstage",
  "action.unstage.done": "Unstaged",
  "action.discard.op": "Discard changes",
  "action.discard.done": "Changes discarded",
  "action.commit.op": "Commit",
  "action.commit.done": "Commit created",

  "action.squash.needsTwo": "Squash needs two or more commits",
  "action.squash.needsTwo.body": "Select a range in the graph.",
  "action.squash.title": "Squash {count} commits",
  "action.squash.description":
    "Rewrites history with `git rebase -i` and GIT_SEQUENCE_EDITOR. The oldest commit stays `pick`; the rest become `squash`.",
  "action.squash.confirm": "Squash",
  "action.squash.field.message": "Final message",
  "action.squash.field.message.placeholder": "empty concatenates the originals",
  "action.squash.field.fixup": "fixup (discards the messages)",
  "action.squash.done": "Squash done",

  "action.continue.op": "Continue {kind}",
  "action.abort.title": "Abort {kind}",
  "action.abort.description":
    "Undoes the running operation and returns the repository to its previous state.",
  "action.abort.confirm": "Abort",
  "action.abort.op": "Abort {kind}",

  /* Undo/redo. {step} comes from the reflog and arrives in English, exactly as
   * git wrote it — the same rule that lets git's stderr through untouched. */
  "action.undo": "Undo",
  "action.redo": "Redo",
  "action.undo.step": "Undo: {step}",
  "action.redo.step": "Redo: {step}",
  "action.undo.nothing": "Nothing to undo",
  "action.redo.nothing": "Nothing to redo",
  "action.undo.blocked.pending": "Finish or abort the operation in progress before undoing",
  "action.undo.blocked.empty": "The repository has no commits yet",
  "action.undo.op": "Undo",
  "action.redo.op": "Redo",
  "action.undo.done": "Undone",
  "action.redo.done": "Redone",

  /* ---------------------------------------------------------------- */
  /* Store                                                             */
  /* ---------------------------------------------------------------- */
  "store.log.failed": "Failed to read the history",
  "store.refs.failed": "Failed to read the references",
  "store.operation.failed": "{label} failed",
  "store.worktree.switching": "Switching to {path}",
  "store.worktree.failed": "Could not switch worktree",
  "store.worktree.active": "Active worktree",
  "store.repo.opening": "Opening {path}",
  "store.repo.opened": "Repository opened",
  "store.repo.openFailed": "Could not open the repository",
  "store.repo.initializing": "git init at {path}",
  "store.repo.created": "Repository created",
  "store.repo.initFailed": "git init failed",
  "store.ws.connected": "connected — gitcraque {version} (pid {pid}) at {cwd}",
  "store.ws.cwdChanged": "server directory is now {cwd}",
  "store.lifecycle.resumed": "tab is back — reconnecting and reloading state",
  "store.lifecycle.restored": "view restored after the browser discarded the tab",

  /* ---------------------------------------------------------------- */
  /* Toasts                                                            */
  /* ---------------------------------------------------------------- */
  "toast.copyCommand": "Copy the command",
  "toast.commandCopied": "Command copied",

  /* ---------------------------------------------------------------- */
  /* Dialogs — shared                                                  */
  /* ---------------------------------------------------------------- */
  "dialog.intent.for": "onto",
  "dialog.intent.noOperation": "No operation available.",
  "dialog.intent.rewritesHistory": "rewrites history",
  "dialog.intent.holdRebase": "Hold to rebase",
  "dialog.intent.holdConfirm": "Hold to confirm",

  /* ---------------------------------------------------------------- */
  /* Squash dialog                                                     */
  /* ---------------------------------------------------------------- */
  "squash.title": "Squash {count} commits",
  "squash.description":
    "Joins the selected commits into one. Rewrites history from the oldest of them.",
  "squash.hold": "Hold to join",
  "squash.needTwo": "Select at least two commits in the graph to join. Selected right now: {count}.",
  "squash.warning":
    "This REWRITES history: the commits below stop existing with their current hashes. If any was already published, the next push will require --force-with-lease.",
  "squash.plan": "Interactive rebase plan",
  "squash.plan.hint": "Same order as git-rebase-todo: oldest to newest.",
  "squash.outOfLog": "(outside the loaded log)",
  "squash.mode": "What to do with the messages",
  "squash.mode.fixupHint": "fixup discards the messages of the joined commits.",
  "squash.mode.squashHint": "squash opens the message list for the final commit.",
  "squash.mode.aria": "Action for the joined lines",
  "squash.message": "Final message",
  "squash.message.fixupPlaceholder": "fixup keeps the message of the oldest commit.",
  "squash.message.placeholder": "Leave empty to concatenate the original messages.",
  "squash.message.fixupHint": "Unavailable with fixup.",
  "squash.message.hint": "When filled in, the backend runs git commit --amend -m after the rebase.",
  "squash.preview": "Will run (with GIT_SEQUENCE_EDITOR)",
  "squash.op": "Squash",
  "squash.done_one": "Squash of {count} commit",
  "squash.done_other": "Squash of {count} commits",

  /* ---------------------------------------------------------------- */
  /* Push dialog                                                       */
  /* ---------------------------------------------------------------- */
  "push.title": "Push",
  "push.description": "Sends the commits of the chosen branch to the remote.",
  "push.state.idle": "Send",
  "push.state.sending": "Sending...",
  "push.state.ok": "Sent",
  "push.state.error": "Failed",
  "push.aria": "Send {branch} to {remote}",
  "push.aria.currentBranch": "current branch",
  "push.aria.remote": "remote",
  "push.hold": "Hold for push --force-with-lease",
  "push.noRemotes": "This repository has no remote configured, so there is nowhere to send to.",
  "push.addRemote": "Add remote",
  "push.field.remote": "Remote",
  "push.field.remote.aria": "Target remote",
  "push.field.branch": "Branch",
  "push.field.branch.noUpstream": "{name} (no upstream)",
  "push.field.branch.hint": "{ahead} commits ahead, {behind} behind upstream.",
  "push.field.branch.hint.none": "No upstream configured.",
  "push.field.setUpstream.hint": "Starts tracking the remote branch after this push.",
  "push.field.tags.hint": "Sends every local tag along.",
  "push.field.force.hint": "Overwrites the remote branch, but only if it is where you last saw it.",
  "push.force.warning":
    "Branch {branch} will be OVERWRITTEN on {remote}. Anyone who already fetched the old commits will have to rebase.",
  "push.force.currentBranch": "current",
  "push.https.note":
    "{host} uses https: if the vault has no credential, GitCraque asks for user and token right here, without hanging git.",
  "push.https.theRemote": "The remote",
  "push.op": "Push to {remote}",
  "push.done": "Push to {remote} done",

  /* ---------------------------------------------------------------- */
  /* Conflict dialog                                                   */
  /* ---------------------------------------------------------------- */
  "conflict.kind.rebase": "rebase",
  "conflict.kind.rebaseInteractive": "interactive rebase",
  "conflict.kind.merge": "merge",
  "conflict.kind.cherryPick": "cherry-pick",
  "conflict.kind.revert": "revert",
  "conflict.kind.bisect": "bisect",
  "conflict.title": "{kind} in progress{progress}",
  "conflict.progress": " — step {step} of {total}",
  "conflict.description.conflicts":
    "Git stopped with conflicts. Resolve the files below in your editor and continue, or abort and go back to the previous state.",
  "conflict.description.clean":
    "The repository is in the middle of an operation. Continue when you are done resolving, or abort.",
  "conflict.hold": "Hold to abort",
  "conflict.continue": "Continue",
  "conflict.ai.action": "Resolve with AI",
  "conflict.ai.utterance": "Resolve the conflicts and finish the operation",
  "conflict.applying": "Applying commit {hash}.",
  "conflict.files": "Conflicted files ({count})",
  "conflict.files.hint": "Resolve in your editor and stage; then come back here and continue.",
  "conflict.noFiles":
    "No conflicted file reported. If you already resolved everything, continuing should finish the operation.",
  "conflict.preview.continue": "Continue runs",
  "conflict.preview.abort": "Abort runs",
  "conflict.holdHint":
    "Aborting discards what the operation already applied and returns the repository to its previous state. Hold the button to confirm.",
  "conflict.unsupported":
    "{kind} has no continue or abort through the GitCraque API. Handle it in the terminal (git bisect reset).",
  "conflict.op.continue": "Continue {kind}",
  "conflict.op.abort": "Abort {kind}",
  "conflict.done.resumed": "Operation resumed",
  "conflict.done.aborted": "Operation aborted",

  /* ---------------------------------------------------------------- */
  /* Create ref dialogs                                                */
  /* ---------------------------------------------------------------- */
  "createRef.startHint": "Empty uses the current HEAD. Accepts a hash, branch or tag.",
  "createBranch.title": "Create branch",
  "createBranch.description": "Creates a new local reference pointing at the start point.",
  "createBranch.name": "Branch name",
  "createBranch.name.placeholder": "feature/short-name",
  "createBranch.name.invalid": "Invalid ref name.",
  "createBranch.start": "Start point (optional)",
  "createBranch.checkout": "Switch to the new branch",
  "createBranch.checkout.hint":
    "Checks out after creating. Not to be confused with switching worktrees, which is process.chdir.",
  "createBranch.op": "Create branch",
  "createBranch.done": "Branch {name} created",

  "createTag.title": "Create tag",
  "createTag.description": "Marks a commit with a fixed name.",
  "createTag.name": "Tag name",
  "createTag.name.invalid": "Invalid tag name.",
  "createTag.commit": "Commit (optional)",
  "createTag.message": "Message (optional)",
  "createTag.message.placeholder": "Version 1.0.0",
  "createTag.message.hint": "With a message the tag is annotated (-a -m); without it, lightweight.",
  "createTag.annotated":
    "An annotated tag stores author, date and message as its own object in the repository.",
  "createTag.op": "Create tag",
  "createTag.done": "Tag {name} created",

  /* ---------------------------------------------------------------- */
  /* Delete branch dialogs                                             */
  /* ---------------------------------------------------------------- */
  "deleteLocal.title": "Delete branch {name}",
  "deleteLocal.description": "Removes the local reference only. The remote is untouched.",
  "deleteLocal.hold": "Hold to delete",
  "deleteLocal.holdForce": "Hold to force (-D)",
  "deleteLocal.upstream":
    "{name} tracks {upstream} ({ahead} ahead, {behind} behind). The branch on the server stays.",
  "deleteLocal.notMerged":
    "Git refused: {name} is not fully merged. With -D the commits that exist only there become unreachable and vanish at the next gc.",
  "deleteLocal.safe":
    "With -d git only deletes if the branch is already merged. If it refuses, the -D option shows up here.",
  "deleteLocal.op": "Delete branch {name}",
  "deleteLocal.done": "Branch {name} deleted",

  "deleteRemote.title": "Delete {name} on the server",
  "deleteRemote.description": "This is a delete push: the branch stops existing on the remote.",
  "deleteRemote.hold": "Hold to delete on the server",
  "deleteRemote.warning":
    "Deletes {name} ON THE SERVER {remote}. Everyone using that remote loses the reference, and no local command undoes it. The local copy stays where it is.",
  "deleteRemote.noRemote": "(no remote)",
  "deleteRemote.field.remote": "Remote",
  "deleteRemote.op": "Delete {remote}/{name}",
  "deleteRemote.done": "{remote}/{name} deleted on the server",

  /* ---------------------------------------------------------------- */
  /* Add remote dialog                                                 */
  /* ---------------------------------------------------------------- */
  "addRemote.title": "Add remote",
  "addRemote.description": "Registers a fetch and push destination in this repository.",
  "addRemote.name": "Name",
  "addRemote.name.hint": "How the remote will show up in git remote -v.",
  "addRemote.name.invalid": "Invalid name: use letters, digits, dot, hyphen or underscore.",
  "addRemote.name.duplicated": "There is already a remote called {name}.",
  "addRemote.url": "Url",
  "addRemote.url.hint": "https://host/org/repo.git, ssh://host/path or git@host:org/repo.git",
  "addRemote.url.invalid": "Invalid url. Use https://host/org/repo.git or git@host:org/repo.git.",
  "addRemote.https":
    "https url: fetch and push go through the GIT_ASKPASS trampoline. The first time, GitCraque asks for user and token for {host} in its own box — git never hangs on a prompt.",
  "addRemote.https.thisHost": "this host",
  "addRemote.ssh":
    "ssh url: authentication is your key agent's. If the key has a passphrase, the request also arrives in the credential box.",
  "addRemote.op": "Add remote",
  "addRemote.done": "Remote {name} added",

  /* ---------------------------------------------------------------- */
  /* Credential dialog                                                 */
  /* ---------------------------------------------------------------- */
  "credential.title.username": "Username for {host}",
  "credential.title.secret": "Password or token for {host}",
  "credential.description":
    "Git is waiting for this answer to continue. Nothing is written to disk or passed on the command line.",
  "credential.expiresIn": "Expires in {seconds}s",
  "credential.expired": "Request expired",
  "credential.send": "Send to git",
  "credential.prompt": "Git asked",
  "credential.host": "Host: {host}",
  "credential.field.username": "Username",
  "credential.field.username.placeholder": "your-username",
  "credential.field.secret": "Password or access token",
  "credential.remember": "Remember for this session",
  "credential.remember.hint":
    "Kept in the server's in-memory vault until it shuts down. Never written to disk.",
  "credential.note":
    "The value travels over a unix socket to the vault and from there to the askpass stdout. It never enters the git process env (which anyone can read in /proc) nor argv.",

  /* ---------------------------------------------------------------- */
  /* Repository picker                                                 */
  /* ---------------------------------------------------------------- */
  "picker.dialog.title": "Open repository",
  "picker.dialog.description":
    "Switching repository runs process.chdir() on the server and reloads the whole View Tree. No checkout happens.",
  "picker.search.placeholder": "Filter by name, or paste a path and press Enter",
  "picker.search.aria": "Filter repositories or type a path",
  "picker.search.clear": "Clear filter",
  "picker.enter.navigate": "Enter navigates to {path}",
  "picker.enter.open": "Enter opens {path}",
  "picker.tabs.aria": "Where to look for the repository",
  "picker.tab.favorites": "Favorites",
  "picker.tab.recents": "Recents",
  "picker.tab.search": "Search",
  // "Scan", not "Search": the tab next to it now searches the known-repo
  // history, and two tabs with the same name would be a coin toss.
  "picker.tab.scan": "Scan",
  "picker.tab.browse": "Browse",
  "picker.search.historyEmpty":
    "No git folder known yet. Use Scan or Browse — whatever turns up there is remembered here.",
  "picker.search.noMatch": "No known repository matches the search.",
  "picker.search.insideOf": "inside {name}",
  "picker.search.note_one": "Searches {count} git folder already seen, wherever it lives.",
  "picker.search.note_other": "Searches {count} git folders already seen, wherever they live.",
  "picker.recents.empty": "No repository opened yet. Use Scan or Browse.",
  "picker.recents.noMatch": "No recent matches the filter.",
  "picker.recents.forget": "Forget {name}",
  "picker.recents.forgetTitle": "Remove from recents",
  "picker.scan.notStarted": "Scan not started.",
  "picker.scan.empty": "No repository in the known folders. Try the Browse tab.",
  "picker.scan.noMatch": "No result matches the filter.",
  "picker.scan.none.title": "No repository found",
  "picker.scan.none.body": "{scanned} folders visited in {ms} ms — use the Browse tab",
  "picker.scan.failed": "The scan failed",
  "picker.scan.again": "Scan again",
  "picker.scan.running": "Scanning…",
  "picker.scan.truncated": "The scan hit the time cap — not everything was visited.",
  "picker.scan.note": "Searches the known folders (home, Projects, code, /opt, /srv), up to 4 levels.",
  "picker.browse.pickStart": "Choose a starting point.",
  "picker.browse.noSubfolders": "No subfolder here.",
  "picker.browse.isRepo": "git repository",
  "picker.browse.bare": "bare",
  "picker.browse.linkedWorktree": "linked worktree",
  "picker.browse.tooMany": "The folder has more subfolders than the listing cap — narrow it with the filter.",
  "picker.browse.gitInit": "git init in {name}",
  "picker.browse.openHere": "Open this folder",
  "picker.browse.open": "Open",
  "picker.browse.openRepo": "Open {name}",
  "picker.browse.openRepoTitle": "Open this repository — clicking the row only enters the folder",
  "picker.favorites.note":
    "Drag by the handle to reorder, the pencil sets a nickname, the star unpins. Unlike recents, nothing comes or goes here on its own.",
  "picker.favorites.unavailableNote":
    "Pinning projects needs a route this server does not expose yet.",
  "picker.footer.keys":
    "Arrows navigate, Enter opens. Opening a repository runs {chdir} on the server — there is no checkout.",

  "favorites.unavailable": "Favorites unavailable in this server version.",
  "favorites.empty":
    "No project pinned. Click the star of a repository under Recents, Search or Browse to pin it here.",
  "favorites.noMatch": "No favorite matches the filter.",
  "favorites.pin": "Pin {name} to favorites",
  "favorites.unpin": "Unpin {name} from favorites",
  "favorites.pinTitle": "Pin to favorites",
  "favorites.unpinTitle": "Remove from favorites",
  "favorites.reorder": "Reorder {name}",
  "favorites.reorderTitle": "Drag to reorder (or Alt + arrows)",
  "favorites.rename": "Rename {name}",
  "favorites.renameTitle": "Give this project a nickname",
  "favorites.remove": "Remove",
  "favorites.label": "Project nickname",
  "favorites.editHint": "Enter saves · Esc cancels",
  "favorites.filterHint":
    "Clear the filter to reorder — with a partial list there is no way to know the full order.",
  "favorites.error.unpin": "Could not unpin the project",
  "favorites.error.pin": "Could not pin the project",
  "favorites.error.rename": "Could not rename the favorite",
  "favorites.error.reorder": "Could not reorder the favorites",
  "favorites.a11y.instructions":
    "To reorder with the keyboard, focus the project handle and press space or Enter. Use the arrows to choose the new position and press space or Enter again to drop, or Escape to cancel. Alt with the arrows moves the project without entering drag mode.",
  "favorites.a11y.start": "Reordering {name}, position {index} of {total}.",
  "favorites.a11y.over": "Will drop at position {index} of {total}.",
  "favorites.a11y.outside": "Outside the list.",
  "favorites.a11y.end": "{name} moved to position {index}.",
  "favorites.a11y.unchanged": "The order did not change.",
  "favorites.a11y.cancel": "Reordering of {name} cancelled.",

  "time.now": "just now",
  "time.minutesAgo": "{count} min ago",
  "time.hoursAgo": "{count} h ago",
  "time.yesterday": "yesterday",
  "time.daysAgo": "{count} days ago",

  /* ---------------------------------------------------------------- */
  /* Intent executors                                                  */
  /* ---------------------------------------------------------------- */
  "exec.cherryPick.done": "Cherry-pick applied",
  "exec.merge.done": "Merge done",
  "exec.rebase.done": "Rebase done",
  "exec.deleteLocal.done": "Branch deleted",
  "exec.deleteRemote.done": "Remote branch deleted",
  "exec.unknownRoute": "Unknown route",
  "exec.unknownRoute.body": "The intent asked for {endpoint}, which has no mapped execution.",

  /* ---------------------------------------------------------------- */
  /* DND announcements                                                 */
  /* ---------------------------------------------------------------- */
  "dnd.entity.commit": "commit",
  "dnd.entity.branch": "branch",
  "dnd.entity.remoteBranch": "remote branch",
  "dnd.entity.tag": "tag",
  "dnd.entity.stash": "stash",
  "dnd.entity.item": "item",
  "dnd.zone.branch": "branch",
  "dnd.zone.remoteBranch": "remote branch",
  "dnd.zone.commit": "commit",
  "dnd.zone.tag": "tag",
  "dnd.zone.trash": "the trash",
  "dnd.zone.target": "target",
  "dnd.a11y.instructions":
    "To drag with the keyboard, press space or Enter with the item focused. Use the arrows to move across targets; at each one the engine announces whether the operation is accepted. Press space or Enter again to drop, or Escape to cancel. Dropping runs nothing: a dialog asks for confirmation.",
  "dnd.a11y.dragging": "Dragging {what}.",
  "dnd.a11y.outside": "{what} outside any target.",
  "dnd.a11y.overAccepts": "Over {where}. Accepted: {title}.",
  "dnd.a11y.overRejects": "Over {where}. Refused: {reason}",
  "dnd.a11y.droppedOutside": "{what} dropped outside a target. Nothing was done.",
  "dnd.a11y.dropped": "{what} dropped onto {where}. Confirm the operation in the dialog.",
  "dnd.a11y.refused": "Operation refused: {reason}",
  "dnd.a11y.cancelled": "Drag of {what} cancelled.",
  "dnd.a11y.cancelledPlain": "Drag cancelled.",
  "dnd.chip.no": "no",

  /* ---------------------------------------------------------------- */
  /* Intent engine                                                     */
  /* ---------------------------------------------------------------- */
  "intent.invalid.title": "Move not allowed",
  "intent.sameRef.title": "Same reference",
  "intent.sameRef": "Source and target are the same reference ({label}).",
  "intent.tag.noDrag":
    "Tags do not move by dragging: moving tag {label} would mean recreating it. Use the tag dialog.",
  "intent.stash.noDrag":
    "A stash is not applied by dragging. Use apply or drop on {label} in the rail.",
  "intent.unknownSource": "Unknown source type for the intent engine.",
  "intent.unknownTarget.commit": "Unknown target for a commit.",
  "intent.unknownTarget.branch": "Unknown target for a branch.",
  "intent.unknownTarget.remoteBranch": "Unknown target for a remote branch.",

  "intent.commit.toCommit":
    "Two commits are not an operation. Drag the commit onto a branch to cherry-pick.",
  "intent.commit.toRemote":
    "A commit is not applied straight onto a remote branch. Cherry-pick on the local branch and then push to {label}.",
  "intent.commit.toTag":
    "A tag points at a commit, it does not receive commits. Create a new tag from the tag dialog.",
  "intent.commit.toTrash":
    "A commit is not deleted by dragging. Use reset or revert from the commit menu.",

  "intent.branchBusy.title": "Branch busy in another worktree",
  "intent.cherryPick.busy":
    "Branch {branch} is checked out in worktree {worktree}. Cherry-pick needs it to become HEAD; switch worktrees first.",
  "intent.cherryPick.onHead":
    "Applies commit {hash}{subject} onto {branch}, which is the current branch. Creates a NEW commit; nothing is rewritten.",
  "intent.cherryPick.offHead":
    "Applies commit {hash}{subject} onto {branch}. Since {branch} is not the current branch, the backend checks it out first — that is what the \"onto\" field is for. Creates a NEW commit; nothing is rewritten.",
  "intent.cherryPick.label": "Cherry-pick onto {branch}",
  "intent.cherryPick.title": "Cherry-pick onto {branch}",

  "intent.branch.toRemote":
    "Dragging a local branch onto a remote one would be a push, which needs a remote, an upstream and force-with-lease. Use the Push dialog to send {label}.",
  "intent.branch.toCommit":
    "Moving {label} to another commit is git reset, which throws work away. Do it from the commit menu, not by dragging.",
  "intent.branch.toTag": "A branch does not become a tag by dragging. Create the tag from the tag dialog.",

  "intent.integrate.busy":
    "Branch {branch} is checked out in worktree {worktree}. Merge and rebase need it as HEAD; switch worktrees first.",
  "intent.integrate.checkoutNote":
    " Since {into} is not the current branch, the backend checks it out first — that is what the \"into\" field is for.",
  "intent.merge.label": "Merge {from} into {into}",
  "intent.merge.description":
    "Brings the commits of {from} into {into}, creating a merge commit. NO history is rewritten.{checkoutNote}",
  "intent.rebase.label": "Rebase {from} onto {into}",
  "intent.rebase.description":
    "REWRITES {from}: the commits of {from} that are not yet in {into} are reapplied one by one on top of {into}. {into} does not change and receives nothing.{upstreamNote}",
  "intent.rebase.upstreamNote":
    " {name} tracks {upstream}{gap}: after the rebase the push will require --force-with-lease.",
  "intent.rebase.upstreamGap": " ({ahead} ahead, {behind} behind)",
  "intent.integrate.title": "{from} onto {into}",
  "intent.integrate.description":
    "Choose how to integrate {from} into {into}. Merge preserves the history of both; rebase rewrites {from}.{tail}",
  "intent.integrate.noRebaseRemote":
    " Rebase is not on the list: {from} is a remote branch and cannot be rewritten from here — to rewrite {into} on top of it, use Pull with rebase.",
  "intent.integrate.noRebaseBusy":
    " Rebase is not on the list: {from} is checked out in worktree {worktree} and would have to become HEAD.",

  "intent.delete.currentBranch.title": "Current branch",
  "intent.delete.currentBranch":
    "{name} is the current branch and git does not delete the branch you are on. Switch branches first.",
  "intent.delete.busy":
    "{name} is checked out in worktree {worktree}. Git does not delete a branch checked out in any worktree.",
  "intent.delete.local.description":
    "Removes the LOCAL branch {name}. Commits that existed only there become unreachable. The remote is untouched.",
  "intent.delete.local.title": "Delete branch {name}",
  "intent.delete.local.label": "Delete {name}",

  "intent.remote.toRemote":
    "Two remote branches are not a local operation. Bring one of them onto a local branch first.",
  "intent.remote.toCommit":
    "A remote branch does not move to a commit from here: what moves a ref on the server is the push.",
  "intent.remote.toTag":
    "A remote branch does not become a tag by dragging. Create the tag from the tag dialog.",
  "intent.remote.noRemote":
    "Cannot work out the remote of {label}. Delete it from the remote branches dialog.",
  "intent.delete.remote.description":
    "Deletes branch {name} ON THE SERVER {remote}. Everyone using that remote loses the reference; no local command undoes it.",
  "intent.delete.remote.title": "Delete {remote}/{name} on the server",
  "intent.delete.remote.label": "Delete {remote}/{name}",

  /* ---------------------------------------------------------------- */
  /* Context menus                                                     */
  /* ---------------------------------------------------------------- */
  "menu.reveal": "Take the View Tree here",
  "menu.copyName": "Copy name",
  "menu.copyPath": "Copy the path",
  "menu.copyFileName": "Copy the file name",

  "menu.hint.current": "current",
  "menu.hint.isCurrent": "is the current one",
  "menu.hint.detached": "detached",
  "menu.hint.chdir": "process.chdir",

  "menu.commit.squashSelected": "Squash the {count} commits",
  "menu.commit.cherryPickSelected": "Cherry-pick the {count} onto the current branch",
  "menu.commit.copyHashes": "Copy the hashes",
  "menu.commit.clearSelection": "Clear the selection",
  "menu.commit.checkout": "Checkout this commit",
  "menu.commit.createBranch": "Create branch here",
  "menu.commit.createTag": "Create tag here",
  "menu.commit.cherryPick": "Cherry-pick onto the current branch",
  "menu.commit.revert": "Revert",
  "menu.commit.reset": "Reset the current branch to here",
  "menu.commit.copyHash": "Copy hash",
  "menu.commit.copySubject": "Copy subject",

  "menu.branch.mergeInto": "Merge into {branch}",
  "menu.branch.rebaseOnto": "Rebase {branch} onto this one",
  "menu.branch.createFrom": "Create branch from here",
  "menu.remoteBranch.checkoutExisting": "Checkout {name}",
  "menu.remoteBranch.checkoutNew": "Checkout (creates the local one tracking it)",
  "menu.tag.createBranch": "Create branch from the tag",

  "menu.remote.fetch": "Fetch --prune from this remote",
  "menu.remote.copyFetchUrl": "Copy the fetch url",
  "menu.remote.browse": "Open in the browser",
  "menu.stash.show": "Show contents",
  "menu.stash.copyMessage": "Copy the message",
  "menu.worktree.switch": "Switch to this worktree",

  "menu.file.view": "View in the viewer",
  "menu.commitFile.view": "View in this commit",
  "menu.commitFile.viewWorking": "View the working tree version",

  "menu.viewer.copySelection": "Copy the selection",
  "menu.viewer.nothingSelected": "nothing selected",
  "menu.viewer.chars": "{count} chars",
  "menu.viewer.copySourceHash": "Copy the source hash",
  "menu.viewer.viewMode": "View as {mode}",
  "menu.viewer.openWorking": "Open the working tree version",

  /* ---------------------------------------------------------------- */
  /* Clipboard                                                         */
  /* ---------------------------------------------------------------- */
  "copy.hash": "Hash copied",
  "copy.hashes": "Hashes copied",
  "copy.subject": "Subject copied",
  "copy.name": "Name copied",
  "copy.path": "Path copied",
  "copy.url": "Url copied",
  "copy.message": "Message copied",
  "copy.selection": "Selection copied",
  "copy.failed": "Could not copy: {label}",
  "copy.failed.body": "The browser refused access to the clipboard.",

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */
  "action.fetchRemote.op": "Fetch {remote}",
  "action.fetchRemote.done": "Fetch from {remote} done",

  "action.detached.title": "HEAD detached",
  "action.merge.detached.body":
    "There is no current branch to receive the merge. Check out a branch first.",
  "action.merge.title": "Merge {source} into {target}",
  "action.merge.description":
    "Brings the commits of {source} into {target}. NO history is rewritten; if they diverged, a merge commit is born.",
  "action.merge.confirm": "Merge",
  "action.merge.noFf.hint": "merge commit even when it would fast-forward",
  "action.merge.squash.hint": "joins everything in the index without committing or recording the merge",
  "action.merge.op": "Merge",
  "action.merge.done": "{source} merged into {target}",

  "action.rebase.detached.body":
    "Rebase needs a current branch to rewrite. Check out a branch first.",
  "action.rebase.title": "Rebase {branch} onto {onto}",
  "action.rebase.description":
    "REWRITES {branch}: the commits it has and {onto} does not are reapplied one by one on top of {onto}. {onto} does not change. If {branch} was already published, the next push will require --force-with-lease.",
  "action.rebase.confirm": "Rebase",
  "action.rebase.op": "Rebase",
  "action.rebase.done": "{branch} rebased onto {onto}",

  "action.checkoutCommit.title": "Checkout {hash}",
  "action.checkoutCommit.description":
    "Takes the working tree to {what} with a DETACHED HEAD: no branch follows what you commit from here. To go back, check out a branch; to stay, create a branch at this point.",
  "action.checkoutCommit.done": "Detached at {hash}",

  "action.cherryPick.title_one": "Cherry-pick {hash}",
  "action.cherryPick.title_other": "Cherry-pick {count} commits",
  "action.cherryPick.description":
    "Applies {what} onto {target}. Creates NEW commits, with new hashes; nothing is rewritten. The backend reorders oldest to newest before applying.",
  "action.cherryPick.what_one": "{subject}",
  "action.cherryPick.what_other": "the {count} selected commits",
  "action.cherryPick.currentHead": "the current HEAD",
  "action.cherryPick.confirm": "Cherry-pick",
  "action.cherryPick.noCommit.hint": "applies to the index and stops, without creating a commit",
  "action.cherryPick.op": "Cherry-pick",
  "action.cherryPick.done": "Cherry-pick applied",

  "action.revert.title": "Revert {hash}",
  "action.revert.description":
    "Creates a NEW commit that undoes {what}. The original commit stays in history — nothing is rewritten.",
  "action.revert.confirm": "Revert",
  "action.revert.noCommit.hint": "undoes in the index and stops, without creating a commit",
  "action.revert.op": "Revert",
  "action.revert.done": "{hash} reverted",

  "action.reset.title": "Reset {branch} to {hash}",
  "action.reset.description":
    "Moves {branch} to {hash}. The commits left behind stop being reachable from this branch. With --hard, the working tree changes go too, and there is no undo.",
  "action.reset.confirm": "Reset",
  "action.reset.field.mode": "Mode",
  "action.reset.mode.soft": "--soft — moves the branch; index and tree untouched",
  "action.reset.mode.mixed": "--mixed — moves the branch and clears the index; tree untouched",
  "action.reset.mode.hard": "--hard — moves everything and DISCARDS the working tree",
  "action.reset.op": "Reset",
  "action.reset.done": "Reset --{mode} to {hash}",
  "action.reset.head": "HEAD",

  "action.discard.title_one": "Discard {path}",
  "action.discard.title_other": "Discard {count} files",
  "action.discard.description_one":
    "Returns the file to the state of the last commit. Whatever was not committed is lost, and git keeps no copy of it.",
  "action.discard.description_other":
    "Returns the files to the state of the last commit. Whatever was not committed is lost, and git keeps no copy of it.",
  "action.discard.confirm": "Discard",

  "graph.copyHash": "Copy the full hash",
  "graph.copyHash.aria": "Copy the hash {hash}",
  "graph.copyHash.failed": "Could not copy the hash",
  "graph.tooltip.files_one": "{count} file changed",
  "graph.tooltip.files_other": "{count} files changed",
  "argv.name": "<name>",
  "argv.newName": "<new-name>",
  "argv.url": "<url>",
  "argv.path": "<path>",

  /* ---- voice and text agent ---- */
  "agent.button.aria": "Speak a command to the agent",
  "agent.state.idle": "Hold to speak",
  "agent.state.recording": "Listening…",
  "agent.state.transcribing": "Transcribing…",
  "agent.state.running": "Working…",
  "agent.heard": "You said",
  "agent.typed": "You asked",
  "agent.placeholder": "Tell me what you want done in the repository…",
  "agent.send": "Send",
  "agent.stop": "Stop",
  "agent.close": "Close",
  "agent.commands": "Commands run",
  "agent.done": "Done",
  "agent.failed": "The agent stopped",
  "agent.cost": "This session cost: US$ {cost}",
  "agent.empty": "I could not make out the audio. Try again.",
  "agent.busy": "The agent is already working.",
  "agent.micDenied": "The browser did not grant microphone access.",
  "agent.micMissing": "No microphone available in this browser.",
  "agent.noKey": "The OpenRouter key is missing.",
  "agent.noKey.hint": "Set OPENROUTER_API_KEY or save the key in the settings.",
  "agent.piDownload": "pi will be downloaded on the first run — that takes a moment.",

  /* ---- AI area locked: no OpenRouter key ---- */
  "ai.locked.title": "AI features locked",
  "ai.locked.body":
    "The server found no OpenRouter key. Paste one here to unlock the agent.",
  "ai.locked.placeholder": "sk-or-v1-…",
  "ai.locked.unlock": "Unlock",
  "ai.locked.hint":
    "The key goes straight to the server and stays there, with 0600 permissions. The browser never gets it back.",
};
