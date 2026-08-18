/**
 * Carga do visualizador — uma requisicao por arquivo, cancelavel.
 *
 * Nao ha hook de dados no catalogo do Motion UI (ele e de movimento e forma),
 * entao o carregamento e escrito a mao aqui.
 *
 * O ponto do modulo e a corrida: clicar rapido em tres arquivos dispara tres
 * requisicoes que podem voltar fora de ordem, e a mais lenta sobrescreveria a
 * do arquivo que esta na tela. Cada carga carrega o seu `AbortController`; a
 * limpeza do efeito aborta o anterior e a resposta so e aceita se o sinal dela
 * ainda estiver vivo.
 *
 * O `signal` NAO vai para o `fetch`: `lib/api.ts` e arquivo congelado e o seu
 * `request()` nao recebe `RequestInit` nas rotas GET. O controller aqui e o
 * token de validade da resposta — a requisicao morta ate chega, mas nao entra
 * no estado. E o que o requisito pede: resposta obsoleta nunca sobrescreve a
 * atual.
 */
import { useEffect, useRef, useState } from "react";
import { api, ApiRequestError } from "@/lib/api";
import type { DiffPayload, FileContentPayload } from "@/types/git";
import type { OpenFile } from "@/state/store";

export interface Resource<T> {
  data: T | null;
  /** mensagem pronta para exibir NO PAINEL (nunca em toast) */
  error: string | null;
  loading: boolean;
}

const EMPTY: Resource<never> = { data: null, error: null, loading: false };

function describe(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.payload.detail || error.payload.error || error.message;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Carrega `key` quando `enabled`. Trocar de `key` cancela o que estava em voo;
 * desligar `enabled` NAO joga fora o que ja carregou para a mesma `key` — e o
 * que faz ir e voltar entre as abas nao piscar o esqueleto de novo.
 */
function useResource<T>(
  key: string | null,
  enabled: boolean,
  load: (signal: AbortSignal) => Promise<T>,
): Resource<T> {
  // `load` fecha sobre props e muda a cada render; so `key` decide recarregar.
  const loadRef = useRef(load);
  loadRef.current = load;

  const loadedKey = useRef<string | null>(null);
  const [state, setState] = useState<Resource<T>>(EMPTY);

  useEffect(() => {
    if (!key) {
      loadedKey.current = null;
      setState(EMPTY);
      return;
    }
    // Chave nova com a aba desligada: o que esta em `state` e do arquivo
    // ANTERIOR. Limpa agora, carrega quando a aba acender.
    if (!enabled) {
      if (loadedKey.current !== key) {
        loadedKey.current = null;
        setState(EMPTY);
      }
      return;
    }
    if (loadedKey.current === key) return;

    const controller = new AbortController();
    setState({ data: null, error: null, loading: true });
    loadRef.current(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        loadedKey.current = key;
        setState({ data, error: null, loading: false });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        loadedKey.current = null;
        setState({ data: null, error: describe(error), loading: false });
      },
    );
    return () => controller.abort();
  }, [key, enabled]);

  return state;
}

/** Identidade de um arquivo aberto: commit + caminho. */
const fileKey = (file: OpenFile | null) =>
  file ? `${file.hash ?? "@worktree"}::${file.path}` : null;

/**
 * O patch do arquivo — `api.diff` devolve UMA entrada por arquivo, entao a
 * lista vem filtrada pelo caminho pedido.
 *
 * `wordDiff` liga o highlight intra-linha no backend (comando separado com
 * `--word-diff=porcelain`). Parametro aditivo, default false: quem nao pede
 * recebe o patch classico, byte a byte.
 */
export function useDiffResource(
  file: OpenFile | null,
  enabled: boolean,
  wordDiff = false,
): Resource<DiffPayload[]> {
  return useResource(fileKey(file), enabled, () =>
    api.diff(
      file?.hash
        ? { hash: file.hash, path: file.path, ...(wordDiff ? { wordDiff: true } : {}) }
        : { path: file?.path, ...(wordDiff ? { wordDiff: true } : {}) },
    ),
  );
}

/** O conteudo do arquivo — alimenta tanto "Formatado" quanto "Cru". */
export function useFileContentResource(
  file: OpenFile | null,
  enabled: boolean,
): Resource<FileContentPayload> {
  return useResource(fileKey(file), enabled, () =>
    api.file({ path: file?.path ?? "", hash: file?.hash ?? undefined }),
  );
}
