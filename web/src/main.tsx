import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionUIThemeProvider } from "@/components/motion-ui/ui-theme";
import motionTheme from "../motion.theme";
import { App } from "@/app/App";
import "@/styles/theme.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root nao encontrado");

createRoot(root).render(
  <StrictMode>
    {/* Montado UMA vez na raiz: sem ele toda secao Motion UI cai nos defaults. */}
    <MotionUIThemeProvider theme={motionTheme}>
      <App />
    </MotionUIThemeProvider>
  </StrictMode>,
);
