<p align="center">
  <img src="https://raw.githubusercontent.com/frederico-kluser/GitCraque/main/docs/logo.png" alt="GitCraque" width="640">
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/frederico-kluser/GitCraque/main/docs/logo.svg" alt="GitCraque" width="340">
</p>

<p align="center">
  <strong>The 2002 Phenomenon learned to code.</strong><br>
  A desktop Git client with a history graph, semantic drag-and-drop and<br>
  automated interactive rebase — and <em>zero</em> Electron on the team sheet.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D22.13-brightgreen" alt="Node >= 22.13">
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT">
  <img src="https://img.shields.io/badge/platform-linux%20%7C%20macos-lightgrey" alt="Linux | macOS">
  <img src="https://img.shields.io/badge/backend-1%20dependency-success" alt="Backend with one dependency">
  <img src="https://img.shields.io/badge/electron-not%20called%20up-critical" alt="Electron not called up">
</p>

<p align="center">
  <a href="README.md">🇧🇷 Leia em português</a>
</p>

---

## Why "GitCraque"?

We looked at **GitKraken** and genuinely admired it. Thing is, a kraken is a
giant octopus: eight arms, squirts black ink when startled, lives at the bottom
of the sea and has never won a World Cup. Eight arms and zero trophies is a poor
return for any squad.

Then we looked the other way and saw a guy with the most indefensible haircut in
the history of football, two goals in the final, and the nickname
**O Fenômeno**.

The choice made itself. We swapped the `K` for a `C`, the cephalopod for the
number 9, and out came **GitCraque** — *craque* being Brazilian for "the ace" —
because plenty of people can resolve a merge conflict, but scoring twice in a
World Cup final is not for every branch.

> Yes, it's a tribute. Yes, it's a pun. No, we will not stop.
>
> And before you ask: that haircut was a technical decision, same as this
> README. Nobody understood it at the time and it worked anyway.

---

## The line-up

A lean squad, no bloated roster, no wage bill in `node_modules`:

| Position | Player | What it does on the pitch |
|---|---|---|
| **Goalkeeper** | Pure Node.js (`node:http`) | Holds the API with no framework in front of it |
| **Centre-back** | `child_process` | Marks the `git` binary tight, always with argv as an array |
| **Full-back** | `ws` | The **only** backend dependency. One. Total. |
| **Midfield** | React 19 + Vite | Spreads the play out to the SPA |
| **Playmaker** | Tailwind + Motion UI | First touch and the good looks |
| **Winger** | `@dnd-kit/core` | Drags a commit and beats his man |
| **Number 9** | Hand-written SVG | Draws the graph. No library. On his own. |

**The backend has exactly one dependency.** This isn't minimalism as an
aesthetic: a team depending on twenty signings can't play out from the back.

---

## How it works

A pure Node.js backend drives the `git` binary through `child_process` and
serves a React SPA. You start it from the terminal, it opens in your browser,
and the **server process** is the thing that "is" in the repository: switching
worktree is a `process.chdir()`, not a `git checkout`.

It's changing position on the pitch without asking the fourth official for a
substitution.

```bash
npx gitcraque                     # inside the repository directory
npx gitcraque ~/code/project      # or point at a path, like `git -C`
npx gitcraque --repo ~ --port 5271
npx gitcraque --no-open           # don't open the browser
```

Started inside a repository? It opens already lined up in it — and lands in your
recents list. Started outside one? The screen is the picker, not an error.

The browser opens on its own. If 5271 is taken it tries the next ten and tells
you in the banner which one it got — so you can keep several repositories open
at once without picking ports by hand.

---

## Trophy cabinet

### 🏆 History graph — *vision*

> He sees the passing lane before you do.

The backend runs `git log --all --topo-order` and hands over the raw data. The
front-end computes each commit's `(X, Y)` with its own algorithm: `Y` is the
topological order, `X` comes from a heuristic that separates *branch children*
from *merge children* to trace routes that never overlap.

The drawing is **hand-written SVG** — `<circle>` for commits, `<path>` with
cubic Béziers for branches and merges — with window virtualization. A repository
with tens of thousands of commits scrolls smooth.

**No gitgraph library is involved.** The dribble is all ours.

### 🏆 Repository picker — *the scout*

> Turned up without a signed contract? Have a seat, we'll sort it out.

Started outside a repository? The screen isn't a warning, it's the picker:
recently opened repositories, a sweep of the machine's usual folders
(`Projects`, `code`, `/opt`, `/srv`) and a folder browser with breadcrumbs.

Pasting a path and hitting Enter works too, and there's a `git init` for
whatever folder you're standing in. Switching repository after that is the
**Open** button on the bar, or `⌘K`.

