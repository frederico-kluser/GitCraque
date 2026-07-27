/**
 * Detalhe de commit com cache por hash e descarte de resposta obsoleta.
 *
 * Commit e imutavel: uma vez lido, `api.commit(hash)` nunca muda — entao o
 * cache e de modulo (sobrevive a remontagem do painel) e limitado, e o unico
 * cuidado real e ignorar a resposta que chega depois de o usuario ja ter
 * clicado em outro commit (AbortController + guarda por hash).
 */
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { CommitDetail, DiffPayload } from "@/types/git";

const CACHE_CAP = 120;
const detailCache = new Map<string, CommitDetail>();
const diffCache = new Map<string, DiffPayload[]>();

function remember<T>(cache: Map<string, T>, key: string, value: T) {
  cache.set(key, value);
  if (cache.size > CACHE_CAP) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export interface AsyncResource<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Carrega `GET /api/commit/:hash`. `hash` nulo devolve o recurso vazio. */
export function useCommitDetail(hash: string | null): AsyncResource<CommitDetail> {
  const [resource, setResource] = useState<AsyncResource<CommitDetail>>(() => ({
    data: hash ? (detailCache.get(hash) ?? null) : null,
    loading: false,
    error: null,
  }));
  // Guarda o hash pedido por ultimo: resposta de hash diferente e descartada.
  const latest = useRef<string | null>(hash);

  useEffect(() => {
    latest.current = hash;
    if (!hash) {
      setResource({ data: null, loading: false, error: null });
      return;
    }
    const cached = detailCache.get(hash);
    if (cached) {
      setResource({ data: cached, loading: false, error: null });
      return;
    }

    setResource({ data: null, loading: true, error: null });
    let alive = true;
    api
      .commit(hash)
      .then((detail) => {
        remember(detailCache, hash, detail);
        if (alive && latest.current === hash) setResource({ data: detail, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (alive && latest.current === hash)
          setResource({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      });

    return () => {
      alive = false;
    };
  }, [hash]);

  return resource;
}

/** Carrega `GET /api/diff?hash=…` — o patch do commit inteiro. */
export function useCommitDiff(hash: string | null, enabled: boolean): AsyncResource<DiffPayload[]> {
  const [resource, setResource] = useState<AsyncResource<DiffPayload[]>>(() => ({
    data: hash ? (diffCache.get(hash) ?? null) : null,
    loading: false,
    error: null,
  }));
  const latest = useRef<string | null>(hash);

  useEffect(() => {
    latest.current = hash;
    if (!hash || !enabled) {
      setResource((r) => (r.loading ? { ...r, loading: false } : r));
      return;
    }
    const cached = diffCache.get(hash);
    if (cached) {
      setResource({ data: cached, loading: false, error: null });
      return;
    }

    setResource({ data: null, loading: true, error: null });
    let alive = true;
    api
      .diff({ hash })
      .then((files) => {
        remember(diffCache, hash, files);
        if (alive && latest.current === hash) setResource({ data: files, loading: false, error: null });
      })
      .catch((e: unknown) => {
        if (alive && latest.current === hash)
          setResource({ data: null, loading: false, error: e instanceof Error ? e.message : String(e) });
      });

    return () => {
      alive = false;
    };
  }, [hash, enabled]);

  return resource;
}
