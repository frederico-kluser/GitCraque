import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionUIThemeProvider } from "@/components/motion-ui/ui-theme";
import motionTheme from "../motion.theme";
import { LocaleBoundary } from "@/i18n";
import { App } from "@/app/App";
import "@/styles/theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root nao encontrado");

/**
 * `?mock=1` liga o backend falso de desenvolvimento (`lib/__mock__`), que
 * intercepta fetch e WebSocket para a casca poder ser inspecionada sem o
 * servidor. Desligado por padrao: o import so acontece com a flag na url, entao
 * em producao o modulo nem entra no bundle principal.
 */
if (new URLSearchParams(location.search).has("mock")) {
  const { installMock } = await import("@/lib/__mock__/install");
  installMock();
}

createRoot(root).render(
  <StrictMode>
    {/* Montado UMA vez na raiz: sem ele toda secao Motion UI cai nos defaults. */}
    <MotionUIThemeProvider theme={motionTheme}>
      {/* Trocar de idioma remonta a arvore: metade do texto do app nasce fora
          de componente (acoes, toasts, motor de DND) e nao re-renderizaria
          sozinho. Ver `i18n/store.ts`. */}
      <LocaleBoundary>
        <App />
      </LocaleBoundary>
    </MotionUIThemeProvider>
  </StrictMode>,
);
