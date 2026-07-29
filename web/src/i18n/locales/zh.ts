/**
 * 简体中文。git 的命令名、参数以及 git 自身输出保持英文原样。
 *
 * 中文没有单复数变化，因此 `_one` 与 `_other` 两个变体写成同一句话 —— 这是
 * 刻意的，不是遗漏：翻译器按 `count` 取键，两边都必须存在。
 */
import type { Messages } from "../types.ts";

export const zh: Messages = {
  /* ---------------------------------------------------------------- */
  /* 通用                                                              */
  /* ---------------------------------------------------------------- */
  "common.cancel": "取消",
  "common.close": "关闭",
  "common.create": "创建",
  "common.save": "保存",
  "common.add": "添加",
  "common.remove": "移除",
  "common.open": "打开",
  "common.retry": "重试",
  "common.done": "完成",
  "common.failed": "失败",
  "common.running": "执行中…",
  "common.error": "错误",
  "common.ok": "成功",
  "common.unknownError": "未知错误",
  "common.optional": "可选",
  "common.command": "命令",
  "common.copyCommand": "复制命令",
  "common.commandCopied": "命令已复制",
  "common.willRun": "将要执行",
  "common.holdToConfirm": "按住按钮确认。提前松开即取消。",
  "common.holdTo": "按住以{action}",
  "common.dismiss": "关闭提示",
  "common.missingFromDisk": "已从磁盘消失",
  "common.opened": "已打开",
  "common.binaryShort": "二进制",

  /* ---------------------------------------------------------------- */
  /* 语言                                                              */
  /* ---------------------------------------------------------------- */
  "language.label": "语言",
  "language.change": "切换语言",
  "language.group": "语言",
  "language.switchTo": "界面语言：{name}",
  "language.changed": "语言已切换",
  "language.changedTo": "界面现在使用{name}。",

  /* ---------------------------------------------------------------- */
  /* 设置 — 语言、主题、自动抓取与 AI 密钥                              */
  /* ---------------------------------------------------------------- */
  "settings.title": "设置",
  "settings.subtitle": "你的偏好设置，对打开的每个仓库都生效。",
  "settings.open": "设置",
  "settings.close": "关闭设置",
  "settings.theme": "主题",
  "settings.theme.light": "浅色",
  "settings.theme.dark": "深色",
  "settings.autoFetch": "自动从远程抓取",
  "settings.autoFetch.hint":
    "每隔一段时间静默执行 git fetch --all --prune。不会拉取：本地分支只有你下令时才移动。有 git 命令正在运行或标签页隐藏时，这一轮会跳过。",
  "settings.autoFetch.off": "关闭",
  "settings.autoFetch.seconds_one": "每 {count} 秒",
  "settings.autoFetch.seconds_other": "每 {count} 秒",
  "settings.autoFetch.minutes_one": "每 {count} 分钟",
  "settings.autoFetch.minutes_other": "每 {count} 分钟",
  "settings.ai.title": "AI 功能",
  "settings.ai.hint":
    "一把 OpenRouter 密钥支付整个代理。它只保存在服务器的 ~/.config/gitcraque/openrouter.json 中，绝不回到浏览器。",
  "settings.ai.envHint":
    "这把密钥来自服务器的环境变量。在此保存一把新的即可覆盖它 — 留在 shell 里的变量往往是旧的那把。",
  "settings.ai.absent": "没有密钥",
  "settings.ai.add": "添加",
  "settings.ai.change": "更换",
  "settings.ai.remove": "删除",
  "settings.ai.source.stored": "已保存",
  "settings.ai.source.env": "OPENROUTER_API_KEY",
  "settings.ai.source.envFile": "OPENROUTER_API_KEY_FILE",
  "settings.ai.source.none": "—",

  /* ---------------------------------------------------------------- */
  /* 外壳                                                              */
  /* ---------------------------------------------------------------- */
  "app.fatal.title": "GitCraque 无法打开该仓库",
  "app.fatal.hint": "请确认后端已在 {port} 运行，并且指定的目录存在。",
  "app.emptyRepo.title": "仓库中没有提交",
  "app.emptyRepo.body":
    "{command} 没有返回任何内容。请在更改面板中暂存文件并创建第一个提交 —— View Tree 会立即出现。",
  "app.picker.title": "选择一个仓库",
  "app.picker.body":
    "服务器位于 {cwd}，那里没有 {dotgit}。请在下方打开你的某个仓库 —— 或在「浏览」标签页用 {init} 新建一个。",
  "app.splitter.rail": "侧栏宽度",
  "app.splitter.detail": "详情面板宽度",
  "app.reconnecting": "正在重新连接服务器…",

  /* ---------------------------------------------------------------- */
  /* 命令面板的遗留键，仍在别处使用                                                 */
  /* ---------------------------------------------------------------- */
  "commands.branch.checkout.pinned": "被 {worktree} 占用",
  "commands.remote.add": "添加 Origin",
  "commands.theme.light": "浅色主题",
  "commands.theme.dark": "深色主题",

  /* ---------------------------------------------------------------- */
  /* 顶栏                                                              */
  /* ---------------------------------------------------------------- */
  "toolbar.connection.open": "已连接",
  "toolbar.connection.connecting": "连接中",
  "toolbar.connection.reconnecting": "重连中",
  "toolbar.connection.closed": "未连接",
  "toolbar.connection.title": "WebSocket {state}",
  "toolbar.project.trigger": "切换项目 —— 收藏、最近或打开其他文件夹",
  "toolbar.project.section": "项目",
  "toolbar.project.note": "打开其他项目同样是服务器上的 {chdir}：整个 View Tree 会从头重新加载。",
  "toolbar.project.favorites": "收藏",
  "toolbar.project.recents": "最近",
  "toolbar.project.loading": "正在读取收藏和最近项…",
  "toolbar.project.empty": "还没有收藏或最近项。用下方的选择器打开一个文件夹，下次它就会出现在这里。",
  "toolbar.project.openOther": "打开其他…",
  "toolbar.head.detached": "在 {hash} 处于 detached",
  "toolbar.commit.label": "打开更改并提交",
  "toolbar.commit.clean": "没有可提交的内容",
  "toolbar.worktree.trigger": "切换工作树 —— 服务器执行 process.chdir，不做 checkout",
  "toolbar.worktree.none": "无工作树",
  "toolbar.worktree.note": "切换工作树会在服务器上执行 {chdir}。不会发生任何 {checkout}。",
  "toolbar.worktree.emptyList": "没有列出任何工作树。",
  "toolbar.activity.label": "活跃度：最近 {weeks} 周共 {count} 个提交",
  "toolbar.activity.weeks": "/{weeks} 周",
  "toolbar.pending.step": "第 {step} / {total} 步",
  "toolbar.pending.inProgress": "进行中",
  "toolbar.pending.banner": "{kind} 进行中，{step}",
  "toolbar.pending.conflicts_one": "{count} 处冲突",
  "toolbar.pending.conflicts_other": "{count} 处冲突",
  "toolbar.pending.continue": "继续",
  "toolbar.pending.abort": "中止",
  "toolbar.action.open": "打开",
  "toolbar.action.open.title": "打开本机上的其他仓库（process.chdir，不做 checkout）",
  "toolbar.action.branch": "分支",
  "toolbar.action.stash": "储藏",
  "toolbar.action.refresh": "重新加载",
  "toolbar.action.refresh.title": "重新加载（⌘R）",
  "toolbar.progress.label": "操作进行中",
  "toolbar.progress.running": "正在执行 git 命令",
  "toolbar.ws.closed": "WebSocket 已关闭 —— 应用收不到仓库事件。",
  "toolbar.ws.reconnecting": "正在重新建立与服务器的连接…",

  /* ---------------------------------------------------------------- */
  /* 侧栏                                                              */
  /* ---------------------------------------------------------------- */
  "rail.label": "仓库引用",
  "rail.chip.main": "主工作树",
  "rail.chip.bare": "裸仓库",
  "rail.chip.detached": "detached",
  "rail.chip.locked": "已锁定",
  "rail.chip.prunable": "可清理",
  "rail.chip.active": "当前",
  "rail.chip.pinned": "占用中",
  "rail.chip.pinnedTitle": "已在 {worktree} 中检出",
  "rail.chip.annotated": "附注",
  "rail.chip.lightweight": "轻量",
  "rail.chip.ssh": "ssh",
  "rail.chip.askpass": "https · askpass",
  "rail.chip.askpassTitle": "https 地址：使用 GIT_ASKPASS 跳板",

  "rail.worktrees.title": "工作树",
  "rail.worktrees.add": "添加工作树",
  "rail.worktrees.prune": "Prune（清理登记）",
  "rail.worktrees.removeThis": "移除此工作树",
  "rail.worktrees.actions": "工作树 {label} 的操作",
  "rail.worktrees.empty.title": "没有工作树",
  "rail.worktrees.empty.body": "服务器尚未列出 `git worktree list --porcelain`。",

  "rail.branches.title": "本地分支",
  "rail.branches.new": "新建分支",
  "rail.branches.actions": "分支 {name} 的操作",
  "rail.branches.checkout": "检出",
  "rail.branches.pinnedIn": "被 {worktree} 占用",
  "rail.branches.rename": "重命名",
  "rail.branches.tagHere": "在此创建标签",
  "rail.branches.push": "推送此分支",
  "rail.branches.deleteLocal": "删除分支（本地）",
  "rail.branches.deleteBoth": "删除分支（本地和 {remote}）",
  "rail.branches.deleteAll": "全部删除（工作树、改动、本地和远程）",
  "rail.branches.deleteBoth.noRemote": "远程没有对应的分支",
  "rail.branches.ahead": "领先上游 {count} 个提交",
  "rail.branches.behind": "落后上游 {count} 个提交",
  "rail.branches.empty.title": "没有本地分支",
  "rail.branches.empty.body": "仓库没有提交，或 refs/heads 下没有引用。",
  "rail.branches.empty.action": "创建第一个",

  "rail.remotes.title": "远程",
  "rail.remotes.actions": "远程 {name} 的操作",
  "rail.remotes.branchActions": "{name} 的操作",
  "rail.remotes.editUrl": "编辑地址",
  "rail.remotes.push": "推送到此远程",
  "rail.remotes.removeRemote": "移除远程",
  "rail.remotes.createLocal": "以此创建本地分支",
  "rail.remotes.deleteRemote": "删除分支（Origin）",
  "rail.remotes.noBranches": "没有已知的远程分支。",
  "rail.remotes.empty.title": "没有远程",
  "rail.remotes.empty.body": "`git remote -v` 没有返回任何内容。添加一个 origin 才能 fetch 和 push。",

  "rail.tags.title": "标签",
  "rail.tags.create": "创建标签",
  "rail.tags.actions": "标签 {name} 的操作",
  "rail.tags.delete": "删除标签",
  "rail.tags.empty.title": "没有标签",
  "rail.tags.empty.body": "从某个提交或分支标记一个版本。",

  "rail.stashes.title": "储藏",
  "rail.stashes.push": "储藏更改",
  "rail.stashes.pushTitle": "储藏更改（stash push）",
  "rail.stashes.actions": "{ref} 的操作",
  "rail.stashes.apply": "应用（保留在栈中）",
  "rail.stashes.pop": "Pop（应用并移除）",
  "rail.stashes.drop": "丢弃",
  "rail.stashes.empty.title": "栈为空",
  "rail.stashes.empty.body": "没有用 `git stash` 保存过任何内容。",

  "parts.actions": "操作",

  /* ---------------------------------------------------------------- */
  /* 文件状态                                                          */
  /* ---------------------------------------------------------------- */
  "status.added": "已添加",
  "status.modified": "已修改",
  "status.deleted": "已删除",
  "status.renamed": "已重命名",
  "status.copied": "已复制",
  "status.typechange": "类型变更",
  "status.unmerged": "冲突",
  "status.untracked": "未跟踪",
  "status.unknown": "未知",

  /* ---------------------------------------------------------------- */
  /* 右侧栏                                                            */
  /* ---------------------------------------------------------------- */
  "side.label": "提交详情",

  /* ---------------------------------------------------------------- */
  /* 文件视图                                                          */
  /* ---------------------------------------------------------------- */
  "view.label": "已打开的文件",
  "view.back.detail": "详情",
  "view.back.changes": "更改",

  /* ---------------------------------------------------------------- */
  /* 更改与提交                                                        */
  /* ---------------------------------------------------------------- */
  "changes.label": "工作区更改",
  "changes.sheet.label": "更改与提交",
  "changes.sheet.title": "更改",
  "changes.sheet.close": "关闭更改",
  "changes.group.conflicted": "冲突",
  "changes.group.staged": "已暂存",
  "changes.group.untracked": "未跟踪",
  "changes.group.modified": "已修改",
  "changes.stage": "暂存",
  "changes.unstage": "取消暂存",
  "changes.discard": "丢弃",
  "changes.stageFile": "暂存 {path}",
  "changes.unstageFile": "取消暂存 {path}",
  "changes.discardFile": "丢弃 {path}",
  "changes.stageAll": "全部暂存",
  "changes.unstageAll": "全部取消暂存",
  "changes.viewFile": "在查看器中查看 {path}",
  "changes.hold": "按住",
  "changes.filesChanged_one": "{count} 个文件已更改",
  "changes.filesChanged_other": "{count} 个文件已更改",
  "changes.staged_one": "{count} 个文件已暂存",
  "changes.staged_other": "{count} 个文件已暂存",
  "changes.conflictsLeft_one": "还有 {count} 处冲突待解决",
  "changes.conflictsLeft_other": "还有 {count} 处冲突待解决",
  "changes.clean.title": "工作区干净",
  "changes.clean.body": "没有可暂存的内容。修改一个文件，.git 监视器一报告它就会出现在这里。",
  "commit.placeholder": "提交信息",
  "commit.placeholder.amend": "新的提交信息（留空则保留原信息）",
  "commit.subjectCounter": "第一行：{length} / {limit} 个推荐字符",
  "commit.subjectTooLong": "第一行超过了 {limit} 个字符 —— 它是提交的标题。",
  "commit.button": "提交",
  "commit.button.loading": "提交中…",
  "commit.button.ok": "已提交",
  "commit.button.error": "失败",
  "commit.button.label": "创建提交",

  /* ---------------------------------------------------------------- */
  /* 提交详情                                                          */
  /* ---------------------------------------------------------------- */
  "detail.label": "提交详情",
  "detail.selectionLabel": "选区摘要",
  "detail.empty.title": "未选择任何提交",
  "detail.empty.body": "在 View Tree 中点击一个提交。按住 ⇧ 可标记一个区间并启用压缩。",
  "detail.error.title": "无法读取该提交",
  "detail.author": "作者",
  "detail.committer": "提交者",
  "detail.parent": "父提交",
  "detail.parents": "父提交",
  "detail.goTo": "跳转到 {hash}",
  "detail.copyHash": "复制完整哈希",
  "detail.hashCopied": "哈希已复制",
  "detail.files": "文件",
  "detail.files.hint": "点击可在下方查看 diff",
  "detail.files.empty.title": "没有文件",
  "detail.files.empty.body": "该提交没有改动任何文件。",
  "detail.viewFile": "在查看器中查看 {path}",
  "detail.fileCount_one": "{count} 个文件",
  "detail.fileCount_other": "{count} 个文件",
  "detail.working.title": "未提交的更改",
  "detail.working.hint": "点击查看差异",
  "detail.working.stage": "暂存并提交",

  "selection.title": "选区",
  "selection.count_one": "{count} 个提交",
  "selection.count_other": "{count} 个提交",
  "selection.range": "范围",
  "selection.newest": "最新",
  "selection.oldest": "最旧",
  "selection.squash": "压缩",
  "selection.squash.body":
    "通过 {editor} 用 {command} 把这 {count} 个提交合并为一个。最旧的保持 {pick}；其余变为 {squash}。",
  "selection.squash.button_one": "压缩 {count} 个提交",
  "selection.squash.button_other": "压缩 {count} 个提交",

  /* ---------------------------------------------------------------- */
  /* 图                                                                */
  /* ---------------------------------------------------------------- */
  "graph.label": "提交历史",
  "graph.column.graph": "图",
  "graph.column.description": "描述",
  "graph.column.author": "作者",
  "graph.column.date": "日期",
  "graph.column.hash": "哈希",
  "graph.empty.title": "没有可绘制的提交",
  "graph.empty.body": "此仓库还没有历史。创建第一个提交后，View Tree 就会出现在这里。",
  "graph.refChip.hint": "{ref} —— 双击可切换到该分支；拖到另一个分支上可合并或变基",

  /* ---------------------------------------------------------------- */
  /* 文件查看器                                                        */
  /* ---------------------------------------------------------------- */
  "viewer.label": "{path} 的查看器",
  "viewer.mode.diff": "Diff",
  "viewer.mode.markdown": "渲染",
  "viewer.mode.raw": "原文",
  "viewer.mode.aria": "文件显示模式",
  "viewer.workingTree": "工作区",
  "viewer.workingTreeTitle": "来自工作区的文件",
  "viewer.copyPath": "复制文件路径",
  "viewer.pathCopied": "路径已复制",
  "viewer.close": "关闭查看器",
  "viewer.empty.title": "没有打开任何文件",
  "viewer.empty.body":
    "在提交详情或更改面板中选择一个文件。它会以 diff、渲染（markdown 时）和原文三种方式显示在这里。",
  "viewer.error.patch": "无法读取该 patch",
  "viewer.error.file": "无法读取该文件",
  "viewer.summary.lines_one": "{count} 行 · {size}",
  "viewer.summary.lines_other": "{count} 行 · {size}",

  "diff.noChanges.title": "此提交中没有更改",
  "diff.noChanges.body": "{path} 在这里没有被改动 —— 内容在「原文」和「渲染」标签页中。",
  "diff.binary.title": "二进制文件",
  "diff.binary.body": "git 不会为 {path} 生成文本 patch。",
  "diff.emptyPatch.title": "空 patch",
  "diff.emptyPatch.body": "没有任何片段发生变化 —— git 记录了变更但未改动内容（模式、重命名）。",
  "diff.renamedFrom": "重命名自 {path}",

  "raw.binary.title": "二进制文件",
  "raw.binary.body": "{size} —— 没有可作为文本渲染的内容。",
  "raw.truncated.title": "文件被截断",
  "raw.truncated.body": "后端只发送了 blob 的开头部分（总共 {size}）。",
  "raw.empty.title": "空文件",
  "raw.empty.body": "零字节。",

  "markdown.error.title": "无法安全渲染",
  "markdown.truncated.title": "文档被截断",
  "markdown.truncated.body": "后端只发送了文件的开头部分 —— markdown 的结尾不在这里。",
  "markdown.empty.title": "空文件",
  "markdown.empty.body": "没有可渲染的内容。",
  "markdown.linkRefused": "链接被拒绝（协议 {scheme}）",
  "markdown.relativeLink": "相对于仓库的路径 —— 未解析：{href}",
  "markdown.unknownScheme": "未知",
  "markdown.image": "图片",
  "markdown.imageUnresolved": "· 图片未解析",
  "sanitize.noDom": "DOMPurify 没有可用的 DOM —— 无法安全显示该 markdown",

  /* ---------------------------------------------------------------- */
  /* 状态栏                                                            */
  /* ---------------------------------------------------------------- */
  "footer.cwd": "服务器的 process.cwd()",
  "footer.gitVersion": "git 二进制版本",
  "footer.commits": "已加载 / --all 可达的提交数",
  "footer.commitsSuffix": "个提交",
  "footer.elapsed": "上一次 `git log` 的耗时",
  "footer.websocket": "WebSocket",

  /* ---------------------------------------------------------------- */
  /* 确认对话框                                                        */
  /* ---------------------------------------------------------------- */
  "confirm.close": "关闭",

  /* ---------------------------------------------------------------- */
  /* 面板操作                                                          */
  /* ---------------------------------------------------------------- */
  "action.fetch": "Fetch",
  "action.fetch.done": "Fetch 完成",
  "action.pull": "Pull",
  "action.pull.done": "Pull 完成",
  "action.pullRebase": "Pull --rebase",
  "action.pullRebase.done": "Pull --rebase 完成",

  "action.push.noRemote.title": "未配置任何远程",
  "action.push.noRemote.body": "推送前请先添加一个 origin。",
  "action.push.title": "Push",
  "action.push.description": "将 {branch} 发送到所选的远程。",
  "action.push.currentBranch": "当前分支",
  "action.push.confirm": "Push",
  "action.push.done": "Push 完成",
  "action.push.field.remote": "远程",
  "action.push.field.branch": "分支",
  "action.push.field.branch.placeholder": "要推送的分支",
  "action.push.field.setUpstream.hint": "记录该分支的上游",
  "action.push.field.tags.hint": "同时推送标签",
  "action.push.field.force.hint": "会重写远程；仅在 rebase/squash 之后使用",

  "action.branch.new": "新建分支",
  "action.branch.new.from": "从 {ref} 创建一个分支。",
  "action.branch.new.fromHead": "从当前 HEAD 创建一个分支。",
  "action.branch.new.namePlaceholder": "feature/我的分支",
  "action.branch.field.name": "名称",
  "action.branch.field.startPoint": "起点",
  "action.branch.field.checkout": "创建后检出",
  "action.branch.create": "创建分支",
  "action.branch.created": "分支 {name} 已创建",
  "action.checkout": "检出",
  "action.checkout.done": "已在 {ref}",
  "action.checkout.tracking": "已在 {branch}，跟踪 {remote}",
  "action.checkout.already": "你已经在 {name} 上了",
  "action.checkout.inUse": "{name} 正在使用中",
  "action.checkout.inUse.body":
    "该分支已在工作树 {worktree} 中检出。在「工作树」中点击它即可前往 —— 切换工作树不会执行 checkout。",

  "action.branch.rename.title": "重命名 {name}",
  "action.branch.rename.description": "重命名本地分支。上游仍指向同一个远程。",
  "action.branch.rename.confirm": "重命名",
  "action.branch.rename.field": "新名称",
  "action.branch.rename.op": "重命名分支",

  "action.branch.deleteLocal.title": "删除分支（本地）",
  "action.branch.deleteLocal.description": "删除本地分支 {name}。仅能从它到达的提交将成为孤儿。",
  "action.branch.deleteLocal.confirm": "删除本地",
  "action.branch.deleteLocal.force": "-D（未合并也强制删除）",
  "action.branch.deleteLocal.force.hint": "使用 -D 而非 -d",
  "action.branch.deleteLocal.op": "删除本地分支",
  "action.branch.deleteLocal.done": "分支 {name} 已删除",

  "action.branch.deleteRemote.title": "删除分支（Origin）",
  "action.branch.deleteRemote.description": "在 {remote} 上删除 {name}。此操作会影响所有使用该仓库的人。",
  "action.branch.deleteRemote.confirm": "在 {remote} 上删除",
  "action.branch.deleteRemote.op": "删除远程分支",
  "action.branch.deleteRemote.done": "{remote}/{name} 已删除",

  "action.branch.deleteBoth.title": "删除分支（本地和 {remote}）",
  "action.branch.deleteBoth.description":
    "在同一次操作中删除本地的 {name} 和 {remote} 上的 {name}。如果 {remote} 上没有对应分支，则只删除本地一侧。",
  "action.branch.deleteBoth.confirm": "两侧都删除",
  "action.branch.deleteBoth.op": "删除本地和远程分支",
  "action.branch.deleteBoth.done": "{name} 已在本地和 {remote} 上删除",
  "action.branch.deleteBoth.doneLocalOnly": "{name} 已删除 —— {remote} 上原本没有对应分支",

  "action.branch.deleteAll.title": "全部删除 {name}",
  "action.branch.deleteAll.description":
    "移除占用 {name} 的工作树，丢弃其中未提交的代码，并删除本地分支。",
  "action.branch.deleteAll.description.withRemote":
    "移除占用 {name} 的工作树，丢弃其中未提交的代码，并删除本地以及 {remote} 上的分支。",
  "action.branch.deleteAll.pinned": "工作树 {worktree} 将从磁盘上移除。",
  "action.branch.deleteAll.pinnedMain":
    "该分支位于主工作树：主工作树无法移除，因此会分离 HEAD 并丢弃未提交的改动。",
  "action.branch.deleteAll.confirm": "全部删除",
  "action.branch.deleteAll.op": "删除分支、工作树和改动",
  "action.branch.deleteAll.done": "{name} 已连同其工作树和改动一起删除",

  "action.tag.new": "新建标签",
  "action.tag.new.at": "在 {ref} 处创建一个标签。",
  "action.tag.new.atHead": "在当前 HEAD 处创建一个标签。",
  "action.tag.confirm": "创建标签",
  "action.tag.field.name": "名称",
  "action.tag.field.target": "目标",
  "action.tag.field.message": "信息（填写后标签为附注标签）",
  "action.tag.op": "创建标签",
  "action.tag.delete.title": "删除标签 {name}",
  "action.tag.delete.description": "删除本地标签；也可以同时在远程删除。",
  "action.tag.delete.confirm": "删除标签",
  "action.tag.delete.field": "同时删除于",
  "action.tag.delete.localOnly": "仅本地",
  "action.tag.delete.op": "删除标签",

  "action.remote.add.title": "添加 Origin",
  "action.remote.add.description": "登记一个新的远程。https 地址会走凭据跳板（GIT_ASKPASS）。",
  "action.remote.add.confirm": "添加",
  "action.remote.field.name": "名称",
  "action.remote.field.url": "地址",
  "action.remote.add.op": "添加远程",
  "action.remote.url.title": "{name} 的地址",
  "action.remote.url.description": "更改远程地址。勾选则只更改 push 地址。",
  "action.remote.url.confirm": "保存地址",
  "action.remote.url.pushOnly": "--push（仅 push 地址）",
  "action.remote.url.op": "更改远程地址",
  "action.remote.remove.title": "移除远程 {name}",
  "action.remote.remove.description": "从本地仓库中删除该远程以及 {name} 的所有远程引用。",
  "action.remote.remove.confirm": "移除远程",
  "action.remote.remove.op": "移除远程",

  "action.worktree.add.title": "添加工作树",
  "action.worktree.add.description": "创建一个与此仓库关联的新工作目录。",
  "action.worktree.add.confirm": "添加",
  "action.worktree.field.path": "路径",
  "action.worktree.field.path.placeholder": "/新工作树/的/路径",
  "action.worktree.field.newBranch": "创建分支（-b）",
  "action.worktree.field.ref": "起始于",
  "action.worktree.add.op": "添加工作树",
  "action.worktree.remove.title": "移除工作树 {label}",
  "action.worktree.remove.description": "注销 {path}。如果 git 能删除，该目录也会从磁盘上移除。",
  "action.worktree.remove.confirm": "移除工作树",
  "action.worktree.remove.force.hint": "即使有未提交更改也移除",
  "action.worktree.remove.op": "移除工作树",
  "action.worktree.prune.title": "清理工作树",
  "action.worktree.prune.description": "移除目录已不存在的工作树的登记记录。",
  "action.worktree.prune.confirm": "执行 prune",
  "action.worktree.prune.op": "清理工作树",

  "action.stash.title": "Stash",
  "action.stash.description": "把工作区的更改保存到一个栈中。",
  "action.stash.confirm": "保存",
  "action.stash.field.message": "信息",
  "action.stash.field.untracked": "-u（包含未跟踪文件）",
  "action.stash.apply.op": "应用储藏",
  "action.stash.pop.title": "Pop {ref}",
  "action.stash.pop.description": "应用该储藏并将其从栈中移除。若发生冲突，储藏仍会消失。",
  "action.stash.pop.confirm": "Pop",
  "action.stash.pop.op": "Pop 储藏",
  "action.stash.drop.title": "丢弃 {ref}",
  "action.stash.drop.description": "删除该储藏。无法撤销。",
  "action.stash.drop.confirm": "丢弃储藏",
  "action.stash.drop.op": "丢弃储藏",

  "action.stage.op": "暂存",
  "action.stage.done": "已暂存",
  "action.unstage.op": "取消暂存",
  "action.unstage.done": "已取消暂存",
  "action.discard.op": "丢弃更改",
  "action.discard.done": "更改已丢弃",
  "action.commit.op": "提交",
  "action.commit.done": "提交已创建",

  "action.squash.needsTwo": "压缩需要两个或更多提交",
  "action.squash.needsTwo.body": "请在图中选择一个区间。",
  "action.squash.title": "压缩 {count} 个提交",
  "action.squash.description":
    "使用 `git rebase -i` 和 GIT_SEQUENCE_EDITOR 重写历史。最旧的提交保持 `pick`；其余变为 `squash`。",
  "action.squash.confirm": "压缩",
  "action.squash.field.message": "最终信息",
  "action.squash.field.message.placeholder": "留空则拼接原有信息",
  "action.squash.field.fixup": "fixup（丢弃各条信息）",
  "action.squash.done": "压缩完成",

  "action.continue.op": "继续 {kind}",
  "action.abort.title": "中止 {kind}",
  "action.abort.description": "撤销进行中的操作，把仓库恢复到之前的状态。",
  "action.abort.confirm": "中止",
  "action.abort.op": "中止 {kind}",

  /* 撤销/重做。{step} 来自 reflog，以 git 写下的英文原样呈现 —— 与让 git 的
   * stderr 原样透传的规则相同。 */
  "action.undo": "撤销",
  "action.redo": "重做",
  "action.undo.step": "撤销：{step}",
  "action.redo.step": "重做：{step}",
  "action.undo.nothing": "没有可撤销的操作",
  "action.redo.nothing": "没有可重做的操作",
  "action.undo.blocked.pending": "请先完成或中止正在进行的操作，然后再撤销",
  "action.undo.blocked.empty": "仓库中还没有任何提交",
  "action.undo.op": "撤销",
  "action.redo.op": "重做",
  "action.undo.done": "已撤销",
  "action.redo.done": "已重做",

  /* ---------------------------------------------------------------- */
  /* Store                                                             */
  /* ---------------------------------------------------------------- */
  "store.log.failed": "读取历史失败",
  "store.refs.failed": "读取引用失败",
  "store.operation.failed": "{label} 失败",
  "store.worktree.switching": "正在切换到 {path}",
  "store.worktree.failed": "无法切换工作树",
  "store.worktree.active": "当前工作树",
  "store.repo.opening": "正在打开 {path}",
  "store.repo.opened": "仓库已打开",
  "store.repo.openFailed": "无法打开该仓库",
  "store.repo.initializing": "在 {path} 执行 git init",
  "store.repo.created": "仓库已创建",
  "store.repo.initFailed": "git init 失败",
  "store.ws.connected": "已连接 —— gitcraque {version}（pid {pid}），位于 {cwd}",
  "store.ws.cwdChanged": "服务器目录现在是 {cwd}",

  /* ---------------------------------------------------------------- */
  /* 提示                                                              */
  /* ---------------------------------------------------------------- */
  "toast.copyCommand": "复制该命令",
  "toast.commandCopied": "命令已复制",

  /* ---------------------------------------------------------------- */
  /* 对话框 —— 公共部分                                                */
  /* ---------------------------------------------------------------- */
  "dialog.intent.for": "到",
  "dialog.intent.noOperation": "没有可用的操作。",
  "dialog.intent.rewritesHistory": "会重写历史",
  "dialog.intent.holdRebase": "按住以变基",
  "dialog.intent.holdConfirm": "按住以确认",

  /* ---------------------------------------------------------------- */
  /* 压缩对话框                                                        */
  /* ---------------------------------------------------------------- */
  "squash.title": "压缩 {count} 个提交",
  "squash.description": "把选中的提交合并为一个。从其中最旧的那个开始重写历史。",
  "squash.hold": "按住以合并",
  "squash.needTwo": "请在图中至少选择两个提交才能合并。当前已选：{count}。",
  "squash.warning":
    "此操作会重写历史：下列提交将不再以当前哈希存在。如果其中任何一个已经发布过，下一次 push 将需要 --force-with-lease。",
  "squash.plan": "交互式变基计划",
  "squash.plan.hint": "与 git-rebase-todo 顺序一致：从最旧到最新。",
  "squash.outOfLog": "（不在已加载的日志中）",
  "squash.mode": "如何处理提交信息",
  "squash.mode.fixupHint": "fixup 会丢弃被合并提交的信息。",
  "squash.mode.squashHint": "squash 会为最终提交打开信息列表。",
  "squash.mode.aria": "被合并行的动作",
  "squash.message": "最终信息",
  "squash.message.fixupPlaceholder": "fixup 会保留最旧提交的信息。",
  "squash.message.placeholder": "留空则拼接原有的各条信息。",
  "squash.message.fixupHint": "使用 fixup 时不可用。",
  "squash.message.hint": "填写后，后端会在变基之后执行 git commit --amend -m。",
  "squash.preview": "将要执行（配合 GIT_SEQUENCE_EDITOR）",
  "squash.op": "压缩",
  "squash.done_one": "已压缩 {count} 个提交",
  "squash.done_other": "已压缩 {count} 个提交",

  /* ---------------------------------------------------------------- */
  /* 推送对话框                                                        */
  /* ---------------------------------------------------------------- */
  "push.title": "Push",
  "push.description": "把所选分支的提交发送到远程。",
  "push.state.idle": "发送",
  "push.state.sending": "发送中...",
  "push.state.ok": "已发送",
  "push.state.error": "失败",
  "push.aria": "把 {branch} 发送到 {remote}",
  "push.aria.currentBranch": "当前分支",
  "push.aria.remote": "远程",
  "push.hold": "按住以执行 push --force-with-lease",
  "push.noRemotes": "此仓库没有配置任何远程，因此没有可发送的目标。",
  "push.addRemote": "添加远程",
  "push.field.remote": "远程",
  "push.field.remote.aria": "目标远程",
  "push.field.branch": "分支",
  "push.field.branch.noUpstream": "{name}（无上游）",
  "push.field.branch.hint": "领先上游 {ahead} 个提交，落后 {behind} 个。",
  "push.field.branch.hint.none": "未配置上游。",
  "push.field.setUpstream.hint": "此次推送后开始跟踪该远程分支。",
  "push.field.tags.hint": "同时发送所有本地标签。",
  "push.field.force.hint": "覆盖远程分支，但仅当它仍停留在你上次看到的位置时。",
  "push.force.warning":
    "分支 {branch} 将在 {remote} 上被覆盖。已经拉取过旧提交的人将不得不变基。",
  "push.force.currentBranch": "当前",
  "push.https.note":
    "{host} 使用 https：如果保险库中没有凭据，GitCraque 会就在这里询问用户名和令牌，而不会让 git 卡住。",
  "push.https.theRemote": "该远程",
  "push.op": "推送到 {remote}",
  "push.done": "推送到 {remote} 完成",

  /* ---------------------------------------------------------------- */
  /* 冲突对话框                                                        */
  /* ---------------------------------------------------------------- */
  "conflict.kind.rebase": "rebase",
  "conflict.kind.rebaseInteractive": "交互式 rebase",
  "conflict.kind.merge": "merge",
  "conflict.kind.cherryPick": "cherry-pick",
  "conflict.kind.revert": "revert",
  "conflict.kind.bisect": "bisect",
  "conflict.title": "{kind} 进行中{progress}",
  "conflict.progress": " —— 第 {step} / {total} 步",
  "conflict.description.conflicts":
    "git 因冲突停了下来。请在编辑器中解决下列文件后继续，或中止并回到之前的状态。",
  "conflict.description.clean": "仓库正处在一次操作的中途。解决完成后继续，或者中止。",
  "conflict.hold": "按住以中止",
  "conflict.continue": "继续",
  "conflict.applying": "正在应用提交 {hash}。",
  "conflict.files": "冲突文件（{count}）",
  "conflict.files.hint": "在编辑器中解决并暂存；然后回到这里继续。",
  "conflict.noFiles": "没有报告任何冲突文件。如果你已经全部解决，继续应该就能完成该操作。",
  "conflict.preview.continue": "「继续」将执行",
  "conflict.preview.abort": "「中止」将执行",
  "conflict.holdHint": "中止会丢弃该操作已经应用的内容，并把仓库恢复到之前的状态。按住按钮确认。",
  "conflict.unsupported":
    "{kind} 在 GitCraque 的 API 中没有继续或中止。请在终端中处理（git bisect reset）。",
  "conflict.op.continue": "继续 {kind}",
  "conflict.op.abort": "中止 {kind}",
  "conflict.done.resumed": "操作已恢复",
  "conflict.done.aborted": "操作已中止",

  /* ---------------------------------------------------------------- */
  /* 创建引用的对话框                                                  */
  /* ---------------------------------------------------------------- */
  "createRef.startHint": "留空则使用当前 HEAD。接受哈希、分支或标签。",
  "createBranch.title": "创建分支",
  "createBranch.description": "创建一个指向该起点的新本地引用。",
  "createBranch.name": "分支名称",
  "createBranch.name.placeholder": "feature/简短名称",
  "createBranch.name.invalid": "引用名称无效。",
  "createBranch.start": "起点（可选）",
  "createBranch.checkout": "切换到新分支",
  "createBranch.checkout.hint": "创建后执行 checkout。不要与切换工作树混淆，后者是 process.chdir。",
  "createBranch.op": "创建分支",
  "createBranch.done": "分支 {name} 已创建",

  "createTag.title": "创建标签",
  "createTag.description": "用一个固定名称标记某个提交。",
  "createTag.name": "标签名称",
  "createTag.name.invalid": "标签名称无效。",
  "createTag.commit": "提交（可选）",
  "createTag.message": "信息（可选）",
  "createTag.message.placeholder": "版本 1.0.0",
  "createTag.message.hint": "填写信息则为附注标签（-a -m）；不填则为轻量标签。",
  "createTag.annotated": "附注标签会把作者、日期和信息作为独立对象保存在仓库中。",
  "createTag.op": "创建标签",
  "createTag.done": "标签 {name} 已创建",

  /* ---------------------------------------------------------------- */
  /* 删除分支的对话框                                                  */
  /* ---------------------------------------------------------------- */
  "deleteLocal.title": "删除分支 {name}",
  "deleteLocal.description": "只移除本地引用。远程不受影响。",
  "deleteLocal.hold": "按住以删除",
  "deleteLocal.holdForce": "按住以强制删除（-D）",
  "deleteLocal.upstream":
    "{name} 跟踪 {upstream}（领先 {ahead}，落后 {behind}）。服务器上的分支依然存在。",
  "deleteLocal.notMerged":
    "git 拒绝了：{name} 尚未完全合并。使用 -D 后，只存在于它上面的提交将无法到达，并在下一次 gc 时消失。",
  "deleteLocal.safe": "使用 -d 时，git 只在分支已合并的情况下删除。若被拒绝，-D 选项会出现在这里。",
  "deleteLocal.op": "删除分支 {name}",
  "deleteLocal.done": "分支 {name} 已删除",

  "deleteRemote.title": "在服务器上删除 {name}",
  "deleteRemote.description": "这是一次删除推送：该分支将不再存在于远程。",
  "deleteRemote.hold": "按住以在服务器上删除",
  "deleteRemote.warning":
    "在服务器 {remote} 上删除 {name}。所有使用该远程的人都会失去这个引用，且没有任何本地命令可以撤销。本地副本保持原样。",
  "deleteRemote.noRemote": "（无远程）",
  "deleteRemote.field.remote": "远程",
  "deleteRemote.op": "删除 {remote}/{name}",
  "deleteRemote.done": "{remote}/{name} 已在服务器上删除",

  /* ---------------------------------------------------------------- */
  /* 添加远程的对话框                                                  */
  /* ---------------------------------------------------------------- */
  "addRemote.title": "添加远程",
  "addRemote.description": "在此仓库中登记一个 fetch 和 push 的目标。",
  "addRemote.name": "名称",
  "addRemote.name.hint": "该远程在 git remote -v 中显示的名字。",
  "addRemote.name.invalid": "名称无效：请使用字母、数字、点、连字符或下划线。",
  "addRemote.name.duplicated": "已经存在一个名为 {name} 的远程。",
  "addRemote.url": "地址",
  "addRemote.url.hint": "https://host/org/repo.git、ssh://host/路径 或 git@host:org/repo.git",
  "addRemote.url.invalid": "地址无效。请使用 https://host/org/repo.git 或 git@host:org/repo.git。",
  "addRemote.https":
    "https 地址：fetch 和 push 会走 GIT_ASKPASS 跳板。第一次时，GitCraque 会在自己的对话框中为 {host} 询问用户名和令牌 —— git 绝不会卡在提示符上。",
  "addRemote.https.thisHost": "该主机",
  "addRemote.ssh":
    "ssh 地址：认证由你的密钥代理负责。如果密钥带口令，请求同样会出现在凭据对话框中。",
  "addRemote.op": "添加远程",
  "addRemote.done": "远程 {name} 已添加",

  /* ---------------------------------------------------------------- */
  /* 凭据对话框                                                        */
  /* ---------------------------------------------------------------- */
  "credential.title.username": "{host} 的用户名",
  "credential.title.secret": "{host} 的密码或令牌",
  "credential.description": "git 正在等待这个回答才能继续。任何内容都不会写入磁盘或出现在命令行上。",
  "credential.expiresIn": "{seconds} 秒后过期",
  "credential.expired": "请求已过期",
  "credential.send": "发送给 git",
  "credential.prompt": "git 请求",
  "credential.host": "主机：{host}",
  "credential.field.username": "用户名",
  "credential.field.username.placeholder": "你的用户名",
  "credential.field.secret": "密码或访问令牌",
  "credential.remember": "在本次会话中记住",
  "credential.remember.hint": "保存在服务器的内存保险库中，直到服务器关闭。绝不写入磁盘。",
  "credential.note":
    "该值经由 unix socket 传到保险库，再从那里进入 askpass 的 stdout。它不会进入 git 进程的环境变量（任何人都能在 /proc 中读到），也不会进入 argv。",

  /* ---------------------------------------------------------------- */
  /* 仓库选择器                                                        */
  /* ---------------------------------------------------------------- */
  "picker.dialog.title": "打开仓库",
  "picker.dialog.description":
    "切换仓库会在服务器上执行 process.chdir()，并重新加载整个 View Tree。不会发生任何 checkout。",
  "picker.search.placeholder": "按名称筛选，或粘贴一个路径后按回车",
  "picker.search.aria": "筛选仓库或输入路径",
  "picker.search.clear": "清除筛选",
  "picker.enter.navigate": "回车前往 {path}",
  "picker.enter.open": "回车打开 {path}",
  "picker.tabs.aria": "在哪里查找仓库",
  "picker.tab.favorites": "收藏",
  "picker.tab.recents": "最近",
  "picker.tab.search": "搜索",
  // 「扫描」而非「搜索」：旁边的标签页现在搜索已知仓库的历史记录，
  // 两个同名标签页会让人无从选择。
  "picker.tab.scan": "扫描",
  "picker.tab.browse": "浏览",
  "picker.search.historyEmpty":
    "尚未知晓任何 git 文件夹。请使用「扫描」或「浏览」—— 在那里出现过的都会记在这里。",
  "picker.search.noMatch": "没有已知仓库匹配该搜索。",
  "picker.search.insideOf": "位于 {name} 内",
  "picker.search.note_one": "在已见过的 {count} 个 git 文件夹中搜索，无论它在何处。",
  "picker.search.note_other": "在已见过的 {count} 个 git 文件夹中搜索，无论它们在何处。",
  "picker.recents.empty": "还没有打开过任何仓库。请使用「扫描」或「浏览」。",
  "picker.recents.noMatch": "没有最近项匹配该筛选。",
  "picker.recents.forget": "忘记 {name}",
  "picker.recents.forgetTitle": "从最近项中移除",
  "picker.scan.notStarted": "尚未开始搜索。",
  "picker.scan.empty": "已知文件夹中没有仓库。试试「浏览」标签页。",
  "picker.scan.noMatch": "没有结果匹配该筛选。",
  "picker.scan.none.title": "没有找到仓库",
  "picker.scan.none.body": "在 {ms} 毫秒内访问了 {scanned} 个文件夹 —— 请使用「浏览」标签页",
  "picker.scan.failed": "搜索失败",
  "picker.scan.again": "重新搜索",
  "picker.scan.running": "搜索中…",
  "picker.scan.truncated": "搜索因超时而停止 —— 并非所有目录都被访问。",
  "picker.scan.note": "在已知文件夹（个人目录、Projects、code、/opt、/srv）中最多向下搜索 4 层。",
  "picker.browse.pickStart": "请选择一个起点。",
  "picker.browse.noSubfolders": "这里没有子文件夹。",
  "picker.browse.isRepo": "git 仓库",
  "picker.browse.bare": "裸仓库",
  "picker.browse.linkedWorktree": "关联工作树",
  "picker.browse.tooMany": "该文件夹的子文件夹数量超过了列表上限 —— 请用筛选缩小范围。",
  "picker.browse.gitInit": "在 {name} 执行 git init",
  "picker.browse.openHere": "打开此文件夹",
  "picker.browse.open": "打开",
  "picker.browse.openRepo": "打开 {name}",
  "picker.browse.openRepoTitle": "打开此仓库 —— 点击行只会进入文件夹",
  "picker.favorites.note":
    "拖动手柄可排序，铅笔可设置别名，星标可取消固定。与最近项不同，这里的内容不会自行增减。",
  "picker.favorites.unavailableNote": "固定项目需要此服务器尚未提供的接口。",
  "picker.footer.keys":
    "方向键导航，回车打开。打开仓库会在服务器上执行 {chdir} —— 不会有 checkout。",

  "favorites.unavailable": "此服务器版本不支持收藏。",
  "favorites.empty": "还没有固定任何项目。在「最近」「搜索」或「浏览」中点击仓库的星标即可固定到这里。",
  "favorites.noMatch": "没有收藏匹配该筛选。",
  "favorites.pin": "把 {name} 固定到收藏",
  "favorites.unpin": "把 {name} 从收藏中取消固定",
  "favorites.pinTitle": "固定到收藏",
  "favorites.unpinTitle": "从收藏中移除",
  "favorites.reorder": "重新排序 {name}",
  "favorites.reorderTitle": "拖动以排序（或 Alt + 方向键）",
  "favorites.rename": "重命名 {name}",
  "favorites.renameTitle": "给这个项目起个别名",
  "favorites.remove": "移除",
  "favorites.label": "项目别名",
  "favorites.editHint": "回车保存 · Esc 取消",
  "favorites.filterHint": "清除筛选后才能排序 —— 列表不完整时无法得知完整顺序。",
  "favorites.error.unpin": "无法取消固定该项目",
  "favorites.error.pin": "无法固定该项目",
  "favorites.error.rename": "无法重命名该收藏",
  "favorites.error.reorder": "无法重新排序收藏",
  "favorites.a11y.instructions":
    "要用键盘排序，请聚焦项目手柄并按空格或回车。用方向键选择新位置，再次按空格或回车放下，或按 Escape 取消。按住 Alt 配合方向键可直接移动项目，无需进入拖动模式。",
  "favorites.a11y.start": "正在重新排序 {name}，位置 {index} / {total}。",
  "favorites.a11y.over": "将放置在第 {index} / {total} 位。",
  "favorites.a11y.outside": "在列表之外。",
  "favorites.a11y.end": "{name} 已移动到第 {index} 位。",
  "favorites.a11y.unchanged": "顺序没有变化。",
  "favorites.a11y.cancel": "{name} 的重新排序已取消。",

  "time.now": "刚刚",
  "time.minutesAgo": "{count} 分钟前",
  "time.hoursAgo": "{count} 小时前",
  "time.yesterday": "昨天",
  "time.daysAgo": "{count} 天前",

  /* ---------------------------------------------------------------- */
  /* 意图执行                                                          */
  /* ---------------------------------------------------------------- */
  "exec.cherryPick.done": "Cherry-pick 已应用",
  "exec.merge.done": "Merge 完成",
  "exec.rebase.done": "Rebase 完成",
  "exec.deleteLocal.done": "分支已删除",
  "exec.deleteRemote.done": "远程分支已删除",
  "exec.unknownRoute": "未知路由",
  "exec.unknownRoute.body": "该意图请求了 {endpoint}，但没有映射的执行方式。",

  /* ---------------------------------------------------------------- */
  /* 拖放播报                                                          */
  /* ---------------------------------------------------------------- */
  "dnd.entity.commit": "提交",
  "dnd.entity.branch": "分支",
  "dnd.entity.remoteBranch": "远程分支",
  "dnd.entity.tag": "标签",
  "dnd.entity.stash": "储藏",
  "dnd.entity.item": "项目",
  "dnd.zone.branch": "分支",
  "dnd.zone.remoteBranch": "远程分支",
  "dnd.zone.commit": "提交",
  "dnd.zone.tag": "标签",
  "dnd.zone.trash": "回收站",
  "dnd.zone.target": "目标",
  "dnd.a11y.instructions":
    "要用键盘拖动，请在项目获得焦点时按空格或回车。用方向键在各目标间移动；每到一个目标，引擎都会播报该操作是否被接受。再次按空格或回车放下，或按 Escape 取消。放下不会执行任何操作：会有对话框请求确认。",
  "dnd.a11y.dragging": "正在拖动{what}。",
  "dnd.a11y.outside": "{what}不在任何目标上。",
  "dnd.a11y.overAccepts": "位于{where}上方。已接受：{title}。",
  "dnd.a11y.overRejects": "位于{where}上方。已拒绝：{reason}",
  "dnd.a11y.droppedOutside": "{what}被放在目标之外。什么也没做。",
  "dnd.a11y.dropped": "{what}已放到{where}上。请在对话框中确认该操作。",
  "dnd.a11y.refused": "操作被拒绝：{reason}",
  "dnd.a11y.cancelled": "{what}的拖动已取消。",
  "dnd.a11y.cancelledPlain": "拖动已取消。",
  "dnd.chip.no": "否",

  /* ---------------------------------------------------------------- */
  /* 意图引擎                                                          */
  /* ---------------------------------------------------------------- */
  "intent.invalid.title": "不允许的移动",
  "intent.sameRef.title": "同一个引用",
  "intent.sameRef": "源和目标是同一个引用（{label}）。",
  "intent.tag.noDrag": "标签不能通过拖动移动：移动标签 {label} 需要重新创建它。请使用标签对话框。",
  "intent.stash.noDrag": "储藏不能通过拖动应用。请在侧栏中对 {label} 使用应用或丢弃。",
  "intent.unknownSource": "意图引擎无法识别的来源类型。",
  "intent.unknownTarget.commit": "提交的目标未知。",
  "intent.unknownTarget.branch": "分支的目标未知。",
  "intent.unknownTarget.remoteBranch": "远程分支的目标未知。",

  "intent.commit.toCommit": "两个提交不构成一次操作。把提交拖到分支上即可执行 cherry-pick。",
  "intent.commit.toRemote":
    "提交不能直接应用到远程分支上。请先在本地分支上 cherry-pick，然后 push 到 {label}。",
  "intent.commit.toTag": "标签指向提交，它不接收提交。请从标签对话框创建新标签。",
  "intent.commit.toTrash": "提交不能通过拖动删除。请从提交菜单使用 reset 或 revert。",

  "intent.branchBusy.title": "分支被其他工作树占用",
  "intent.cherryPick.busy":
    "分支 {branch} 已在工作树 {worktree} 中检出。cherry-pick 需要它成为 HEAD；请先切换工作树。",
  "intent.cherryPick.onHead":
    "把提交 {hash}{subject} 应用到 {branch}，也就是当前分支。会创建一个新提交；什么都不会被重写。",
  "intent.cherryPick.offHead":
    "把提交 {hash}{subject} 应用到 {branch}。由于 {branch} 不是当前分支，后端会先执行 checkout —— 这正是 “onto” 字段的用途。会创建一个新提交；什么都不会被重写。",
  "intent.cherryPick.label": "Cherry-pick 到 {branch}",
  "intent.cherryPick.title": "Cherry-pick 到 {branch}",

  "intent.branch.toRemote":
    "把本地分支拖到远程分支上相当于 push，而 push 需要远程、上游和 force-with-lease。请用 Push 对话框发送 {label}。",
  "intent.branch.toCommit":
    "把 {label} 移到另一个提交上是 git reset，会丢弃工作。请从提交菜单操作，而不是拖动。",
  "intent.branch.toTag": "分支不会因拖动而变成标签。请从标签对话框创建标签。",

  "intent.integrate.busy":
    "分支 {branch} 已在工作树 {worktree} 中检出。merge 和 rebase 都需要它作为 HEAD；请先切换工作树。",
  "intent.integrate.checkoutNote":
    " 由于 {into} 不是当前分支，后端会先执行 checkout —— 这正是 “into” 字段的用途。",
  "intent.merge.label": "把 {from} 合并到 {into}",
  "intent.merge.description":
    "把 {from} 的提交带到 {into}，并创建一个合并提交。不会重写任何历史。{checkoutNote}",
  "intent.rebase.label": "把 {from} 变基到 {into} 之上",
  "intent.rebase.description":
    "会重写 {from}：{from} 中尚未进入 {into} 的提交将被逐个重新应用到 {into} 之上。{into} 不会改变，也不会收到任何东西。{upstreamNote}",
  "intent.rebase.upstreamNote":
    " {name} 跟踪 {upstream}{gap}：变基之后 push 将需要 --force-with-lease。",
  "intent.rebase.upstreamGap": "（领先 {ahead}，落后 {behind}）",
  "intent.integrate.title": "{from} 到 {into}",
  "intent.integrate.description":
    "选择如何把 {from} 集成到 {into}。merge 保留两者的历史；rebase 会重写 {from}。{tail}",
  "intent.integrate.noRebaseRemote":
    " rebase 不在列表中：{from} 是远程分支，无法从这里重写 —— 要把 {into} 重写到它之上，请使用带 rebase 的 Pull。",
  "intent.integrate.noRebaseBusy":
    " rebase 不在列表中：{from} 已在工作树 {worktree} 中检出，而它需要成为 HEAD。",

  "intent.delete.currentBranch.title": "当前分支",
  "intent.delete.currentBranch": "{name} 是当前分支，git 不会删除你正处在的分支。请先切换分支。",
  "intent.delete.busy":
    "{name} 已在工作树 {worktree} 中检出。git 不会删除在任何工作树中被检出的分支。",
  "intent.delete.local.description":
    "移除本地分支 {name}。只存在于它上面的提交将无法到达。远程不受影响。",
  "intent.delete.local.title": "删除分支 {name}",
  "intent.delete.local.label": "删除 {name}",

  "intent.remote.toRemote": "两个远程分支不构成本地操作。请先把其中一个带到本地分支上。",
  "intent.remote.toCommit": "远程分支不能从这里移动到某个提交：在服务器上移动引用的是 push。",
  "intent.remote.toTag": "远程分支不会因拖动而变成标签。请从标签对话框创建标签。",
  "intent.remote.noRemote": "无法判断 {label} 属于哪个远程。请从远程分支对话框删除它。",
  "intent.delete.remote.description":
    "在服务器 {remote} 上删除分支 {name}。所有使用该远程的人都会失去这个引用；这无法用本地命令撤销。",
  "intent.delete.remote.title": "在服务器上删除 {remote}/{name}",
  "intent.delete.remote.label": "删除 {remote}/{name}",

  /* ---------------------------------------------------------------- */
  /* 右键菜单                                                          */
  /* ---------------------------------------------------------------- */
  "menu.reveal": "把 View Tree 带到这里",
  "menu.copyName": "复制名称",
  "menu.copyPath": "复制路径",
  "menu.copyFileName": "复制文件名",

  "menu.hint.current": "当前",
  "menu.hint.isCurrent": "就是当前分支",
  "menu.hint.detached": "detached",
  "menu.hint.chdir": "process.chdir",

  "menu.commit.squashSelected": "压缩这 {count} 个提交",
  "menu.commit.cherryPickSelected": "把这 {count} 个 cherry-pick 到当前分支",
  "menu.commit.copyHashes": "复制这些哈希",
  "menu.commit.clearSelection": "清除选区",
  "menu.commit.checkout": "检出此提交",
  "menu.commit.createBranch": "在此创建分支",
  "menu.commit.createTag": "在此创建标签",
  "menu.commit.cherryPick": "Cherry-pick 到当前分支",
  "menu.commit.revert": "还原",
  "menu.commit.reset": "把当前分支重置到这里",
  "menu.commit.copyHash": "复制哈希",
  "menu.commit.copySubject": "复制标题",

  "menu.branch.mergeInto": "合并到 {branch}",
  "menu.branch.rebaseOnto": "把 {branch} 变基到此分支之上",
  "menu.branch.createFrom": "以此创建分支",
  "menu.remoteBranch.checkoutExisting": "检出 {name}",
  "menu.remoteBranch.checkoutNew": "检出（创建跟踪它的本地分支）",
  "menu.tag.createBranch": "以该标签创建分支",

  "menu.remote.fetch": "从此远程执行 Fetch --prune",
  "menu.remote.copyFetchUrl": "复制 fetch 地址",
  "menu.remote.browse": "在浏览器中打开",
  "menu.stash.copyMessage": "复制该信息",
  "menu.worktree.switch": "切换到此工作树",

  "menu.file.view": "在查看器中查看",
  "menu.commitFile.view": "在此提交中查看",
  "menu.commitFile.viewWorking": "查看工作区的版本",

  "menu.viewer.copySelection": "复制所选内容",
  "menu.viewer.nothingSelected": "未选中任何内容",
  "menu.viewer.chars": "{count} 字符",
  "menu.viewer.copySourceHash": "复制来源哈希",
  "menu.viewer.viewMode": "以{mode}查看",
  "menu.viewer.openWorking": "打开工作区的版本",

  /* ---------------------------------------------------------------- */
  /* 剪贴板                                                            */
  /* ---------------------------------------------------------------- */
  "copy.hash": "哈希已复制",
  "copy.hashes": "哈希已复制",
  "copy.subject": "标题已复制",
  "copy.name": "名称已复制",
  "copy.path": "路径已复制",
  "copy.url": "地址已复制",
  "copy.message": "信息已复制",
  "copy.selection": "所选内容已复制",
  "copy.failed": "无法复制：{label}",
  "copy.failed.body": "浏览器拒绝了剪贴板访问。",

  /* ---------------------------------------------------------------- */
  /* 操作                                                              */
  /* ---------------------------------------------------------------- */
  "action.fetchRemote.op": "Fetch {remote}",
  "action.fetchRemote.done": "从 {remote} 的 Fetch 完成",

  "action.detached.title": "HEAD detached",
  "action.merge.detached.body": "没有当前分支来接收这次合并。请先检出一个分支。",
  "action.merge.title": "把 {source} 合并到 {target}",
  "action.merge.description":
    "把 {source} 的提交带到 {target}。不会重写任何历史；如果有分叉，就会产生一个合并提交。",
  "action.merge.confirm": "合并",
  "action.merge.noFf.hint": "即使可以快进也创建合并提交",
  "action.merge.squash.hint": "只把内容合并到 index，不提交也不记录这次合并",
  "action.merge.op": "Merge",
  "action.merge.done": "{source} 已合并到 {target}",

  "action.rebase.detached.body": "变基需要一个当前分支来重写。请先检出一个分支。",
  "action.rebase.title": "把 {branch} 变基到 {onto}",
  "action.rebase.description":
    "会重写 {branch}：它有而 {onto} 没有的提交将被逐个重新应用到 {onto} 之上。{onto} 不会改变。如果 {branch} 已经发布过，下一次 push 将需要 --force-with-lease。",
  "action.rebase.confirm": "变基",
  "action.rebase.op": "Rebase",
  "action.rebase.done": "{branch} 已变基到 {onto}",

  "action.checkoutCommit.title": "检出 {hash}",
  "action.checkoutCommit.description":
    "把工作区带到 {what}，并进入 HEAD DETACHED 状态：从这里提交的内容不会有任何分支跟随。要返回，请检出一个分支；要留下，请在此处创建一个分支。",
  "action.checkoutCommit.done": "已在 {hash} 处 detached",

  "action.cherryPick.title_one": "Cherry-pick {hash}",
  "action.cherryPick.title_other": "Cherry-pick {count} 个提交",
  "action.cherryPick.description":
    "把 {what} 应用到 {target} 之上。会创建带有新哈希的新提交；不会重写任何内容。后端会先从最旧到最新重新排序再应用。",
  "action.cherryPick.what_one": "{subject}",
  "action.cherryPick.what_other": "选中的这 {count} 个提交",
  "action.cherryPick.currentHead": "当前 HEAD",
  "action.cherryPick.confirm": "Cherry-pick",
  "action.cherryPick.noCommit.hint": "只应用到 index 就停止，不创建提交",
  "action.cherryPick.op": "Cherry-pick",
  "action.cherryPick.done": "Cherry-pick 完成",

  "action.revert.title": "还原 {hash}",
  "action.revert.description":
    "创建一个撤销 {what} 的新提交。原提交仍留在历史中 —— 不会重写任何内容。",
  "action.revert.confirm": "还原",
  "action.revert.noCommit.hint": "只在 index 中撤销就停止，不创建提交",
  "action.revert.op": "Revert",
  "action.revert.done": "{hash} 已还原",

  "action.reset.title": "把 {branch} 重置到 {hash}",
  "action.reset.description":
    "把 {branch} 移动到 {hash}。落在后面的提交将无法再从此分支到达。使用 --hard 时，工作区的更改也会一并消失，且无法撤销。",
  "action.reset.confirm": "重置",
  "action.reset.field.mode": "模式",
  "action.reset.mode.soft": "--soft —— 移动分支；index 和工作区不变",
  "action.reset.mode.mixed": "--mixed —— 移动分支并清空 index；工作区不变",
  "action.reset.mode.hard": "--hard —— 移动一切并丢弃工作区",
  "action.reset.op": "Reset",
  "action.reset.done": "已 Reset --{mode} 到 {hash}",
  "action.reset.head": "HEAD",

  "action.discard.title_one": "丢弃 {path}",
  "action.discard.title_other": "丢弃 {count} 个文件",
  "action.discard.description_one":
    "把该文件恢复到最后一次提交的状态。尚未提交的内容会丢失，git 不会为此保留任何副本。",
  "action.discard.description_other":
    "把这些文件恢复到最后一次提交的状态。尚未提交的内容会丢失，git 不会为此保留任何副本。",
  "action.discard.confirm": "丢弃",

  "graph.copyHash": "复制完整哈希",
  "graph.copyHash.aria": "复制哈希 {hash}",
  "graph.copyHash.failed": "无法复制哈希",
  "graph.tooltip.files_one": "变更了 {count} 个文件",
  "graph.tooltip.files_other": "变更了 {count} 个文件",
  "argv.name": "<名称>",
  "argv.newName": "<新名称>",
  "argv.url": "<url>",
  "argv.path": "<路径>",

  /* ---- 语音与文字智能体 ---- */
  "agent.button.aria": "对智能体说出命令",
  "agent.state.idle": "按住说话",
  "agent.state.recording": "正在聆听…",
  "agent.state.transcribing": "正在转写…",
  "agent.state.running": "正在执行…",
  "agent.heard": "你说了",
  "agent.typed": "你要求",
  "agent.placeholder": "告诉我你想在仓库里做什么…",
  "agent.send": "发送",
  "agent.stop": "停止",
  "agent.close": "关闭",
  "agent.commands": "已执行的命令",
  "agent.done": "完成",
  "agent.failed": "智能体已停止",
  "agent.cost": "本次会话花费：US$ {cost}",
  "agent.empty": "没有听清音频内容，请再试一次。",
  "agent.busy": "智能体已经在工作了。",
  "agent.micDenied": "浏览器未授予麦克风权限。",
  "agent.micMissing": "此浏览器没有可用的麦克风。",
  "agent.noKey": "缺少 OpenRouter 密钥。",
  "agent.noKey.hint": "请设置 OPENROUTER_API_KEY，或在设置中保存密钥。",
  "agent.piDownload": "首次运行会下载 pi — 需要稍等片刻。",

  /* ---- AI 区域已锁定：缺少 OpenRouter 密钥 ---- */
  "ai.locked.title": "AI 功能已锁定",
  "ai.locked.body": "服务器没有找到 OpenRouter 密钥。在这里粘贴一把即可解锁代理。",
  "ai.locked.placeholder": "sk-or-v1-…",
  "ai.locked.unlock": "解锁",
  "ai.locked.hint": "密钥直接送到服务器并只留在那里，权限为 0600。浏览器永远拿不回它。",
};
