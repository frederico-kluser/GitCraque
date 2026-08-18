/**
 * Coluna direita: UMA tela por vez.
 *
 *   Detalhe  → metadados do commit selecionado e a lista de arquivos; sem commit
 *              selecionado, as alteracoes em aberto da arvore de trabalho (o padrao)
 *   View     → o conteudo do arquivo aberto, com voltar no cabecalho
 *
 * Antes eram duas gavetas empilhadas com divisoria arrastavel, e o painel de
 * alteracoes era uma aba da de baixo. Nao se sustentou: numa coluna de 560 px,
 * dividir a altura em duas dava meia tela para cada coisa, e ler um diff em meia
 * tela e o mesmo que nao ler. Agora o detalhe ocupa a coluna inteira, o arquivo
 * clicado TOMA a coluna inteira, e as alteracoes viraram uma gaveta chamada pelo
 * botao de commit da toolbar (`ChangesSheet`).
 *
 * Nao ha estado proprio de "qual tela": ela e derivada de `openFile` no store.
 * Um booleano ao lado poderia discordar do arquivo aberto — e discordaria, na
 * primeira vez que o store limpasse o arquivo por conta propria (troca de
 * worktree, refresh).
 *
 * CASCATA: o catalogo do Motion UI nao tem troca de tela sem tablist — o
 * `SmoothTabs`, que servia as abas antigas, exige as abas visiveis, e aqui a
 * navegacao e o clique num arquivo, nao uma aba. As duas telas ficam na MESMA
 * celula de um grid e trocam por crossfade com `AnimatePresence`; tempo e curva
 * saem do tema.
 */
import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMotionUITheme, useMotionUITransition } from "@/components/motion-ui/ui-theme";
import { closeBlame, closeFile, useAppState } from "@/state/store";
import { t } from "@/i18n";
import { cn } from "@/lib/utils";
import type { PanelProps } from "@/types/modules";
import { BlamePanel } from "./BlamePanel";
import { DetailPanel } from "./DetailPanel";
import { FileViewPanel } from "./FileViewPanel";

export function SidePanel({ className }: PanelProps) {
  const openFile = useAppState((s) => s.openFile);
  const openBlame = useAppState((s) => s.openBlame);
  const primary = useAppState((s) => s.selection.primary);
  const ui = useMotionUITransition("ui");
  const { motionMode } = useMotionUITheme();
  const still = motionMode === "off";

  /**
   * Selecionar outro commit e um pedido para ver AQUELE commit: a View do
   * arquivo anterior e o blame saem de cena sozinhos.
   */
  const lastPrimary = useRef(primary);
  useEffect(() => {
    if (lastPrimary.current !== primary) {
      lastPrimary.current = primary;
      closeFile();
      closeBlame();
    }
  }, [primary]);

  return (
    <aside className={cn("relative grid min-h-0 min-w-0", className)} aria-label={t("side.label")}>
      {/* Uma celula so: as duas telas se sobrepoem enquanto o crossfade corre,
          sem posicionamento absoluto e sem a coluna pular de altura. */}
      <AnimatePresence initial={false}>
        <motion.div
          key={openBlame ? "blame" : openFile ? "view" : "detail"}
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={still ? undefined : { opacity: 0 }}
          transition={{ ...ui }}
          className="col-start-1 row-start-1 grid min-h-0 min-w-0 bg-card"
        >
          {openBlame ? (
            <BlamePanel className="min-h-0" path={openBlame.path} hash={openBlame.hash} />
          ) : openFile ? (
            <FileViewPanel className="min-h-0" file={openFile} />
          ) : (
            <DetailPanel className="min-h-0" />
          )}
        </motion.div>
      </AnimatePresence>
    </aside>
  );
}
