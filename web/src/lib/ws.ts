/**
 * Cliente WebSocket com reconexao exponencial e barramento tipado.
 *
 * O evento mais importante e `cwd:changed`: ele chega depois que o backend
 * executou process.chdir(<worktree>) e significa que TODA a View Tree deve ser
 * recarregada a partir do novo diretorio.
 */
import type { ClientEvent, ServerEvent } from "@/types/git";

type Handler<E extends ServerEvent["type"]> = (
  event: Extract<ServerEvent, { type: E }>,
) => void;

export type ConnectionState = "connecting" | "open" | "closed" | "reconnecting";

export class GitCraqueSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<(e: ServerEvent) => void>>();
  private stateHandlers = new Set<(s: ConnectionState) => void>();
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private closedByUser = false;
  private _state: ConnectionState = "closed";

  constructor(private readonly url = defaultUrl()) {}

  get state() {
    return this._state;
  }

  connect() {
    this.closedByUser = false;
    this.open();
  }

  /**
   * Reconecta AGORA, sem esperar o backoff.
   *
   * Existe por causa da aba congelada: o navegador para as filas de tarefa, o
   * `setTimeout` do backoff nao dispara enquanto ela estiver de fundo, e ao
   * voltar ainda restam ate cinco segundos de espera com a tela mostrando dados
   * de antes. Quem volta para a aba quer o repositorio de agora.
   */
  reconnectNow() {
    this.closedByUser = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
    this.attempt = 0;

    const stale = this.ws;
    this.ws = null;
    if (stale) {
      // Desarmar os handlers ANTES de fechar: o `onclose` agendaria outra
      // reconexao por backoff e ficariamos com dois sockets vivos disputando os
      // mesmos eventos.
      stale.onopen = null;
      stale.onmessage = null;
      stale.onclose = null;
      stale.onerror = null;
      try {
        stale.close();
      } catch {
        /* socket ja morto: fechar de novo nao muda nada */
      }
    }
    this.open();
  }

  /**
   * Ida e volta de `ping`/`pong` para saber se a conexao esta MESMO viva.
   *
   * `readyState === OPEN` mente depois de um congelamento: o servidor derruba a
   * conexao enquanto a aba dorme, o FIN nunca e processado, e o socket volta
   * meio-aberto — anunciando-se aberto, engolindo tudo o que se manda e nunca
   * mais entregando nada. Sem esta sonda o app fica parado com cara de
   * conectado, que e o pior dos dois mundos.
   *
   * Usa o `ping` que ja esta no contrato (`server/src/ws/hub.mjs`): nenhum
   * evento novo, nenhuma rota nova.
   */
  probe(timeoutMs = 2_000): Promise<boolean> {
    if (this.ws?.readyState !== WebSocket.OPEN) return Promise.resolve(false);
    return new Promise((resolve) => {
      let settled = false;
      const finish = (alive: boolean) => {
        if (settled) return;
        settled = true;
        off();
        clearTimeout(timer);
        resolve(alive);
      };
      const off = this.on("pong", () => finish(true));
      const timer = setTimeout(() => finish(false), timeoutMs);
      this.send({ type: "ping", ts: Date.now() });
    });
  }

  private setState(s: ConnectionState) {
    if (this._state === s) return;
    this._state = s;
    for (const h of this.stateHandlers) h(s);
  }

  private open() {
    this.setState(this.attempt === 0 ? "connecting" : "reconnecting");
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.setState("open");
      this.heartbeat = setInterval(() => this.send({ type: "ping", ts: Date.now() }), 25_000);
    };

    ws.onmessage = (ev) => {
      let parsed: ServerEvent;
      try {
        parsed = JSON.parse(ev.data as string) as ServerEvent;
      } catch {
        return;
      }
      this.dispatch(parsed);
    };

    ws.onclose = () => {
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      this.ws = null;
      if (this.closedByUser) {
        this.setState("closed");
        return;
      }
      this.setState("reconnecting");
      const delay = Math.min(200 * 2 ** this.attempt++, 5_000);
      this.timer = setTimeout(() => this.open(), delay);
    };

    ws.onerror = () => ws.close();
  }

  private dispatch(event: ServerEvent) {
    const exact = this.handlers.get(event.type);
    if (exact) for (const h of exact) h(event);
    const all = this.handlers.get("*");
    if (all) for (const h of all) h(event);
  }

  on<E extends ServerEvent["type"]>(type: E, handler: Handler<E>): () => void;
  on(type: "*", handler: (e: ServerEvent) => void): () => void;
  on(type: string, handler: (e: never) => void): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const fn = handler as unknown as (e: ServerEvent) => void;
    set.add(fn);
    return () => set!.delete(fn);
  }

  onState(handler: (s: ConnectionState) => void) {
    this.stateHandlers.add(handler);
    handler(this._state);
    return () => this.stateHandlers.delete(handler);
  }

  send(event: ClientEvent) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(event));
  }

  close() {
    this.closedByUser = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.ws?.close();
  }
}

function defaultUrl() {
  // `socket` e construido no carregamento do modulo. Sem esta guarda, QUALQUER
  // import que alcance este arquivo fora do navegador estoura com
  // "location is not defined" — foi o que derrubou os testes de DOM do grafo
  // quando o chip de ref passou a importar o motor de DND, que puxa o store,
  // que puxa este arquivo. Construir a url nao pode depender de haver janela.
  if (typeof location === "undefined") return "ws://127.0.0.1:5271/ws";
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${location.host}/ws`;
}

/** Instancia unica do app. */
export const socket = new GitCraqueSocket();
