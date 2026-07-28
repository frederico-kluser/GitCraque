/**
 * Cliente da OpenRouter — so `fetch`, sem SDK.
 *
 * Portado de `huu/src/lib/openrouter.ts`, que ja provava que da para falar com
 * a OpenRouter sem dependencia nenhuma. Aqui isso deixa de ser elegancia e vira
 * requisito: o backend do GitCraque tem exatamente UMA dependencia (`ws`), e
 * este arquivo nao pode ser o segundo.
 *
 * Cobre uma unica rota: a transcricao. O modelo de linguagem nao e chamado
 * daqui — quem fala com ele e o pi, no seu proprio processo (ver `pi.mjs`).
 *
 * ── Sobre a chave ────────────────────────────────────────────────────
 * Ela entra por parametro e sai no cabecalho `Authorization`. Nao e guardada em
 * modulo, nao entra em log, nao entra em mensagem de erro. Se um erro daqui
 * precisar de contexto, o contexto e o status HTTP.
 */

const API_BASE = "https://openrouter.ai/api/v1";

/** Cabecalhos de cortesia que a OpenRouter usa para atribuir a origem. */
const ATTRIBUTION = {
  "HTTP-Referer": "https://github.com/gitcraque",
  "X-Title": "GitCraque",
};

/**
 * O modelo de transcricao.
 *
 * `microsoft/mai-transcribe-1.5` foi escolhido por ser o mais preciso do
 * catalogo em julho de 2026: melhor WER da classe no FLEURS (3,7% em 25
 * idiomas, 43 suportados) e 2,4% no Artificial Analysis, com o portugues entre
 * os idiomas fortes.
 *
 * O que ele NAO entrega por aqui: o "keyword biasing" anunciado pela Microsoft
 * nao e alcancavel pela OpenRouter — o unico endpoint do modelo e o Azure, e os
 * parametros que ele aceita sao `max_tokens`, `temperature`, `top_p` e
 * `max_completion_tokens`. Nenhum campo de vocabulario. Por isso a correcao de
 * nome de branch acontece DEPOIS, no prompt do agente, que recebe a lista real
 * de refs (ver `prompt.mjs`) — e resolve "pagamento pics" em
 * "feature/pagamento-pix" com contexto que a transcricao nunca teria.
 *
 * Trocar de modelo e trocar esta linha. Alternativa muito mais barata, se o
 * custo pesar: `openai/gpt-4o-transcribe`.
 */
export const TRANSCRIBE_MODEL = "microsoft/mai-transcribe-1.5";

/** Teto de espera da transcricao. Acima disso o usuario ja desistiu. */
export const TRANSCRIBE_TIMEOUT_MS = 60_000;

/** Teto da sonda de alcancabilidade — tem de falhar rapido para ser util. */
export const REACH_TIMEOUT_MS = 8_000;

/**
 * Formatos de audio aceitos. `webm` esta aqui porque e o que o `MediaRecorder`
 * do navegador produz — e por a OpenRouter aceitar webm, nao ha transcodificacao
 * no caminho e o `ffmpeg` nunca entra no projeto.
 */
export const AUDIO_FORMATS = ["webm", "ogg", "mp3", "wav", "m4a", "flac", "aac"];

/**
 * @param {string} apiKey
 * @returns {Record<string, string>}
 */
function headers(apiKey) {
  return {
    ...ATTRIBUTION,
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

/**
 * Faz um POST com teto de tempo, sempre limpando o timer.
 * @param {string} path
 * @param {object} body
 * @param {string} apiKey
 * @param {number} timeoutMs
 */
async function post(path, body, apiKey, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: headers(apiKey),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Audio -> texto.
 *
 * @param {object} params
 * @param {string} params.apiKey
 * @param {string} params.audio     audio em base64, sem o prefixo `data:`
 * @param {string} [params.format]  um de `AUDIO_FORMATS`
 * @param {string} [params.language] codigo do idioma ("pt"), ajuda o modelo
 * @param {string} [params.model]
 * @param {typeof fetch} [params.fetchImpl] injetado nos testes; sem isso a
 *   suite do backend precisaria de rede, e ela nao pode precisar
 * @returns {Promise<{text: string, cost: number, seconds: number}>}
 */
export async function transcribe({
  apiKey,
  audio,
  format = "webm",
  language,
  model = TRANSCRIBE_MODEL,
  fetchImpl,
}) {
  const key = String(apiKey ?? "").trim();
  if (!key) {
    const error = new Error("error.aiKeyMissing");
    error.status = 401;
    throw error;
  }
  if (!audio) {
    const error = new Error("error.aiAudioRequired");
    error.status = 400;
    throw error;
  }
  if (!AUDIO_FORMATS.includes(format)) {
    const error = new Error("error.aiAudioFormat");
    error.status = 400;
    error.detail = format;
    throw error;
  }

  const body = { model, input_audio: { data: audio, format } };
  if (language) body.language = language;

  const doPost = fetchImpl
    ? () =>
        fetchImpl(`${API_BASE}/audio/transcriptions`, {
          method: "POST",
          headers: headers(key),
          body: JSON.stringify(body),
        })
    : () => post("/audio/transcriptions", body, key, TRANSCRIBE_TIMEOUT_MS);

  let response;
  try {
    response = await doPost();
  } catch (err) {
    // Rede caida, DNS, ou o AbortController estourando o teto. A causa vai no
    // detalhe; a chave nunca esta na mensagem porque nunca esteve no corpo.
    const error = new Error("error.aiUnreachable");
    error.status = 503;
    error.detail = err?.name === "AbortError" ? "timeout" : String(err?.message ?? err);
    throw error;
  }

  if (!response.ok) {
    const error = new Error(
      response.status === 401 || response.status === 403 ? "error.aiKeyRejected" : "error.aiFailed",
    );
    error.status = response.status === 401 || response.status === 403 ? 401 : 502;
    error.detail = `HTTP ${response.status}`;
    throw error;
  }

  const payload = await response.json();
  const text = typeof payload?.text === "string" ? payload.text.trim() : "";
  return {
    text,
    cost: Number(payload?.usage?.cost) || 0,
    seconds: Number(payload?.usage?.seconds) || 0,
  };
}

/** @typedef {{kind: "ok"} | {kind: "unauthorized"} | {kind: "unreachable", reason: string}} Reachability */

/**
 * Sonda rapida: da para falar com a OpenRouter com esta chave?
 *
 * Existe para falhar em segundos em vez de deixar a pessoa esperando o pi
 * esgotar as proprias tentativas. Herdada do huu, onde o sintoma classico era
 * MTU de VPN — o DNS resolve, o TCP conecta, e o ClientHello do TLS some.
 *
 * @param {string} apiKey
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Reachability>}
 */
export async function checkReachable(apiKey, fetchImpl) {
  const key = String(apiKey ?? "").trim();
  if (!key) return { kind: "unauthorized" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REACH_TIMEOUT_MS);
  try {
    const doGet = fetchImpl
      ? () => fetchImpl(`${API_BASE}/key`, { headers: headers(key) })
      : () => fetch(`${API_BASE}/key`, { headers: headers(key), signal: controller.signal });
    const response = await doGet();
    if (response.ok) return { kind: "ok" };
    if (response.status === 401 || response.status === 403) return { kind: "unauthorized" };
    return { kind: "unreachable", reason: `HTTP ${response.status}` };
  } catch (err) {
    return {
      kind: "unreachable",
      reason: err?.name === "AbortError" ? "timeout" : String(err?.message ?? err),
    };
  } finally {
    clearTimeout(timer);
  }
}
