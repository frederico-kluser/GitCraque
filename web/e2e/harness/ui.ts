/**
 * Helpers de UI das specs. Disciplina do repo:
 *  - sem data-testid no app (verificado) — tudo por roles/textos i18n;
 *  - imports relativos com extensao explicita (nao ha bundler aqui);
 *  - o catalogo pt e importado COMO DADO para resolver textos por chave;
 *  - o grafo e virtualizado (react-window): linhas fora do viewport nao
 *    existem no DOM — `scrollGraphTo` rola o container da lista quando o alvo
 *    ainda nao foi montado.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import { LOCALE_STORAGE_KEY } from "../../src/i18n/detect.ts";
import { pt } from "../../src/i18n/locales/pt.ts";

/** Idioma fixo das specs — o app fala pt em toda a campanha. */
export const LOCALE = "pt" as const;

/** Linhas de commit: o rowgroup do react-window abriga as rows. */
const ROWGROUP = '[role="rowgroup"]';
const ROW = '[role="rowgroup"] [role="row"]';

/**
 * Abre o app com o locale pt GRAVADO antes do primeiro script da pagina:
 * `addInitScript` roda antes de qualquer carregamento, entao a deteccao de
 * idioma do app (localStorage -> navegador) ja encontra o pt.
 */
export async function openApp(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    localStorage.setItem(key, "pt");
  }, LOCALE_STORAGE_KEY);
  await page.goto("/");
}

/** O grafo terminou de carregar: a primeira linha de commit esta no DOM. */
export async function waitForGraph(page: Page, { timeout = 20_000 }: { timeout?: number } = {}): Promise<void> {
  await expect(page.locator(ROW).first()).toBeVisible({ timeout });
}

/** A linha do commit cujo assunto contem `subject` (dentro do grafo). */
export function graphCommitRow(page: Page, subject: string): Locator {
  return page.locator(ROW, { hasText: subject });
}

/** O chip de ref (branch/tag/HEAD) chamado `name`, dentro do grafo. */
export function branchChip(page: Page, name: string): Locator {
  return page.locator(ROWGROUP).getByText(name, { exact: true }).first();
}

/**
 * Rola o container da lista ate a linha de `subject` entrar no DOM/esteja
 * visivel. Direcao default: para baixo (o topo do grafo e o commit mais novo;
 * commits antigos ficam no fundo da lista).
 */
export async function scrollGraphTo(
  page: Page,
  subject: string,
  { direction = "down", timeoutMs = 30_000 }: { direction?: "up" | "down"; timeoutMs?: number } = {},
): Promise<void> {
  const row = graphCommitRow(page, subject);
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const mounted = (await row.count()) > 0;
    if (mounted && (await row.first().isVisible().catch(() => false))) return;
    if (Date.now() > deadline) {
      const mounted = (await row.count()) > 0;
      throw new Error(
        `nao achei a linha "${subject}" no grafo em ${timeoutMs} ms. ` +
          (mounted
            ? `A linha existe mas ficou fora do viewport (rolagem parada?).`
            : `A linha nunca foi montada (subject errado ou historico sem esse commit?).`),
      );
    }
    const moved = await page.evaluate((dir) => {
      const group = document.querySelector('[role="rowgroup"]');
      if (!group) return false;
      let el = group.parentElement as HTMLElement | null;
      while (el) {
        const overflowY = getComputedStyle(el).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") {
          const before = el.scrollTop;
          el.scrollTop += dir === "down" ? el.clientHeight * 0.8 : -el.clientHeight * 0.8;
          return el.scrollTop !== before;
        }
        el = el.parentElement;
      }
      return false;
    }, direction);
    if (!moved) {
      throw new Error(
        `nao achei um container de rolagem vertical no grafo para buscar "${subject}".`,
      );
    }
    await page.waitForTimeout(90);
  }
}

/**
 * Clica num controle pelo TEXTO PT da chave do catalogo (role=button primeiro,
 * fallback para texto puro). `vars` interpola as chaves com `{nome}` do
 * catalogo (ex.: "common.holdTo": "Segure para {action}").
 */
export async function clickByI18nKey(
  page: Page,
  key: string,
  vars?: Record<string, string | number>,
): Promise<void> {
  const raw = pt[key as keyof typeof pt];
  if (!raw) throw new Error(`chave i18n desconhecida no catalogo pt: ${key}`);
  const label = vars
    ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
    : raw;
  const byRole = page.getByRole("button", { name: label, exact: true }).first();
  try {
    await byRole.waitFor({ state: "visible", timeout: 5_000 });
    await byRole.click();
    return;
  } catch {
    /* o controle nao e um <button> (menus, linhas, itens) — cai no texto */
  }
  const byText = page.getByText(label, { exact: true }).first();
  await byText.waitFor({ state: "visible", timeout: 5_000 });
  await byText.click();
}

/**
 * O toast de conclusao apareceu com o texto exato. Os toasts de sucesso se
 * fecham sozinhos em 5 s (store.ts), entao chame logo apos a acao.
 */
export async function expectToast(page: Page, texto: string, timeout = 8_000): Promise<void> {
  await expect(page.getByText(texto, { exact: true })).toBeVisible({ timeout });
}
