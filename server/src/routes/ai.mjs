/**
 * Rotas do agente: microfone -> transcricao -> pi coding agent.
 *
 * `POST /ai/run` devolve na hora e trabalha em segundo plano. Uma sessao de
 * agente leva minutos; segurar a resposta HTTP por esse tempo daria timeout em
 * proxy, em navegador, ou nos dois. O andamento sai pelo WebSocket (`ai:event`,
 * `ai:done`, `ai:error`), que e por onde a interface ja escuta tudo.
 */
import { getRefsPayload } from "../git/refs.mjs";
import { getStatus } from "../git/status.mjs";
import { HttpError } from "../router.mjs";

import * as key from "../ai/key.mjs";
import * as pi from "../ai/pi.mjs";
import * as session from "../ai/session.mjs";
import {
  buildConflictMessage,
  buildConflictSystemPrompt,
  buildSystemPrompt,
  buildUserMessage,
} from "../ai/prompt.mjs";
import { TRANSCRIBE_MODEL, transcribe } from "../ai/openrouter.mjs";

import { bodyOf } from "./_util.mjs";

/** Idiomas que a transcricao aceita como dica. Fora disso, deixa o modelo decidir. */
const KNOWN_LANGUAGES = new Set(["pt", "en", "es", "zh"]);

/**
 * Resolve a chave ou recusa. Toda rota que gasta dinheiro passa por aqui.
 * @returns {Promise<string>}
 */
async function requireKey() {
  const { value } = await key.resolveKey();
  if (!value) throw new HttpError(401, "error.aiKeyMissing");
  return value;
}

export function registerAiRoutes(router) {
  router.add("GET", "/ai/status", async () => {
    const { value, source } = await key.resolveKey();
    const launcher = await pi.discoverPi();
    return {
      hasKey: value !== "",
      keySource: source,
      masked: key.maskKey(value),
      transcribeModel: TRANSCRIBE_MODEL,
      agentModel: pi.AGENT_MODEL,
      pi: { kind: launcher.kind, needsDownload: launcher.needsDownload },
      busy: session.isAgentBusy(),
      session: session.sessionInfo(),
    };
  });

  router.add("POST", "/ai/key", async (ctx) => {
    const body = bodyOf(ctx);
    await key.saveStoredKey(body.key);
    // Nunca devolve a chave — so a impressao digital, como o cofre do git faz.
    return { ok: true, masked: key.maskKey(String(body.key ?? "")) };
  });

  router.add("DELETE", "/ai/key", async () => {
    const removed = await key.clearStoredKey();
    return { ok: true, removed };
  });

  router.add("POST", "/ai/transcribe", async (ctx) => {
    const body = bodyOf(ctx);
    const apiKey = await requireKey();
    const language = KNOWN_LANGUAGES.has(body.language) ? body.language : undefined;
    return transcribe({
      apiKey,
      audio: body.audio,
      format: body.format,
      language,
    });
  });

  router.add("POST", "/ai/run", async (ctx) => {
    const body = bodyOf(ctx);
    const utterance = String(body.utterance ?? "").trim();
    if (!utterance) throw new HttpError(400, "error.aiUtteranceRequired");
    const source = body.source === "voice" ? "voice" : "text";

    const apiKey = await requireKey();

    // O retrato do repositorio e lido AGORA, antes de abrir a sessao: sao
    // leituras (`readGit`), nao passam pelo lock e nao esbarram no portao.
    const cwd = process.cwd();
    const [refs, status] = await Promise.all([
      getRefsPayload(cwd),
      getStatus(cwd).catch((e) => { console.error("[gitcraque] ai status fallback:", e.message); return { clean: true, entries: [] }; }),
    ]);

    const state = session.begin({ utterance, source });
    const systemPrompt = buildSystemPrompt({ ...refs, cwd, status });
    const message = buildUserMessage(utterance, source);

    // Segundo plano. Toda falha e capturada: uma rejeicao solta aqui derrubaria
    // o processo inteiro do servidor, e com ele o repositorio aberto.
    void (async () => {
      try {
        const result = await pi.runAgent({
          apiKey,
          systemPrompt,
          message,
          cwd,
          onEvent: (event) => session.emit(event),
          onSpawn: (child) => session.attachChild(child),
        });
        session.finish({
          ok: result.ok,
          text: result.text,
          cost: result.cost,
          // O motivo que o pi deu ganha do codigo de saida: "401 User not
          // found." explica; "exit 1" nao explica nada.
          error: result.ok ? "" : result.error || `exit ${result.code}`,
        });
      } catch (err) {
        session.finish({ ok: false, error: String(err?.message ?? err) });
      }
    })();

    return { id: state.id, startedAt: state.startedAt };
  });

  /**
   * Irma de `/ai/run`, com tres diferencas: o prompt e o de conflito, o
   * raciocinio vai no maximo (`MAX_THINKING`) porque o resultado desta sessao
   * vira commit, e a entrada nao e uma fala — e o estado pendente que o git ja
   * deixou no disco. Mesmo desenho de resposta: devolve na hora e transmite o
   * andamento por `ai:event` / `ai:done` / `ai:error`.
   */
  router.add("POST", "/ai/resolve-conflicts", async () => {
    const apiKey = await requireKey();

    const cwd = process.cwd();
    const [refs, status] = await Promise.all([
      getRefsPayload(cwd),
      getStatus(cwd).catch((e) => { console.error("[gitcraque] ai status fallback:", e.message); return { clean: true, entries: [] }; }),
    ]);

    // Sem operacao pendente nao ha o que resolver, e mandar o agente
    // "resolver conflitos" num repo limpo e pagar por uma sessao que vai
    // mexer no que ninguem pediu.
    const pending = refs?.head?.pending ?? null;
    if (!pending) throw new HttpError(400, "error.noPendingOperation");
    if (!pending.conflicts?.length) throw new HttpError(400, "error.noConflicts");

    const state = session.begin({
      utterance: buildConflictMessage(pending),
      source: "text",
    });
    const systemPrompt = buildConflictSystemPrompt({ ...refs, cwd, status });
    const message = buildConflictMessage(pending);

    void (async () => {
      try {
        const result = await pi.runAgent({
          apiKey,
          systemPrompt,
          message,
          cwd,
          thinking: pi.MAX_THINKING,
          onEvent: (event) => session.emit(event),
          onSpawn: (child) => session.attachChild(child),
        });
        session.finish({
          ok: result.ok,
          text: result.text,
          cost: result.cost,
          error: result.ok ? "" : result.error || `exit ${result.code}`,
        });
      } catch (err) {
        session.finish({ ok: false, error: String(err?.message ?? err) });
      }
    })();

    return { id: state.id, startedAt: state.startedAt };
  });

  router.add("POST", "/ai/abort", () => ({ ok: true, aborted: session.abort() }));
}
