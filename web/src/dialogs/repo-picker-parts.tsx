/**
 * Pecas miudas compartilhadas pelo seletor de repositorios.
 *
 * Existem porque `RepoPicker` e `FavoriteRepos` desenham a MESMA lista com
 * regras diferentes: o mesmo jeito de encurtar caminho, o mesmo vazio, o mesmo
 * esqueleto. Manter duas copias era garantir que uma delas ia envelhecer.
 *
 * O que veio do catalogo: `Skeleton`. O resto sao formatadores puros.
 */
import { Skeleton } from "@/components/motion-ui/skeleton";

/** `/home/ana/code/x` -> `~/code/x`, que e como a pessoa pensa no caminho. */
export function encurtar(caminho: string, home: string) {
  if (home && caminho === home) return "~";
  if (home && caminho.startsWith(`${home}/`)) return `~${caminho.slice(home.length)}`;
  return caminho;
}

/** Ultimo segmento do caminho, em qualquer separador. E o nome padrao do repo. */
export const basename = (caminho: string) =>
  caminho.split(/[\\/]/).filter(Boolean).pop() ?? caminho;

export const relativo = (ms: number) => {
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "agora";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min atras`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h atras`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `${d} dias atras`;
};

export function ListaVazia({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 py-8 text-center text-sm text-muted-foreground">{children}</p>
  );
}

export function Esqueleto() {
  return (
    <div className="space-y-2 p-1">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <Skeleton className="size-4 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3 w-40 rounded" />
            <Skeleton className="h-2.5 w-64 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}
