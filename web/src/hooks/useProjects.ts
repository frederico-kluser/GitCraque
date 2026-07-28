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
import { t } from "@/i18n";
import { api } from "@/lib/api";
import { toast } from "@/state/store";
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
 * Fixa ou desfixa um projeto — a estrela do menu de projetos da toolbar.
 *
 * Pinta na hora e volta atras se o servidor recusar, porque o menu fecha no
 * clique: sem a pintura otimista a estrela so mudaria na proxima abertura, e
 * quem clicou concluiria que o botao nao funciona.
 *
 * Nao reaproveita o `useFavoritos` do RepoPicker de proposito: aquele e estado
 * de dialogo, montado e desmontado com ele, e mora em `dialogs/**` — outra
 * frente. Este e do menu, que vive na casca. As duas listas se reencontram na
 * releitura: o menu chama `loadProjects()` ao abrir, o dialogo relê ao montar.
 */
export async function toggleFavorite(path: string, name?: string): Promise<void> {
  const fixado = state.favorites.some((f) => f.path === path);
  const anterior = state.favorites;

  set({
    favorites: fixado
      ? anterior.filter((f) => f.path !== path)
      : [
          ...anterior,
          {
            path,
            label: "",
            name: name || path.split(/[\\/]/).filter(Boolean).pop() || path,
            branch: null,
            order: anterior.length,
            addedAt: Date.now(),
            exists: true,
          },
        ],
  });

  try {
    const payload = fixado ? await api.removeFavorite(path) : await api.addFavorite({ path });
    set({ favorites: payload.entries });
  } catch (e) {
    set({ favorites: anterior });
    toast(
      "error",
      fixado ? t("favorites.error.unpin") : t("favorites.error.pin"),
      e instanceof Error ? e.message : String(e),
    );
  }
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
