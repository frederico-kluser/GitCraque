/**
 * Español. Los nombres de comandos de git, sus flags y la salida del propio git
 * se mantienen en inglés, tal como git los emite.
 */
import type { Messages } from "../types.ts";

export const es: Messages = {
  /* ---------------------------------------------------------------- */
  /* Común                                                             */
  /* ---------------------------------------------------------------- */
  "common.cancel": "Cancelar",
  "common.close": "Cerrar",
  "common.create": "Crear",
  "common.save": "Guardar",
  "common.add": "Añadir",
  "common.remove": "Quitar",
  "common.open": "Abrir",
  "common.retry": "reintentar",
  "common.done": "Listo",
  "common.failed": "Falló",
  "common.running": "Ejecutando…",
  "common.error": "error",
  "common.ok": "ok",
  "common.unknownError": "error desconocido",
  "common.optional": "opcional",
  "common.command": "Comando",
  "common.copyCommand": "Copiar comando",
  "common.commandCopied": "Comando copiado",
  "common.willRun": "Se ejecutará",
  "common.holdToConfirm": "Mantén pulsado el botón para confirmar. Suéltalo antes de terminar para cancelar.",
  "common.holdTo": "Mantén pulsado para {action}",
  "common.dismiss": "Descartar",
  "common.missingFromDisk": "desapareció del disco",
  "common.opened": "abierto",
  "common.binaryShort": "bin",

  /* ---------------------------------------------------------------- */
  /* Idioma                                                            */
  /* ---------------------------------------------------------------- */
  "language.label": "Idioma",
  "language.change": "Cambiar de idioma",
  "language.group": "Idioma",
  "language.switchTo": "Interfaz en {name}",
  "language.changed": "Idioma cambiado",
  "language.changedTo": "La interfaz ahora está en {name}.",

  /* ---------------------------------------------------------------- */
  /* Ajustes — idioma, tema, rutina de fetch y clave de IA             */
  /* ---------------------------------------------------------------- */
  "settings.title": "Ajustes",
  "settings.subtitle": "Tus preferencias, válidas para cualquier repositorio que abras.",
  "settings.open": "Ajustes",
  "settings.close": "Cerrar ajustes",
  "settings.theme": "Tema",
  "settings.theme.light": "Claro",
  "settings.theme.dark": "Oscuro",
  "settings.autoFetch": "Traer del remoto automáticamente",
  "settings.autoFetch.hint":
    "Ejecuta git fetch --all --prune cada cierto tiempo, en silencio. No trae nada al local: tu rama solo se mueve cuando tú lo decides. El ciclo se salta mientras haya un comando git en curso o la pestaña esté oculta.",
  "settings.autoFetch.off": "Desactivado",
  "settings.autoFetch.seconds_one": "Cada {count} segundo",
  "settings.autoFetch.seconds_other": "Cada {count} segundos",
  "settings.autoFetch.minutes_one": "Cada {count} minuto",
  "settings.autoFetch.minutes_other": "Cada {count} minutos",
  "settings.ai.title": "Funciones de IA",
  "settings.ai.hint":
    "Una sola clave de OpenRouter paga el agente. Se queda en el servidor, en ~/.config/gitcraque/openrouter.json, y nunca vuelve al navegador.",
  "settings.ai.envHint":
    "Esta clave viene del entorno del servidor. Si guardas una aquí, pasa a tener prioridad — la variable olvidada en el shell suele ser la vieja.",
  "settings.ai.absent": "sin clave",
  "settings.ai.add": "Añadir",
  "settings.ai.change": "Cambiar",
  "settings.ai.remove": "Quitar",
  "settings.ai.source.stored": "guardada",
  "settings.ai.source.env": "OPENROUTER_API_KEY",
  "settings.ai.source.envFile": "OPENROUTER_API_KEY_FILE",
  "settings.ai.source.none": "—",

  /* ---------------------------------------------------------------- */
  /* Shell                                                             */
  /* ---------------------------------------------------------------- */
  "app.fatal.title": "GitCraque no pudo abrir el repositorio",
  "app.fatal.hint": "Comprueba que el backend esté activo en {port} y que el directorio indicado exista.",
  "app.emptyRepo.title": "Repositorio sin commits",
  "app.emptyRepo.body":
    "{command} no devolvió nada. Prepara archivos en el panel de cambios y haz el primer commit — el View Tree aparece al instante.",
  "app.picker.title": "Elige un repositorio",
  "app.picker.body":
    "El servidor está en {cwd}, y allí no hay {dotgit}. Abre uno de tus repositorios abajo — o crea uno nuevo con {init} desde la pestaña Explorar.",
  "app.splitter.rail": "Ancho del rail",
  "app.splitter.detail": "Ancho del panel de detalle",
  "app.reconnecting": "Reconectando con el servidor…",

  /* ---------------------------------------------------------------- */
  /* Recuperación — RecoveryBoundary.tsx                               */
  /* ---------------------------------------------------------------- */
  "recovery.title": "La interfaz dejó de responder",
  "recovery.body":
    "Algo se rompió al dibujar la pantalla. Recargar devuelve la app a la normalidad: no se hizo nada en el repositorio.",
  "recovery.reloading": "Recargando GitCraque…",
  "recovery.reload": "Recargar ahora",

  /* ---------------------------------------------------------------- */
  /* Restos de la paleta de comandos, aun usados fuera de ella       */
  /* ---------------------------------------------------------------- */
  "commands.branch.checkout.pinned": "ocupada por {worktree}",
  "commands.remote.add": "Añadir Origin",
  "commands.theme.light": "Tema claro",
  "commands.theme.dark": "Tema oscuro",

  /* ---------------------------------------------------------------- */
  /* Barra superior                                                    */
  /* ---------------------------------------------------------------- */
  "toolbar.connection.open": "conectado",
  "toolbar.connection.connecting": "conectando",
  "toolbar.connection.reconnecting": "reconectando",
  "toolbar.connection.closed": "sin conexión",
  "toolbar.connection.title": "WebSocket {state}",
  "toolbar.project.trigger": "Cambiar de proyecto — favoritos, recientes o abrir otra carpeta",
  "toolbar.project.section": "Proyectos",
  "toolbar.project.note":
    "Abrir otro proyecto también es {chdir} en el servidor: el View Tree entero se recarga desde cero.",
  "toolbar.project.favorites": "Favoritos",
  "toolbar.project.recents": "Recientes",
  "toolbar.project.loading": "Leyendo favoritos y recientes…",
  "toolbar.project.empty":
    "Aún no hay favoritos ni recientes. Abre una carpeta con el selector de abajo y aparecerá aquí la próxima vez.",
  "toolbar.project.openOther": "Abrir otro…",
  "toolbar.head.detached": "detached en {hash}",
  "toolbar.commit.label": "Abrir cambios y hacer commit",
  "toolbar.commit.clean": "Nada que commitear",
  "toolbar.worktree.trigger": "Cambiar de worktree — el servidor hace process.chdir, sin checkout",
  "toolbar.worktree.none": "sin worktree",
  "toolbar.worktree.note":
    "Cambiar de worktree ejecuta {chdir} en el servidor. No ocurre ningún {checkout}.",
  "toolbar.worktree.emptyList": "Ningún worktree listado.",
  "toolbar.activity.label": "Actividad: {count} commits en las últimas {weeks} semanas",
  "toolbar.activity.weeks": "/{weeks} sem",
  "toolbar.pending.step": "{step} de {total}",
  "toolbar.pending.inProgress": "en curso",
  "toolbar.pending.banner": "{kind} en curso, {step}",
  "toolbar.pending.conflicts_one": "{count} conflicto",
  "toolbar.pending.conflicts_other": "{count} conflictos",
  "toolbar.pending.continue": "Continuar",
  "toolbar.pending.abort": "Abortar",
  "toolbar.action.open": "Abrir",
  "toolbar.action.open.title": "Abrir otro repositorio de esta máquina (process.chdir, sin checkout)",
  "toolbar.action.branch": "Rama",
  "toolbar.action.stash": "Stash",
  "toolbar.action.refresh": "Recargar",
  "toolbar.action.refresh.title": "Recargar (⌘R)",
  "toolbar.progress.label": "Operación en curso",
  "toolbar.progress.running": "Ejecutando comando git",
  "toolbar.ws.closed": "WebSocket cerrado — la app no está recibiendo eventos del repositorio.",
  "toolbar.ws.reconnecting": "Restableciendo la conexión con el servidor…",

  /* ---------------------------------------------------------------- */
  /* Rail                                                              */
  /* ---------------------------------------------------------------- */
  "rail.label": "Referencias del repositorio",
  "rail.chip.main": "principal",
  "rail.chip.bare": "bare",
  "rail.chip.detached": "detached",
  "rail.chip.locked": "locked",
  "rail.chip.prunable": "prunable",
  "rail.chip.active": "activo",
  "rail.chip.pinned": "ocupada",
  "rail.chip.pinnedTitle": "Activa en {worktree}",
  "rail.chip.annotated": "anotada",
  "rail.chip.lightweight": "ligera",
  "rail.chip.ssh": "ssh",
  "rail.chip.askpass": "https · askpass",
  "rail.chip.askpassTitle": "Url https: usa el trampolín GIT_ASKPASS",

  "rail.worktrees.title": "Worktrees",
  "rail.worktrees.add": "Añadir worktree",
  "rail.worktrees.prune": "Prune (limpiar registros)",
  "rail.worktrees.removeThis": "Quitar este worktree",
  "rail.worktrees.actions": "Acciones del worktree {label}",
  "rail.worktrees.empty.title": "Ningún worktree",
  "rail.worktrees.empty.body": "El servidor todavía no ha listado `git worktree list --porcelain`.",

  "rail.branches.title": "Ramas locales",
  "rail.branches.new": "Nueva rama",
  "rail.branches.actions": "Acciones de la rama {name}",
  "rail.branches.checkout": "Checkout",
  "rail.branches.pinnedIn": "Ocupada por {worktree}",
  "rail.branches.rename": "Renombrar",
  "rail.branches.tagHere": "Crear etiqueta aquí",
  "rail.branches.push": "Push de esta rama",
  "rail.branches.deleteLocal": "Borrar rama (local)",
  "rail.branches.deleteBoth": "Borrar rama (local y {remote})",
  "rail.branches.deleteAll": "Borrar todo (worktree, cambios, local y remoto)",
  "rail.branches.deleteBoth.noRemote": "no hay rama correspondiente en el remoto",
  "rail.branches.ahead": "{count} commits por delante del upstream",
  "rail.branches.behind": "{count} commits por detrás del upstream",
  "rail.branches.empty.title": "Ninguna rama local",
  "rail.branches.empty.body": "Repositorio sin commits o sin refs en refs/heads.",
  "rail.branches.empty.action": "Crear la primera",

  "rail.remotes.title": "Remotos",
  "rail.remotes.actions": "Acciones del remoto {name}",
  "rail.remotes.branchActions": "Acciones de {name}",
  "rail.remotes.editUrl": "Editar url",
  "rail.remotes.push": "Push a este remoto",
  "rail.remotes.removeRemote": "Quitar remoto",
  "rail.remotes.createLocal": "Crear rama local desde aquí",
  "rail.remotes.deleteRemote": "Borrar rama (Origin)",
  "rail.remotes.noBranches": "Ninguna rama remota conocida.",
  "rail.remotes.empty.title": "Ningún remoto",
  "rail.remotes.empty.body":
    "`git remote -v` no devolvió nada. Añade un origin para poder hacer fetch y push.",

  "rail.tags.title": "Etiquetas",
  "rail.tags.create": "Crear etiqueta",
  "rail.tags.actions": "Acciones de la etiqueta {name}",
  "rail.tags.delete": "Borrar etiqueta",
  "rail.tags.empty.title": "Ninguna etiqueta",
  "rail.tags.empty.body": "Marca una versión a partir de un commit o de una rama.",

  "rail.stashes.title": "Stashes",
  "rail.stashes.push": "Guardar cambios",
  "rail.stashes.pushTitle": "Guardar cambios (stash push)",
  "rail.stashes.actions": "Acciones de {ref}",
  "rail.stashes.apply": "Aplicar (lo mantiene en la pila)",
  "rail.stashes.pop": "Pop (aplica y quita)",
  "rail.stashes.drop": "Descartar",
  "rail.stashes.empty.title": "Pila vacía",
  "rail.stashes.empty.body": "Nada guardado con `git stash`.",

  "parts.actions": "Acciones",

  /* ---------------------------------------------------------------- */
  /* Estado de archivo                                                 */
  /* ---------------------------------------------------------------- */
  "status.added": "añadido",
  "status.modified": "modificado",
  "status.deleted": "borrado",
  "status.renamed": "renombrado",
  "status.copied": "copiado",
  "status.typechange": "tipo cambiado",
  "status.unmerged": "conflicto",
  "status.untracked": "sin seguimiento",
  "status.unknown": "desconocido",

  /* ---------------------------------------------------------------- */
  /* Columna derecha                                                   */
  /* ---------------------------------------------------------------- */
  "side.label": "Detalle del commit",

  /* ---------------------------------------------------------------- */
  /* Vista del archivo                                                 */
  /* ---------------------------------------------------------------- */
  "view.label": "Archivo abierto",
  "view.back.detail": "Detalle",
  "view.back.changes": "Cambios",
  "view.back.blame": "Blame",

  /* Blame */
  "blame.label": "Blame de {path}",
  "blame.header.hash": "Commit",
  "blame.header.author": "Autor",
  "blame.header.date": "Fecha",
  "blame.header.line": "Línea",
  "blame.header.content": "Contenido",
  "blame.empty.title": "Archivo vacío",
  "blame.empty.body": "No hay nada que culpar en un archivo vacío.",
  "blame.error.title": "No se pudo ejecutar blame",
  "blame.loading": "Cargando blame…",
  "blame.close": "Cerrar blame y volver",
  "blame.tooltip": "{hash} — {summary}\n{author} <{email}> el {date}",

  /* ---------------------------------------------------------------- */
  /* Cambios y commit                                                  */
  /* ---------------------------------------------------------------- */
  "changes.label": "Cambios del árbol de trabajo",
  "changes.sheet.label": "Cambios y commit",
  "changes.sheet.title": "Cambios",
  "changes.sheet.close": "Cerrar cambios",
  "changes.group.conflicted": "Conflictos",
  "changes.group.staged": "Preparados",
  "changes.group.untracked": "Sin seguimiento",
  "changes.group.modified": "Modificados",
  "changes.stage": "Preparar",
  "changes.unstage": "Quitar del stage",
  "changes.discard": "Descartar",
  "changes.stageFile": "Preparar {path}",
  "changes.unstageFile": "Quitar {path} del stage",
  "changes.discardFile": "Descartar {path}",
  "changes.stageAll": "Preparar todo",
  "changes.unstageAll": "Quitar todo del stage",
  "changes.viewFile": "Ver {path} en el visor",
  "changes.hold": "mantén",
  "changes.filesChanged_one": "{count} archivo cambiado",
  "changes.filesChanged_other": "{count} archivos cambiados",
  "changes.staged_one": "{count} archivo preparado",
  "changes.staged_other": "{count} archivos preparados",
  "changes.conflictsLeft_one": "{count} conflicto por resolver",
  "changes.conflictsLeft_other": "{count} conflictos por resolver",
  "changes.clean.title": "Árbol de trabajo limpio",
  "changes.clean.body":
    "Nada que preparar. Cambia un archivo y aparecerá aquí en cuanto el watcher de .git lo avise.",
  "commit.placeholder": "Mensaje del commit",
  "commit.placeholder.amend": "Nuevo mensaje (vacío mantiene el original)",
  "commit.subjectCounter": "Primera línea: {length} de {limit} caracteres recomendados",
  "commit.subjectTooLong":
    "La primera línea superó los {limit} caracteres — es el asunto del commit.",
  "commit.button": "Commit",
  "commit.button.loading": "Haciendo commit…",
  "commit.button.ok": "Commit hecho",
  "commit.button.error": "Falló",
  "commit.button.label": "Crear commit",

  /* ---------------------------------------------------------------- */
  /* Detalle del commit                                                */
  /* ---------------------------------------------------------------- */
  "detail.label": "Detalle del commit",
  "detail.selectionLabel": "Resumen de la selección",
  "detail.empty.title": "Ningún commit seleccionado",
  "detail.empty.body":
    "Haz clic en un commit del View Tree. Mantén ⇧ para marcar un intervalo y habilitar el squash.",
  "detail.error.title": "No se pudo leer el commit",
  "detail.author": "autor",
  "detail.committer": "committer",
  "detail.parent": "padre",
  "detail.parents": "padres",
  "detail.goTo": "Ir a {hash}",
  "detail.copyHash": "Copiar el hash completo",
  "detail.hashCopied": "Hash copiado",
  "detail.files": "Archivos",
  "detail.files.hint": "haz clic para ver el diff abajo",
  "detail.files.empty.title": "Ningún archivo",
  "detail.files.empty.body": "El commit no cambió archivos.",
  "detail.viewFile": "Ver {path} en el visor",
  "detail.fileCount_one": "{count} archivo",
  "detail.fileCount_other": "{count} archivos",
  "detail.working.title": "Cambios sin confirmar",
  "detail.working.hint": "haz clic para ver el diff",
  "detail.working.stage": "Preparar y confirmar",

  "selection.title": "Selección",
  "selection.count_one": "{count} commit",
  "selection.count_other": "{count} commits",
  "selection.range": "Alcance",
  "selection.newest": "más nuevo",
  "selection.oldest": "más antiguo",
  "selection.squash": "Squash",
  "selection.squash.body":
    "Une los {count} commits en uno solo con {command}, vía {editor}. El más antiguo sigue siendo {pick}; los demás pasan a {squash}.",
  "selection.squash.button_one": "Squash de {count} commit",
  "selection.squash.button_other": "Squash de {count} commits",

  /* ---------------------------------------------------------------- */
  /* Grafo                                                             */
  /* ---------------------------------------------------------------- */
  "graph.label": "Historial de commits",
  "graph.column.graph": "Grafo",
  "graph.column.description": "Descripción",
  "graph.column.author": "Autor",
  "graph.column.date": "Fecha",
  "graph.column.hash": "Hash",
  "graph.empty.title": "Ningún commit que dibujar",
  "graph.empty.body":
    "Este repositorio aún no tiene historial. Haz el primer commit y el View Tree aparecerá aquí.",
  "graph.refChip.hint":
    "{ref} — doble clic cambia a esta rama; arrástrala sobre otra para hacer merge o rebase",

  /* ---------------------------------------------------------------- */
  /* Visor de archivos                                                 */
  /* ---------------------------------------------------------------- */
  "viewer.label": "Visor de {path}",
  "viewer.mode.diff": "Diff",
  "viewer.mode.markdown": "Formateado",
  "viewer.mode.raw": "Crudo",
  "viewer.mode.aria": "Modo de visualización del archivo",
  "viewer.workingTree": "working tree",
  "viewer.workingTreeTitle": "archivo del árbol de trabajo",
  "viewer.copyPath": "Copiar la ruta del archivo",
  "viewer.pathCopied": "Ruta copiada",
  "viewer.close": "Cerrar el visor",
  "viewer.empty.title": "Ningún archivo abierto",
  "viewer.empty.body":
    "Elige un archivo en el detalle del commit o en el panel de cambios. Aparecerá aquí en diff, formateado (cuando sea markdown) y crudo.",
  "viewer.error.patch": "No se pudo leer el patch",
  "viewer.error.file": "No se pudo leer el archivo",
  "viewer.summary.lines_one": "{count} línea · {size}",
  "viewer.summary.lines_other": "{count} líneas · {size}",

  "diff.noChanges.title": "Sin cambios en este commit",
  "diff.noChanges.body":
    "{path} no se tocó aquí — el contenido está en las pestañas Crudo y Formateado.",
  "diff.binary.title": "Archivo binario",
  "diff.binary.body": "Git no genera patch de texto para {path}.",
  "diff.emptyPatch.title": "Patch vacío",
  "diff.emptyPatch.body":
    "Ningún fragmento cambió — git registró el cambio sin tocar el contenido (modo, renombrado).",
  "diff.renamedFrom": "renombrado desde {path}",

  "raw.binary.title": "Archivo binario",
  "raw.binary.body": "{size} — nada que renderizar como texto.",
  "raw.truncated.title": "Archivo cortado",
  "raw.truncated.body": "El backend envió solo el inicio del blob ({size} en total).",
  "raw.empty.title": "Archivo vacío",
  "raw.empty.body": "Cero bytes.",

  "markdown.error.title": "No se pudo renderizar con seguridad",
  "markdown.truncated.title": "Documento cortado",
  "markdown.truncated.body":
    "El backend envió solo el inicio del archivo — el final del markdown no está aquí.",
  "markdown.empty.title": "Archivo vacío",
  "markdown.empty.body": "Nada que formatear.",
  "markdown.linkRefused": "enlace rechazado (esquema {scheme})",
  "markdown.relativeLink": "ruta relativa al repositorio — no resuelta: {href}",
  "markdown.unknownScheme": "desconocido",
  "markdown.image": "imagen",
  "markdown.imageUnresolved": "· imagen no resuelta",
  "sanitize.noDom":
    "DOMPurify no tiene DOM disponible — el markdown no puede mostrarse con seguridad",

  /* ---------------------------------------------------------------- */
  /* Pie de diagnóstico                                                */
  /* ---------------------------------------------------------------- */
  "footer.cwd": "process.cwd() del servidor",
  "footer.gitVersion": "Versión del binario de git",
  "footer.commits": "Commits cargados / alcanzables por --all",
  "footer.commitsSuffix": "commits",
  "footer.elapsed": "Tiempo del último `git log`",
  "footer.websocket": "WebSocket",

  /* ---------------------------------------------------------------- */
  /* Confirmaciones                                                    */
  /* ---------------------------------------------------------------- */
  "confirm.close": "Cerrar",

  /* ---------------------------------------------------------------- */
  /* Acciones de los paneles                                           */
  /* ---------------------------------------------------------------- */
  "action.fetch": "Fetch",
  "action.fetch.done": "Fetch completado",
  "action.pull": "Pull",
  "action.pull.done": "Pull completado",
  "action.pullRebase": "Pull --rebase",
  "action.pullRebase.done": "Pull --rebase completado",

  "action.push.noRemote.title": "Ningún remoto configurado",
  "action.push.noRemote.body": "Añade un origin antes de hacer push.",
  "action.push.title": "Push",
  "action.push.description": "Envía {branch} al remoto elegido.",
  "action.push.currentBranch": "la rama actual",
  "action.push.confirm": "Push",
  "action.push.done": "Push completado",
  "action.push.field.remote": "Remoto",
  "action.push.field.branch": "Rama",
  "action.push.field.branch.placeholder": "rama a enviar",
  "action.push.field.setUpstream.hint": "guarda el upstream de la rama",
  "action.push.field.tags.hint": "envía también las etiquetas",
  "action.push.field.force.hint": "reescribe el remoto; úsalo solo tras rebase/squash",

  "action.branch.new": "Nueva rama",
  "action.branch.new.from": "Crea una rama a partir de {ref}.",
  "action.branch.new.fromHead": "Crea una rama a partir del HEAD actual.",
  "action.branch.new.namePlaceholder": "feature/mi-rama",
  "action.branch.field.name": "Nombre",
  "action.branch.field.startPoint": "Punto de partida",
  "action.branch.field.checkout": "Hacer checkout después",
  "action.branch.create": "Crear rama",
  "action.branch.created": "Rama {name} creada",
  "action.checkout": "Checkout",
  "action.checkout.done": "En {ref}",
  "action.checkout.tracking": "En {branch}, siguiendo {remote}",
  "action.checkout.already": "Ya estás en {name}",
  "action.checkout.inUse": "{name} está en uso",
  "action.checkout.inUse.body":
    "La rama está activa en el worktree {worktree}. Haz clic en él en Worktrees para ir allí — cambiar de worktree no hace checkout.",

  "action.branch.rename.title": "Renombrar {name}",
  "action.branch.rename.description":
    "Renombra la rama local. El upstream sigue apuntando al mismo remoto.",
  "action.branch.rename.confirm": "Renombrar",
  "action.branch.rename.field": "Nuevo nombre",
  "action.branch.rename.op": "Renombrar rama",

  "action.branch.deleteLocal.title": "Borrar rama (local)",
  "action.branch.deleteLocal.description":
    "Borra la rama local {name}. Los commits alcanzables solo desde ella quedan huérfanos.",
  "action.branch.deleteLocal.confirm": "Borrar local",
  "action.branch.deleteLocal.force": "-D (forzar aunque no esté fusionada)",
  "action.branch.deleteLocal.force.hint": "usa -D en lugar de -d",
  "action.branch.deleteLocal.op": "Borrar rama local",
  "action.branch.deleteLocal.done": "Rama {name} borrada",

  "action.branch.deleteRemote.title": "Borrar rama (Origin)",
  "action.branch.deleteRemote.description":
    "Borra {name} en {remote}. La operación afecta a todos los que usan el repositorio.",
  "action.branch.deleteRemote.confirm": "Borrar en {remote}",
  "action.branch.deleteRemote.op": "Borrar rama remota",
  "action.branch.deleteRemote.done": "{remote}/{name} borrada",

  "action.branch.deleteBoth.title": "Borrar rama (local y {remote})",
  "action.branch.deleteBoth.description":
    "Borra {name} aquí y en {remote}, en una sola operación. Si no hay nada en {remote}, solo se borra el lado local.",
  "action.branch.deleteBoth.confirm": "Borrar en los dos lados",
  "action.branch.deleteBoth.op": "Borrar rama local y remota",
  "action.branch.deleteBoth.done": "{name} borrada aquí y en {remote}",
  "action.branch.deleteBoth.doneLocalOnly": "{name} borrada — no había nada en {remote}",

  "action.branch.deleteAll.title": "Borrar todo de {name}",
  "action.branch.deleteAll.description":
    "Quita el worktree que retiene {name}, tira su código sin confirmar y borra la rama local.",
  "action.branch.deleteAll.description.withRemote":
    "Quita el worktree que retiene {name}, tira su código sin confirmar y borra la rama local y en {remote}.",
  "action.branch.deleteAll.pinned": "El worktree {worktree} será eliminado del disco.",
  "action.branch.deleteAll.pinnedMain":
    "La rama está en el worktree principal: no se puede quitar, así que se suelta el HEAD y se descartan los cambios sin confirmar.",
  "action.branch.deleteAll.confirm": "Borrar todo",
  "action.branch.deleteAll.op": "Borrar rama, worktree y cambios",
  "action.branch.deleteAll.done": "{name} borrada junto con su worktree y sus cambios",

  "action.tag.new": "Nueva etiqueta",
  "action.tag.new.at": "Crea una etiqueta en {ref}.",
  "action.tag.new.atHead": "Crea una etiqueta en el HEAD actual.",
  "action.tag.confirm": "Crear etiqueta",
  "action.tag.field.name": "Nombre",
  "action.tag.field.target": "Objetivo",
  "action.tag.field.message": "Mensaje (hace la etiqueta anotada)",
  "action.tag.op": "Crear etiqueta",
  "action.tag.delete.title": "Borrar la etiqueta {name}",
  "action.tag.delete.description": "Borra la etiqueta local; opcionalmente también en el remoto.",
  "action.tag.delete.confirm": "Borrar etiqueta",
  "action.tag.delete.field": "Borrar también en",
  "action.tag.delete.localOnly": "solo local",
  "action.tag.delete.op": "Borrar etiqueta",

  "action.remote.add.title": "Añadir Origin",
  "action.remote.add.description":
    "Registra un remoto nuevo. Una url https usa el trampolín de credenciales (GIT_ASKPASS).",
  "action.remote.add.confirm": "Añadir",
  "action.remote.field.name": "Nombre",
  "action.remote.field.url": "Url",
  "action.remote.add.op": "Añadir remoto",
  "action.remote.url.title": "Url de {name}",
  "action.remote.url.description":
    "Cambia la url del remoto. Marca para cambiar solo la url de push.",
  "action.remote.url.confirm": "Guardar url",
  "action.remote.url.pushOnly": "--push (solo la url de push)",
  "action.remote.url.op": "Cambiar url del remoto",
  "action.remote.remove.title": "Quitar el remoto {name}",
  "action.remote.remove.description":
    "Borra el remoto y todas las refs remotas de {name} del repositorio local.",
  "action.remote.remove.confirm": "Quitar remoto",
  "action.remote.remove.op": "Quitar remoto",

  "action.worktree.add.title": "Añadir worktree",
  "action.worktree.add.description":
    "Crea un directorio de trabajo nuevo enlazado a este repositorio.",
  "action.worktree.add.confirm": "Añadir",
  "action.worktree.field.path": "Ruta",
  "action.worktree.field.path.placeholder": "/ruta/al/nuevo-worktree",
  "action.worktree.field.newBranch": "Crear rama (-b)",
  "action.worktree.field.ref": "A partir de",
  "action.worktree.add.op": "Añadir worktree",
  "action.worktree.remove.title": "Quitar el worktree {label}",
  "action.worktree.remove.description":
    "Da de baja {path}. El directorio sale del disco si git consigue borrarlo.",
  "action.worktree.remove.confirm": "Quitar worktree",
  "action.worktree.remove.force.hint": "lo quita incluso con cambios pendientes",
  "action.worktree.remove.op": "Quitar worktree",
  "action.worktree.prune.title": "Prune de worktrees",
  "action.worktree.prune.description":
    "Quita el registro de los worktrees cuyo directorio ya no existe.",
  "action.worktree.prune.confirm": "Hacer prune",
  "action.worktree.prune.op": "Prune de worktrees",

  "action.stash.title": "Stash",
  "action.stash.description": "Guarda los cambios del árbol de trabajo en una pila.",
  "action.stash.confirm": "Guardar",
  "action.stash.field.message": "Mensaje",
  "action.stash.field.untracked": "-u (incluir los que no tienen seguimiento)",
  "action.stash.apply.op": "Aplicar stash",
  "action.stash.pop.title": "Pop de {ref}",
  "action.stash.pop.description":
    "Aplica el stash y lo quita de la pila. Si hay conflicto, el stash desaparece igualmente.",
  "action.stash.pop.confirm": "Pop",
  "action.stash.pop.op": "Pop del stash",
  "action.stash.drop.title": "Descartar {ref}",
  "action.stash.drop.description": "Borra el stash. No hay deshacer.",
  "action.stash.drop.confirm": "Descartar stash",
  "action.stash.drop.op": "Descartar stash",

  "action.stage.op": "Preparar",
  "action.stage.done": "Preparado",
  "action.unstage.op": "Quitar del stage",
  "action.unstage.done": "Quitado del stage",
  "action.discard.op": "Descartar cambios",
  "action.discard.done": "Cambios descartados",
  "action.commit.op": "Commit",
  "action.commit.done": "Commit creado",

  "action.squash.needsTwo": "El squash necesita dos o más commits",
  "action.squash.needsTwo.body": "Selecciona un intervalo en el grafo.",
  "action.squash.title": "Squash de {count} commits",
  "action.squash.description":
    "Reescribe el historial con `git rebase -i` y GIT_SEQUENCE_EDITOR. El commit más antiguo sigue siendo `pick`; los demás pasan a `squash`.",
  "action.squash.confirm": "Squash",
  "action.squash.field.message": "Mensaje final",
  "action.squash.field.message.placeholder": "vacío concatena los originales",
  "action.squash.field.fixup": "fixup (descarta los mensajes)",
  "action.squash.done": "Squash completado",

  "action.continue.op": "Continuar {kind}",
  "action.abort.title": "Abortar {kind}",
  "action.abort.description":
    "Deshace la operación en curso y devuelve el repositorio a su estado anterior.",
  "action.abort.confirm": "Abortar",
  "action.abort.op": "Abortar {kind}",

  /* Deshacer/rehacer. El {step} viene del reflog y llega en inglés, tal como lo
   * escribió git — la misma regla que deja pasar intacto el stderr de git. */
  "action.undo": "Deshacer",
  "action.redo": "Rehacer",
  "action.undo.step": "Deshacer: {step}",
  "action.redo.step": "Rehacer: {step}",
  "action.undo.nothing": "Nada que deshacer",
  "action.redo.nothing": "Nada que rehacer",
  "action.undo.blocked.pending": "Termina o aborta la operación en curso antes de deshacer",
  "action.undo.blocked.empty": "El repositorio todavía no tiene commits",
  "action.undo.op": "Deshacer",
  "action.redo.op": "Rehacer",
  "action.undo.done": "Deshecho",
  "action.redo.done": "Rehecho",

  /* ---------------------------------------------------------------- */
  /* Store                                                             */
  /* ---------------------------------------------------------------- */
  "store.log.failed": "Fallo al leer el historial",
  "store.refs.failed": "Fallo al leer las referencias",
  "store.operation.failed": "{label} falló",
  "store.worktree.switching": "Cambiando a {path}",
  "store.worktree.failed": "No se pudo cambiar de worktree",
  "store.worktree.active": "Worktree activo",
  "store.repo.opening": "Abriendo {path}",
  "store.repo.opened": "Repositorio abierto",
  "store.repo.openFailed": "No se pudo abrir el repositorio",
  "store.repo.initializing": "git init en {path}",
  "store.repo.created": "Repositorio creado",
  "store.repo.initFailed": "git init falló",
  "store.ws.connected": "conectado — gitcraque {version} (pid {pid}) en {cwd}",
  "store.ws.cwdChanged": "el directorio del servidor ahora es {cwd}",
  "store.lifecycle.resumed": "pestaña de vuelta — reconectando y recargando el estado",
  "store.lifecycle.restored": "vista restaurada tras el descarte de la pestaña por el navegador",

  /* ---------------------------------------------------------------- */
  /* Toasts                                                            */
  /* ---------------------------------------------------------------- */
  "toast.copyCommand": "Copiar el comando",
  "toast.commandCopied": "Comando copiado",

  /* ---------------------------------------------------------------- */
  /* Diálogos — piezas comunes                                         */
  /* ---------------------------------------------------------------- */
  "dialog.intent.for": "sobre",
  "dialog.intent.noOperation": "Ninguna operación disponible.",
  "dialog.intent.rewritesHistory": "reescribe el historial",
  "dialog.intent.holdRebase": "Mantén pulsado para rebasar",
  "dialog.intent.holdConfirm": "Mantén pulsado para confirmar",

  /* ---------------------------------------------------------------- */
  /* Diálogo de squash                                                 */
  /* ---------------------------------------------------------------- */
  "squash.title": "Squash de {count} commits",
  "squash.description":
    "Une los commits seleccionados en uno solo. Reescribe el historial desde el más antiguo de ellos.",
  "squash.hold": "Mantén pulsado para unir",
  "squash.needTwo":
    "Selecciona al menos dos commits en el grafo para unirlos. Seleccionados ahora: {count}.",
  "squash.warning":
    "Esto REESCRIBE el historial: los commits de abajo dejan de existir con sus hashes actuales. Si alguno ya fue publicado, el próximo push exigirá --force-with-lease.",
  "squash.plan": "Plan del rebase interactivo",
  "squash.plan.hint": "Mismo orden que git-rebase-todo: del más antiguo al más nuevo.",
  "squash.outOfLog": "(fuera del log cargado)",
  "squash.mode": "Qué hacer con los mensajes",
  "squash.mode.fixupHint": "fixup descarta los mensajes de los commits unidos.",
  "squash.mode.squashHint": "squash abre la lista de mensajes para el commit final.",
  "squash.mode.aria": "Acción de las líneas unidas",
  "squash.message": "Mensaje final",
  "squash.message.fixupPlaceholder": "fixup mantiene el mensaje del commit más antiguo.",
  "squash.message.placeholder": "Déjalo vacío para concatenar los mensajes originales.",
  "squash.message.fixupHint": "No disponible con fixup.",
  "squash.message.hint":
    "Cuando está relleno, el backend hace git commit --amend -m después del rebase.",
  "squash.preview": "Se ejecutará (con GIT_SEQUENCE_EDITOR)",
  "squash.op": "Squash",
  "squash.done_one": "Squash de {count} commit",
  "squash.done_other": "Squash de {count} commits",

  /* ---------------------------------------------------------------- */
  /* Diálogo de push                                                   */
  /* ---------------------------------------------------------------- */
  "push.title": "Push",
  "push.description": "Envía los commits de la rama elegida al remoto.",
  "push.state.idle": "Enviar",
  "push.state.sending": "Enviando...",
  "push.state.ok": "Enviado",
  "push.state.error": "Falló",
  "push.aria": "Enviar {branch} a {remote}",
  "push.aria.currentBranch": "rama actual",
  "push.aria.remote": "remoto",
  "push.hold": "Mantén pulsado para push --force-with-lease",
  "push.noRemotes": "Este repositorio no tiene ningún remoto configurado, así que no hay adónde enviar.",
  "push.addRemote": "Añadir remoto",
  "push.field.remote": "Remoto",
  "push.field.remote.aria": "Remoto de destino",
  "push.field.branch": "Rama",
  "push.field.branch.noUpstream": "{name} (sin upstream)",
  "push.field.branch.hint": "{ahead} commits por delante, {behind} por detrás del upstream.",
  "push.field.branch.hint.none": "Sin upstream configurado.",
  "push.field.setUpstream.hint": "Empieza a seguir la rama remota después de este push.",
  "push.field.tags.hint": "Envía también todas las etiquetas locales.",
  "push.field.force.hint":
    "Sobrescribe la rama remota, pero solo si está donde la viste por última vez.",
  "push.force.warning":
    "La rama {branch} será SOBRESCRITA en {remote}. Quien ya se había traído los commits antiguos tendrá que rebasar.",
  "push.force.currentBranch": "actual",
  "push.https.note":
    "{host} usa https: si la bóveda no tiene la credencial, GitCraque pedirá usuario y token aquí mismo, sin bloquear git.",
  "push.https.theRemote": "El remoto",
  "push.op": "Push a {remote}",
  "push.done": "Push a {remote} completado",

  /* ---------------------------------------------------------------- */
  /* Diálogo de conflicto                                              */
  /* ---------------------------------------------------------------- */
  "conflict.kind.rebase": "rebase",
  "conflict.kind.rebaseInteractive": "rebase interactivo",
  "conflict.kind.merge": "merge",
  "conflict.kind.cherryPick": "cherry-pick",
  "conflict.kind.revert": "revert",
  "conflict.kind.bisect": "bisect",
  "conflict.title": "{kind} en curso{progress}",
  "conflict.progress": " — paso {step} de {total}",
  "conflict.description.conflicts":
    "Git se detuvo con conflictos. Resuelve los archivos de abajo en el editor y continúa, o aborta y vuelve al estado anterior.",
  "conflict.description.clean":
    "El repositorio está en mitad de una operación. Continúa cuando termines de resolver, o aborta.",
  "conflict.hold": "Mantén pulsado para abortar",
  "conflict.continue": "Continuar",
  "conflict.ai.action": "Resolver con IA",
  "conflict.ai.utterance": "Resolver los conflictos y terminar la operación",
  "conflict.applying": "Aplicando el commit {hash}.",
  "conflict.files": "Archivos en conflicto ({count})",
  "conflict.files.hint": "Resuelve en el editor y haz stage; luego vuelve aquí y continúa.",
  "conflict.noFiles":
    "Ningún archivo en conflicto reportado. Si ya lo resolviste todo, continuar debería terminar la operación.",
  "conflict.preview.continue": "Continuar ejecuta",
  "conflict.preview.abort": "Abortar ejecuta",
  "conflict.holdHint":
    "Abortar descarta lo que la operación ya aplicó y devuelve el repositorio a su estado anterior. Mantén pulsado el botón para confirmar.",
  "conflict.unsupported":
    "{kind} no tiene continuar ni abortar por la API de GitCraque. Resuélvelo en el terminal (git bisect reset).",
  "conflict.op.continue": "Continuar {kind}",
  "conflict.op.abort": "Abortar {kind}",
  "conflict.done.resumed": "Operación reanudada",
  "conflict.done.aborted": "Operación abortada",

  /* ---------------------------------------------------------------- */
  /* Diálogos de creación                                              */
  /* ---------------------------------------------------------------- */
  "createRef.startHint": "Vacío usa el HEAD actual. Acepta hash, rama o etiqueta.",
  "createBranch.title": "Crear rama",
  "createBranch.description":
    "Crea una referencia local nueva apuntando al punto de partida.",
  "createBranch.name": "Nombre de la rama",
  "createBranch.name.placeholder": "feature/nombre-corto",
  "createBranch.name.invalid": "Nombre de ref inválido.",
  "createBranch.start": "Punto de partida (opcional)",
  "createBranch.checkout": "Cambiar a la rama nueva",
  "createBranch.checkout.hint":
    "Hace checkout después de crearla. No confundir con cambiar de worktree, que es process.chdir.",
  "createBranch.op": "Crear rama",
  "createBranch.done": "Rama {name} creada",

  "createTag.title": "Crear etiqueta",
  "createTag.description": "Marca un commit con un nombre fijo.",
  "createTag.name": "Nombre de la etiqueta",
  "createTag.name.invalid": "Nombre de etiqueta inválido.",
  "createTag.commit": "Commit (opcional)",
  "createTag.message": "Mensaje (opcional)",
  "createTag.message.placeholder": "Versión 1.0.0",
  "createTag.message.hint": "Con mensaje la etiqueta es anotada (-a -m); sin mensaje es ligera.",
  "createTag.annotated":
    "Una etiqueta anotada guarda autor, fecha y mensaje como objeto propio en el repositorio.",
  "createTag.op": "Crear etiqueta",
  "createTag.done": "Etiqueta {name} creada",

  /* ---------------------------------------------------------------- */
  /* Diálogos de borrado de rama                                       */
  /* ---------------------------------------------------------------- */
  "deleteLocal.title": "Borrar la rama {name}",
  "deleteLocal.description": "Quita solo la referencia local. El remoto no se toca.",
  "deleteLocal.hold": "Mantén pulsado para borrar",
  "deleteLocal.holdForce": "Mantén pulsado para forzar (-D)",
  "deleteLocal.upstream":
    "{name} sigue a {upstream} ({ahead} por delante, {behind} por detrás). La rama en el servidor sigue existiendo.",
  "deleteLocal.notMerged":
    "Git se negó: {name} no está totalmente fusionada. Con -D los commits que solo existen ahí quedan inalcanzables y desaparecen en el próximo gc.",
  "deleteLocal.safe":
    "Con -d git solo borra si la rama ya está fusionada. Si se niega, la opción -D aparece aquí.",
  "deleteLocal.op": "Borrar la rama {name}",
  "deleteLocal.done": "Rama {name} borrada",

  "deleteRemote.title": "Borrar {name} en el servidor",
  "deleteRemote.description": "Esto es un push de borrado: la rama deja de existir en el remoto.",
  "deleteRemote.hold": "Mantén pulsado para borrar en el servidor",
  "deleteRemote.warning":
    "Borra {name} EN EL SERVIDOR {remote}. Todos los que usan ese remoto pierden la referencia, y ningún comando local lo deshace. La copia local se queda donde está.",
  "deleteRemote.noRemote": "(sin remoto)",
  "deleteRemote.field.remote": "Remoto",
  "deleteRemote.op": "Borrar {remote}/{name}",
  "deleteRemote.done": "{remote}/{name} borrada en el servidor",

  /* ---------------------------------------------------------------- */
  /* Diálogo de añadir remoto                                          */
  /* ---------------------------------------------------------------- */
  "addRemote.title": "Añadir remoto",
  "addRemote.description": "Registra un destino de fetch y push en este repositorio.",
  "addRemote.name": "Nombre",
  "addRemote.name.hint": "Cómo aparecerá el remoto en git remote -v.",
  "addRemote.name.invalid": "Nombre inválido: usa letras, números, punto, guion o guion bajo.",
  "addRemote.name.duplicated": "Ya existe un remoto llamado {name}.",
  "addRemote.url": "Url",
  "addRemote.url.hint": "https://host/org/repo.git, ssh://host/ruta o git@host:org/repo.git",
  "addRemote.url.invalid":
    "Url inválida. Usa https://host/org/repo.git o git@host:org/repo.git.",
  "addRemote.https":
    "Url https: fetch y push pasan por el trampolín GIT_ASKPASS. La primera vez, GitCraque pedirá usuario y token para {host} en su propia caja — git nunca se queda bloqueado en un prompt.",
  "addRemote.https.thisHost": "este host",
  "addRemote.ssh":
    "Url ssh: la autenticación es de tu agente de claves. Si la clave tiene passphrase, la petición también llega por la caja de credenciales.",
  "addRemote.op": "Añadir remoto",
  "addRemote.done": "Remoto {name} añadido",

  /* ---------------------------------------------------------------- */
  /* Diálogo de credenciales                                           */
  /* ---------------------------------------------------------------- */
  "credential.title.username": "Usuario para {host}",
  "credential.title.secret": "Contraseña o token para {host}",
  "credential.description":
    "Git está esperando esta respuesta para continuar. Nada se escribe en disco ni pasa por la línea de comandos.",
  "credential.expiresIn": "Caduca en {seconds}s",
  "credential.expired": "Petición caducada",
  "credential.send": "Enviar a git",
  "credential.prompt": "Git pidió",
  "credential.host": "Host: {host}",
  "credential.field.username": "Usuario",
  "credential.field.username.placeholder": "tu-usuario",
  "credential.field.secret": "Contraseña o token de acceso",
  "credential.remember": "Recordar en esta sesión",
  "credential.remember.hint":
    "Se guarda en la bóveda en memoria del servidor hasta que se apague. Nunca va al disco.",
  "credential.note":
    "El valor viaja por un socket unix hasta la bóveda y de ahí al stdout del askpass. No entra en el env del proceso de git (que cualquiera lee en /proc) ni en argv.",

  /* ---------------------------------------------------------------- */
  /* Selector de repositorios                                          */
  /* ---------------------------------------------------------------- */
  "picker.dialog.title": "Abrir repositorio",
  "picker.dialog.description":
    "Cambiar de repositorio hace process.chdir() en el servidor y recarga el View Tree entero. No ocurre ningún checkout.",
  "picker.search.placeholder": "Filtrar por nombre, o pegar una ruta y pulsar Enter",
  "picker.search.aria": "Filtrar repositorios o escribir una ruta",
  "picker.search.clear": "Limpiar filtro",
  "picker.enter.navigate": "Enter navega a {path}",
  "picker.enter.open": "Enter abre {path}",
  "picker.tabs.aria": "Dónde buscar el repositorio",
  "picker.tab.favorites": "Favoritos",
  "picker.tab.recents": "Recientes",
  "picker.tab.search": "Buscar",
  // "Escanear", no "Buscar": la pestaña de al lado ahora busca en el historial
  // de repositorios conocidos, y dos pestañas con el mismo nombre serían un
  // volado.
  "picker.tab.scan": "Escanear",
  "picker.tab.browse": "Explorar",
  "picker.search.historyEmpty":
    "Todavía no se conoce ninguna carpeta git. Usa Escanear o Explorar — lo que aparezca ahí queda guardado aquí.",
  "picker.search.noMatch": "Ningún repositorio conocido coincide con la búsqueda.",
  "picker.search.insideOf": "dentro de {name}",
  "picker.search.note_one": "Busca en {count} carpeta git ya vista, esté donde esté.",
  "picker.search.note_other": "Busca en {count} carpetas git ya vistas, estén donde estén.",
  "picker.recents.empty": "Todavía no has abierto ningún repositorio. Usa Escanear o Explorar.",
  "picker.recents.noMatch": "Ningún reciente coincide con el filtro.",
  "picker.recents.forget": "Olvidar {name}",
  "picker.recents.forgetTitle": "Quitar de los recientes",
  "picker.scan.notStarted": "Búsqueda no iniciada.",
  "picker.scan.empty": "Ningún repositorio en las carpetas conocidas. Prueba la pestaña Explorar.",
  "picker.scan.noMatch": "Ningún resultado coincide con el filtro.",
  "picker.scan.none.title": "Ningún repositorio encontrado",
  "picker.scan.none.body": "{scanned} carpetas visitadas en {ms} ms — usa la pestaña Explorar",
  "picker.scan.failed": "La búsqueda falló",
  "picker.scan.again": "Buscar de nuevo",
  "picker.scan.running": "Buscando…",
  "picker.scan.truncated": "La búsqueda paró en el límite de tiempo — no se visitó todo.",
  "picker.scan.note":
    "Busca en las carpetas conocidas (personal, Projects, code, /opt, /srv), hasta 4 niveles.",
  "picker.browse.pickStart": "Elige un punto de partida.",
  "picker.browse.noSubfolders": "Ninguna subcarpeta aquí.",
  "picker.browse.isRepo": "repositorio git",
  "picker.browse.bare": "bare",
  "picker.browse.linkedWorktree": "worktree enlazado",
  "picker.browse.tooMany":
    "La carpeta tiene más subcarpetas que el límite de listado — acótalo con el filtro.",
  "picker.browse.gitInit": "git init en {name}",
  "picker.browse.openHere": "Abrir esta carpeta",
  "picker.browse.open": "Abrir",
  "picker.browse.openRepo": "Abrir {name}",
  "picker.browse.openRepoTitle":
    "Abrir este repositorio — al hacer clic en la fila solo se entra en la carpeta",
  "picker.favorites.note":
    "Arrastra por el asa para ordenar, el lápiz pone un alias, la estrella desancla. A diferencia de los recientes, aquí nada entra ni sale solo.",
  "picker.favorites.unavailableNote":
    "Anclar proyectos depende de una ruta que este servidor todavía no expone.",
  "picker.footer.keys":
    "Las flechas navegan, Enter abre. Abrir un repositorio hace {chdir} en el servidor — no hay checkout.",

  "favorites.unavailable": "Favoritos no disponibles en esta versión del servidor.",
  "favorites.empty":
    "Ningún proyecto anclado. Haz clic en la estrella de un repositorio en Recientes, Buscar o Explorar para anclarlo aquí.",
  "favorites.noMatch": "Ningún favorito coincide con el filtro.",
  "favorites.pin": "Anclar {name} a favoritos",
  "favorites.unpin": "Desanclar {name} de favoritos",
  "favorites.pinTitle": "Anclar a favoritos",
  "favorites.unpinTitle": "Quitar de favoritos",
  "favorites.reorder": "Reordenar {name}",
  "favorites.reorderTitle": "Arrastra para reordenar (o Alt + flechas)",
  "favorites.rename": "Renombrar {name}",
  "favorites.renameTitle": "Dar un alias a este proyecto",
  "favorites.remove": "Quitar",
  "favorites.label": "Alias del proyecto",
  "favorites.editHint": "Enter guarda · Esc cancela",
  "favorites.filterHint":
    "Limpia el filtro para reordenar — con la lista parcial no hay forma de saber el orden completo.",
  "favorites.error.unpin": "No se pudo desanclar el proyecto",
  "favorites.error.pin": "No se pudo anclar el proyecto",
  "favorites.error.rename": "No se pudo renombrar el favorito",
  "favorites.error.reorder": "No se pudieron reordenar los favoritos",
  "favorites.a11y.instructions":
    "Para reordenar con el teclado, enfoca el asa del proyecto y pulsa espacio o Enter. Usa las flechas para elegir la nueva posición y pulsa espacio o Enter de nuevo para soltar, o Escape para cancelar. Alt con las flechas mueve el proyecto sin entrar en modo arrastre.",
  "favorites.a11y.start": "Reordenando {name}, posición {index} de {total}.",
  "favorites.a11y.over": "Se soltará en la posición {index} de {total}.",
  "favorites.a11y.outside": "Fuera de la lista.",
  "favorites.a11y.end": "{name} pasó a la posición {index}.",
  "favorites.a11y.unchanged": "El orden no cambió.",
  "favorites.a11y.cancel": "Reordenación de {name} cancelada.",

  "time.now": "ahora",
  "time.minutesAgo": "hace {count} min",
  "time.hoursAgo": "hace {count} h",
  "time.yesterday": "ayer",
  "time.daysAgo": "hace {count} días",

  /* ---------------------------------------------------------------- */
  /* Ejecutores de intenciones                                         */
  /* ---------------------------------------------------------------- */
  "exec.cherryPick.done": "Cherry-pick aplicado",
  "exec.merge.done": "Merge completado",
  "exec.rebase.done": "Rebase completado",
  "exec.deleteLocal.done": "Rama borrada",
  "exec.deleteRemote.done": "Rama remota borrada",
  "exec.unknownRoute": "Ruta desconocida",
  "exec.unknownRoute.body": "La intención pidió {endpoint}, que no tiene ejecución mapeada.",

  /* ---------------------------------------------------------------- */
  /* Anuncios de arrastre                                              */
  /* ---------------------------------------------------------------- */
  "dnd.entity.commit": "el commit",
  "dnd.entity.branch": "la rama",
  "dnd.entity.remoteBranch": "la rama remota",
  "dnd.entity.tag": "la etiqueta",
  "dnd.entity.stash": "el stash",
  "dnd.entity.item": "el elemento",
  "dnd.zone.branch": "la rama",
  "dnd.zone.remoteBranch": "la rama remota",
  "dnd.zone.commit": "el commit",
  "dnd.zone.tag": "la etiqueta",
  "dnd.zone.trash": "la papelera",
  "dnd.zone.target": "el destino",
  "dnd.a11y.instructions":
    "Para arrastrar con el teclado, pulsa espacio o Enter con el elemento enfocado. Usa las flechas para recorrer los destinos; en cada uno el motor anuncia si la operación se acepta. Pulsa espacio o Enter de nuevo para soltar, o Escape para cancelar. Soltar no ejecuta nada: un diálogo pide la confirmación.",
  "dnd.a11y.dragging": "Arrastrando {what}.",
  "dnd.a11y.outside": "{what} fuera de cualquier destino.",
  "dnd.a11y.overAccepts": "Sobre {where}. Aceptado: {title}.",
  "dnd.a11y.overRejects": "Sobre {where}. Rechazado: {reason}",
  "dnd.a11y.droppedOutside": "{what} soltado fuera de un destino. No se hizo nada.",
  "dnd.a11y.dropped": "{what} soltado sobre {where}. Confirma la operación en el diálogo.",
  "dnd.a11y.refused": "Operación rechazada: {reason}",
  "dnd.a11y.cancelled": "Arrastre de {what} cancelado.",
  "dnd.a11y.cancelledPlain": "Arrastre cancelado.",
  "dnd.chip.no": "no",

  /* ---------------------------------------------------------------- */
  /* Motor de intenciones                                              */
  /* ---------------------------------------------------------------- */
  "intent.invalid.title": "Movimiento no permitido",
  "intent.sameRef.title": "Misma referencia",
  "intent.sameRef": "El origen y el destino son la misma referencia ({label}).",
  "intent.tag.noDrag":
    "Las etiquetas no se mueven arrastrando: mover la etiqueta {label} exigiría recrearla. Usa el diálogo de etiquetas.",
  "intent.stash.noDrag":
    "Un stash no se aplica arrastrando. Usa aplicar o descartar en {label} desde el rail.",
  "intent.unknownSource": "Tipo de origen desconocido para el motor de intenciones.",
  "intent.unknownTarget.commit": "Destino desconocido para un commit.",
  "intent.unknownTarget.branch": "Destino desconocido para una rama.",
  "intent.unknownTarget.remoteBranch": "Destino desconocido para una rama remota.",

  "intent.commit.toCommit":
    "Dos commits no forman una operación. Arrastra el commit sobre una rama para hacer cherry-pick.",
  "intent.commit.toRemote":
    "No se aplica un commit directamente sobre una rama remota. Haz cherry-pick en la rama local y luego push a {label}.",
  "intent.commit.toTag":
    "Una etiqueta apunta a un commit, no recibe commits. Crea una etiqueta nueva desde el diálogo de etiquetas.",
  "intent.commit.toTrash":
    "Un commit no se borra arrastrando. Usa reset o revert desde el menú del commit.",

  "intent.branchBusy.title": "Rama ocupada en otro worktree",
  "intent.cherryPick.busy":
    "La rama {branch} está activa en el worktree {worktree}. El cherry-pick necesita que sea HEAD; cambia de worktree antes.",
  "intent.cherryPick.onHead":
    "Aplica el commit {hash}{subject} sobre {branch}, que es la rama actual. Crea un commit NUEVO; no se reescribe nada.",
  "intent.cherryPick.offHead":
    "Aplica el commit {hash}{subject} sobre {branch}. Como {branch} no es la rama actual, el backend hace checkout antes — para eso está el campo \"onto\". Crea un commit NUEVO; no se reescribe nada.",
  "intent.cherryPick.label": "Cherry-pick en {branch}",
  "intent.cherryPick.title": "Cherry-pick en {branch}",

  "intent.branch.toRemote":
    "Arrastrar una rama local sobre una remota sería un push, que necesita remoto, upstream y force-with-lease. Usa el diálogo de Push para enviar {label}.",
  "intent.branch.toCommit":
    "Mover {label} a otro commit es git reset, que descarta trabajo. Hazlo desde el menú del commit, no arrastrando.",
  "intent.branch.toTag":
    "Una rama no se convierte en etiqueta arrastrando. Crea la etiqueta desde el diálogo de etiquetas.",

  "intent.integrate.busy":
    "La rama {branch} está activa en el worktree {worktree}. Merge y rebase la necesitan como HEAD; cambia de worktree antes.",
  "intent.integrate.checkoutNote":
    " Como {into} no es la rama actual, el backend hace checkout antes — para eso está el campo \"into\".",
  "intent.merge.label": "Merge de {from} en {into}",
  "intent.merge.description":
    "Trae los commits de {from} a {into}, creando un commit de merge. NO se reescribe ningún historial.{checkoutNote}",
  "intent.rebase.label": "Rebase de {from} sobre {into}",
  "intent.rebase.description":
    "REESCRIBE {from}: los commits de {from} que aún no están en {into} se reaplican uno a uno encima de {into}. {into} no cambia y no recibe nada.{upstreamNote}",
  "intent.rebase.upstreamNote":
    " {name} sigue a {upstream}{gap}: después del rebase el push exigirá --force-with-lease.",
  "intent.rebase.upstreamGap": " ({ahead} por delante, {behind} por detrás)",
  "intent.integrate.title": "{from} sobre {into}",
  "intent.integrate.description":
    "Elige cómo integrar {from} en {into}. Merge preserva el historial de ambas; rebase reescribe {from}.{tail}",
  "intent.integrate.noRebaseRemote":
    " Rebase no entra en la lista: {from} es una rama remota y no puede reescribirse desde aquí — para reescribir {into} encima de ella, usa Pull con rebase.",
  "intent.integrate.noRebaseBusy":
    " Rebase no entra en la lista: {from} está activa en el worktree {worktree} y tendría que ser HEAD.",

  "intent.delete.currentBranch.title": "Rama actual",
  "intent.delete.currentBranch":
    "{name} es la rama actual y git no borra la rama en la que estás. Cambia de rama antes.",
  "intent.delete.busy":
    "{name} está activa en el worktree {worktree}. Git no borra una rama activa en ningún worktree.",
  "intent.delete.local.description":
    "Quita la rama LOCAL {name}. Los commits que solo existían en ella quedan inalcanzables. El remoto no se toca.",
  "intent.delete.local.title": "Borrar la rama {name}",
  "intent.delete.local.label": "Borrar {name}",

  "intent.remote.toRemote":
    "Dos ramas remotas no forman una operación local. Trae una de ellas a una rama local primero.",
  "intent.remote.toCommit":
    "Una rama remota no se mueve a un commit desde aquí: quien mueve una ref en el servidor es el push.",
  "intent.remote.toTag":
    "Una rama remota no se convierte en etiqueta arrastrando. Crea la etiqueta desde el diálogo de etiquetas.",
  "intent.remote.noRemote":
    "No se puede averiguar el remoto de {label}. Bórrala desde el diálogo de ramas remotas.",
  "intent.delete.remote.description":
    "Borra la rama {name} EN EL SERVIDOR {remote}. Todos los que usan ese remoto pierden la referencia; eso no se deshace con un comando local.",
  "intent.delete.remote.title": "Borrar {remote}/{name} en el servidor",
  "intent.delete.remote.label": "Borrar {remote}/{name}",

  /* ---------------------------------------------------------------- */
  /* Menús contextuales                                                */
  /* ---------------------------------------------------------------- */
  "menu.reveal": "Llevar el View Tree hasta aquí",
  "menu.copyName": "Copiar el nombre",
  "menu.copyPath": "Copiar la ruta",
  "menu.copyFileName": "Copiar el nombre del archivo",

  "menu.hint.current": "actual",
  "menu.hint.isCurrent": "es la actual",
  "menu.hint.detached": "detached",
  "menu.hint.chdir": "process.chdir",

  "menu.commit.squashSelected": "Squash de los {count} commits",
  "menu.commit.cherryPickSelected": "Cherry-pick de los {count} en la rama actual",
  "menu.commit.copyHashes": "Copiar los hashes",
  "menu.commit.clearSelection": "Limpiar la selección",
  "menu.commit.checkout": "Checkout de este commit",
  "menu.commit.createBranch": "Crear rama aquí",
  "menu.commit.createTag": "Crear etiqueta aquí",
  "menu.commit.cherryPick": "Cherry-pick en la rama actual",
  "menu.commit.revert": "Revertir",
  "menu.commit.reset": "Reset de la rama actual hasta aquí",
  "menu.commit.copyHash": "Copiar el hash",
  "menu.commit.copySubject": "Copiar el asunto",

  "menu.branch.mergeInto": "Fusionar en {branch}",
  "menu.branch.rebaseOnto": "Rebasar {branch} sobre esta",
  "menu.branch.createFrom": "Crear rama a partir de aquí",
  "menu.remoteBranch.checkoutExisting": "Checkout de {name}",
  "menu.remoteBranch.checkoutNew": "Checkout (crea la local siguiéndola)",
  "menu.tag.createBranch": "Crear rama a partir de la etiqueta",

  "menu.remote.fetch": "Fetch --prune de este remoto",
  "menu.remote.copyFetchUrl": "Copiar la url de fetch",
  "menu.remote.browse": "Abrir en el navegador",
  "menu.stash.copyMessage": "Copiar el mensaje",
  "menu.worktree.switch": "Cambiar a este worktree",

  "menu.file.view": "Ver en el visor",
  "menu.commitFile.view": "Ver en este commit",
  "menu.commitFile.viewWorking": "Ver la versión del árbol de trabajo",
  "menu.commitFile.blame": "Blame — quién tocó cada línea",

  "menu.viewer.blame": "Blame — quién tocó cada línea",

  "menu.viewer.copySelection": "Copiar la selección",
  "menu.viewer.nothingSelected": "nada seleccionado",
  "menu.viewer.chars": "{count} car.",
  "menu.viewer.copySourceHash": "Copiar el hash de origen",
  "menu.viewer.viewMode": "Ver en {mode}",
  "menu.viewer.openWorking": "Abrir la versión del árbol de trabajo",

  /* ---------------------------------------------------------------- */
  /* Portapapeles                                                      */
  /* ---------------------------------------------------------------- */
  "copy.hash": "Hash copiado",
  "copy.hashes": "Hashes copiados",
  "copy.subject": "Asunto copiado",
  "copy.name": "Nombre copiado",
  "copy.path": "Ruta copiada",
  "copy.url": "Url copiada",
  "copy.message": "Mensaje copiado",
  "copy.selection": "Selección copiada",
  "copy.failed": "No se pudo copiar: {label}",
  "copy.failed.body": "El navegador rechazó el acceso al portapapeles.",

  /* ---------------------------------------------------------------- */
  /* Acciones                                                          */
  /* ---------------------------------------------------------------- */
  "action.fetchRemote.op": "Fetch {remote}",
  "action.fetchRemote.done": "Fetch de {remote} completado",

  "action.detached.title": "HEAD detached",
  "action.merge.detached.body":
    "No hay rama actual que reciba el merge. Haz checkout de una rama antes.",
  "action.merge.title": "Merge de {source} en {target}",
  "action.merge.description":
    "Trae los commits de {source} a {target}. NO se reescribe ningún historial; si divergieron, nace un commit de merge.",
  "action.merge.confirm": "Merge",
  "action.merge.noFf.hint": "commit de merge incluso cuando sería fast-forward",
  "action.merge.squash.hint": "junta todo en el index sin hacer commit ni registrar el merge",
  "action.merge.op": "Merge",
  "action.merge.done": "{source} fusionado en {target}",

  "action.rebase.detached.body":
    "El rebase necesita una rama actual que reescribir. Haz checkout de una rama antes.",
  "action.rebase.title": "Rebase de {branch} sobre {onto}",
  "action.rebase.description":
    "REESCRIBE {branch}: los commits que tiene y {onto} no, se reaplican uno a uno encima de {onto}. {onto} no cambia. Si {branch} ya se publicó, el próximo push exigirá --force-with-lease.",
  "action.rebase.confirm": "Rebase",
  "action.rebase.op": "Rebase",
  "action.rebase.done": "{branch} rebasada sobre {onto}",

  "action.checkoutCommit.title": "Checkout de {hash}",
  "action.checkoutCommit.description":
    "Lleva el árbol de trabajo hasta {what} con el HEAD DETACHED: ninguna rama sigue lo que hagas commit desde aquí. Para volver, haz checkout de una rama; para quedarte, crea una rama en este punto.",
  "action.checkoutCommit.done": "Detached en {hash}",

  "action.cherryPick.title_one": "Cherry-pick de {hash}",
  "action.cherryPick.title_other": "Cherry-pick de {count} commits",
  "action.cherryPick.description":
    "Aplica {what} sobre {target}. Crea commits NUEVOS, con hashes nuevos; no se reescribe nada. El backend reordena del más antiguo al más nuevo antes de aplicar.",
  "action.cherryPick.what_one": "{subject}",
  "action.cherryPick.what_other": "los {count} commits seleccionados",
  "action.cherryPick.currentHead": "el HEAD actual",
  "action.cherryPick.confirm": "Cherry-pick",
  "action.cherryPick.noCommit.hint": "aplica en el index y para, sin crear commit",
  "action.cherryPick.op": "Cherry-pick",
  "action.cherryPick.done": "Cherry-pick completado",

  "action.revert.title": "Revertir {hash}",
  "action.revert.description":
    "Crea un commit NUEVO que deshace {what}. El commit original sigue en el historial — no se reescribe nada.",
  "action.revert.confirm": "Revertir",
  "action.revert.noCommit.hint": "deshace en el index y para, sin crear commit",
  "action.revert.op": "Revert",
  "action.revert.done": "{hash} revertido",

  "action.reset.title": "Reset de {branch} a {hash}",
  "action.reset.description":
    "Mueve {branch} a {hash}. Los commits que queden atrás dejan de ser alcanzables desde esta rama. Con --hard, los cambios del árbol de trabajo también se van, y no hay deshacer.",
  "action.reset.confirm": "Reset",
  "action.reset.field.mode": "Modo",
  "action.reset.mode.soft": "--soft — mueve la rama; index y árbol intactos",
  "action.reset.mode.mixed": "--mixed — mueve la rama y limpia el index; árbol intacto",
  "action.reset.mode.hard": "--hard — mueve todo y DESCARTA el árbol de trabajo",
  "action.reset.op": "Reset",
  "action.reset.done": "Reset --{mode} a {hash}",
  "action.reset.head": "el HEAD",

  "action.discard.title_one": "Descartar {path}",
  "action.discard.title_other": "Descartar {count} archivos",
  "action.discard.description_one":
    "Devuelve el archivo al estado del último commit. Lo que no estaba en un commit se pierde, y git no guarda copia de eso.",
  "action.discard.description_other":
    "Devuelve los archivos al estado del último commit. Lo que no estaba en un commit se pierde, y git no guarda copia de eso.",
  "action.discard.confirm": "Descartar",

  "graph.copyHash": "Copiar el hash completo",
  "graph.copyHash.aria": "Copiar el hash {hash}",
  "graph.copyHash.failed": "No se pudo copiar el hash",
  "graph.tooltip.files_one": "{count} archivo modificado",
  "graph.tooltip.files_other": "{count} archivos modificados",
  "argv.name": "<nombre>",
  "argv.newName": "<nombre-nuevo>",
  "argv.url": "<url>",
  "argv.path": "<ruta>",

  /* ---- agente por voz y por texto ---- */
  "agent.button.aria": "Hablarle un comando al agente",
  "agent.state.idle": "Mantén pulsado para hablar",
  "agent.state.recording": "Escuchando…",
  "agent.state.transcribing": "Transcribiendo…",
  "agent.state.running": "Trabajando…",
  "agent.heard": "Dijiste",
  "agent.typed": "Pediste",
  "agent.placeholder": "Dime qué quieres hacer en el repositorio…",
  "agent.send": "Enviar",
  "agent.stop": "Parar",
  "agent.close": "Cerrar",
  "agent.commands": "Comandos ejecutados",
  "agent.done": "Listo",
  "agent.failed": "El agente se detuvo",
  "agent.cost": "Coste de esta sesión: US$ {cost}",
  "agent.empty": "No entendí nada del audio. Inténtalo otra vez.",
  "agent.busy": "El agente ya está trabajando.",
  "agent.micDenied": "El navegador no dio acceso al micrófono.",
  "agent.micMissing": "No hay micrófono disponible en este navegador.",
  "agent.noKey": "Falta la clave de OpenRouter.",
  "agent.noKey.hint": "Configura OPENROUTER_API_KEY o guarda la clave en los ajustes.",
  "agent.piDownload": "pi se descargará en la primera ejecución — eso tarda un poco.",

  /* ---- área de IA bloqueada: falta la clave de OpenRouter ---- */
  "ai.locked.title": "Funciones de IA bloqueadas",
  "ai.locked.body":
    "El servidor no encontró ninguna clave de OpenRouter. Pega una aquí para desbloquear el agente.",
  "ai.locked.placeholder": "sk-or-v1-…",
  "ai.locked.unlock": "Desbloquear",
  "ai.locked.hint":
    "La clave va directo al servidor y se queda solo ahí, con permiso 0600. El navegador nunca la recibe de vuelta.",
};