### 🏆 Worktrees without checkout — *no substitutions needed*

> The whole bench on the pitch at once, and nobody comes off.

`git worktree list --porcelain` feeds the rail. Click a worktree label and the
server runs `process.chdir()` to its absolute path and emits a WebSocket signal;
the interface drops the View Tree and reloads from the new directory.

No `git checkout` happens — nobody's working tree is touched.

### 🏆 Drag-and-drop with intent — *the stepover*

> Drag, glance sideways, and the commit is already on the other branch.

Built on `@dnd-kit/core`. Dragging a **commit** onto a **branch** label proposes
a `cherry-pick`. Dragging a **branch** onto another opens the choice between
`merge` and `rebase`.

The raw command shows up before anything runs, and anything that rewrites
history demands **press-and-hold confirmation** — the button only gives way if
you keep holding. It's the difference between finishing and blazing it over the
bar: you get time to think.

### 🏆 Graphical squash — *the dink*

> Three commits go in, one comes out. And nobody saw how.

Select the commits in the graph and the backend automates the interactive rebase
with an interceptor: it injects `GIT_SEQUENCE_EDITOR="node proxy-editor.mjs"`,
and the script reads the `git-rebase-todo` that git generated, swaps `pick` for
`squash` on the right lines (keeping the first as `pick`) and exits `0`. Git
applies the rewrite as if a human had edited the file.

**Zero terminal emulation.** Nobody opens `vim` in your face.

### 🏆 A push that never hangs — *a free kick with no wall*

> The keeper didn't even see it leave.

A trampoline model: Node injects `GIT_ASKPASS` pointing at its own script, which
answers git over `stdout` with the token captured in the interface. The secret
travels over a unix socket with a single-use nonce — **never** through the git
process environment, never through argv, never on disk.

If the vault doesn't have the credential, the interface asks right there, and
git gets its answer without ever opening an invisible terminal prompt.

### 🏆 The comeback — *the 2002 season*

> He's recovered from far worse than a discarded tab.

Chrome has two ways of saving resources on a background tab, and both hurt
differently: **freezing** (task queues stop and the WebSocket comes back
half-open — `readyState === OPEN` with the connection dead on the other side)
and **discarding** (the page is wiped from memory and comes back from zero).

GitCraque handles all three return paths — `visibilitychange`, `resume` and
`pageshow` with `persisted` — and snapshots the view when the tab **hides**,
never on the way out: `beforeunload` and `unload` simply do not fire when the
browser discards a tab.

A root boundary catches a render that blows up, and the automatic reload has a
budget, because a reload loop is worse than a broken screen — you don't even get
time to open devtools.

Rebuilt knee, World Cup Golden Boot. It works.

---

## Pre-season

Sign him from npm and put him on the team sheet:

```bash
npm install -g gitcraque
cd ~/code/project && gitcraque
```

Or skip the contract — `npx` fetches, runs, and hands him back:

```bash
npx gitcraque
```

**Requirements:** Node >= 22.13 and `git` on your PATH. Boots optional.

> The Node floor isn't arbitrary: the project memory uses `node:sqlite`, which
> only drops the `--experimental-sqlite` flag from 22.13 onwards.

### To contribute

```bash
git clone https://github.com/frederico-kluser/GitCraque.git
cd GitCraque
npm install
npm run build
npm start
```

Installing via `npm i github:frederico-kluser/GitCraque` **does not work**: the
published package ships the SPA pre-built, and the build only runs on
`npm pack`. From source, it's clone and `npm run build`.

---

## Training

```bash
npm run dev          # backend --watch on :5271 + vite on :5273 (proxies /api and /ws)
npm run typecheck    # tsc --noEmit
npm run build        # vite build → web/dist

npm test             # server + graph + dnd + viewer (472 tests)
npm run test:server  # 319 tests
npm run test:graph   # 51 tests
npm run test:dnd     # 20 tests
npm run test:viewer  # 82 tests
npm run test:e2e     # 39 checks (not part of npm test)
```

**Run one command at a time.** The graph suite asserts a wall-clock ratio;
running it beside another heavy job has it calling a foul that never happened —
and there's no VAR here.

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full architecture,
module by module. Interface rules in [`docs/UI.md`](docs/UI.md).

---

## Red card

The server runs `git` commands on your machine. It listens on `127.0.0.1` only,
refuses requests whose `Host`/`Origin` come from anywhere else, and **must not
be exposed to a network**.

An ace plays better at home. This one plays *only* at home.

---

## License

MIT © [Frederico Kluser](https://github.com/frederico-kluser)

<p align="center">
  <sub>We are not affiliated with GitKraken, FIFA, or Ronaldo.<br>
  We are affiliated only with the pun.</sub>
</p>
