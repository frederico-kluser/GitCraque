/**
 * Projetos da maquina: favoritos e recentes.
 *
 * Alimenta o seletor de projeto da toolbar e os comandos de salto do ⌘K. Nao
 * entra no `state/store.ts` de proposito — isto NAO e estado do repositorio
 * aberto, e sim uma lista de caminhos do disco; o store central so guarda o
 * repositorio corrente.
 *
 * Toda falha vira lista vazia, incluindo o 501 que as rotas de favoritos ainda
 * devolvem enquanto a outra frente as implementa: um menu sem favoritos ainda e
 * um menu util, um menu que explode nao e.
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@/lib/api";
import type { FavoriteRepo, RecentRepo } from "@/types/git";

export interface ProjectsState {
  favorites: FavoriteRepo[];
  recents: RecentRepo[];
  loading: boolean;
  /** true depois da primeira resposta — separa "vazio" de "ainda carregando" */
  loaded: boolean;
}

const INITIAL: ProjectsState = { favorites: [], recents: [], loading: false, loaded: false };

let state: ProjectsState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<ProjectsState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};

export const getProjects = () => state;

/** Uma requisicao por vez: o menu pode reabrir antes da anterior responder. */
let inflight: Promise<void> | null = null;

export function loadProjects(): Promise<void> {
  if (inflight) return inflight;
  set({ loading: true });
  inflight = (async () => {
    const [favorites, recents] = await Promise.all([
      api
        .favorites()
        .then((p) => p.entries)
        .catch(() => [] as FavoriteRepo[]),
      api
        .recentRepos()
        .then((p) => p.entries)
        .catch(() => [] as RecentRepo[]),
    ]);
    set({ favorites, recents, loading: false, loaded: true });
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/**
 * Le as duas listas, carregando na primeira montagem. Quem quiser dados frescos
 * (o menu ao abrir, por exemplo) chama `loadProjects()` de novo.
 */
export function useProjects(): ProjectsState {
  const value = useSyncExternalStore(
    subscribe,
    useCallback(() => state, []),
    useCallback(() => INITIAL, []),
  );

  useEffect(() => {
    if (!state.loaded && !state.loading) void loadProjects();
  }, []);

  return value;
}
