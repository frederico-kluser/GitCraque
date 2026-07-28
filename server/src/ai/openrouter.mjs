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
 * A restricao que manda aqui NAO e a acuracia — e o container. O gravador do
 * navegador entrega webm/opus e nao tem escolha: o Chrome so oferece webm
 * (`MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")` e `false`), entao
 * um modelo que recuse webm deixa a funcao inteira morta.
 *
 * `microsoft/mai-transcribe-1.5` estava aqui e era exatamente esse caso. Ele so
 * roda na Azure, e a Azure recusa webm com 400 — medido, junto com m4a. O
 * sintoma era `{"error":"a transcricao falhou","detail":"HTTP 400"}` em toda
 * gravacao, em qualquer navegador.
 *
 * `openai/whisper-large-v3-turbo` roda no Groq, aceita os seis containers
 * testados e responde em ~350 ms. De quebra custa $0,04/h contra $0,36/h.
 *
 * Trocar de modelo e trocar esta linha — mas o modelo novo precisa de uma
 * entrada em `MODEL_AUDIO_FORMATS` que cubra `RECORDER_FORMATS`, e ha teste
 * que cobra isso.
 */
export const TRANSCRIBE_MODEL = "openai/whisper-large-v3-turbo";

/** Teto de espera da transcricao. Acima disso o usuario ja desistiu. */
export const TRANSCRIBE_TIMEOUT_MS = 60_000;

/** Teto da sonda de alcancabilidade — tem de falhar rapido para ser util. */
export const REACH_TIMEOUT_MS = 8_000;

/**
 * Containers que o gravador do navegador consegue emitir.
 *
 * Espelha o que `formatOf()` devolve em `web/src/hooks/useVoiceRecorder.ts` —
 * o gravador so produz estes dois, e na pratica quase sempre o primeiro. E a
 * lista que qualquer modelo candidato precisa cobrir inteira.
 */
export const RECORDER_FORMATS = ["webm", "ogg"];

/**
 * Containers aceitos POR MODELO.
 *
 * Medido contra a API, um POST por container, nao copiado da documentacao: a
 * lista generica da OpenRouter menciona webm, mas quem aceita ou recusa e o
 * provider por tras do modelo, e os dois discordam. Foi essa confusao que
 * manteve a transcricao quebrada — a lista antiga era global e dizia que webm
 * servia para todo mundo.
 *
 * `microsoft/mai-transcribe-1.5` fica registrado como o contra-exemplo: ele
 * existe, funciona, e simplesmente nao serve para audio de navegador.
 */
export const MODEL_AUDIO_FORMATS = {
  "openai/whisper-large-v3-turbo": ["webm", "ogg", "mp3", "wav", "m4a", "flac"],
  "microsoft/mai-transcribe-1.5": ["ogg", "mp3", "wav", "flac"],
};

/** Containers aceitos pelo modelo em uso. */
export const AUDIO_FORMATS = MODEL_AUDIO_FORMATS[TRANSCRIBE_MODEL];

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
 * @param {string} [params.format]  um container aceito pelo modelo em uso
 * @param {string} [params.language] codigo do idioma ("pt"), ajuda o modelo.
 *   Nem todo provider declara suportar — os que nao declaram ignoram, medido;
 *   a OpenRouter nao recusa a chamada por causa dele
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
  // Contra os formatos do modelo que VAI ser chamado, nao contra uma lista
  // global: quem aceita o container e o provider por tras do modelo. Recusar
  // aqui troca um "HTTP 400" opaco vindo de fora por uma mensagem que diz qual
  // formato falhou.
  const accepted = MODEL_AUDIO_FORMATS[model] ?? AUDIO_FORMATS;
  if (!accepted.includes(format)) {
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
