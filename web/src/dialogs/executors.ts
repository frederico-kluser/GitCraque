/**
 * A ponte entre a opcao de uma intencao (`endpoint` + `body`, ambos texto) e o
 * cliente REST tipado.
 *
 * O motor de DND e puro e nao pode importar `api.ts`; ele descreve a rota. Quem
 * traduz e este arquivo, e o `switch` abaixo cobre EXATAMENTE as rotas que
 * `INTENT_ENDPOINTS` pode emitir — rota nova sem caso aqui vira erro visivel no
 * toast em vez de falha silenciosa.
 */
import { api } from "@/lib/api";
import { t } from "@/i18n";
import { runOperation, toast } from "@/state/store";
import type { DragIntentOption, GitCommandResult } from "@/types/git";
import { INTENT_ENDPOINTS } from "@/dnd/intents";

const asString = (v: unknown): string => (typeof v === "string" ? v : "");
const asOptionalString = (v: unknown): string | undefined =>
  typeof v === "string" && v ? v : undefined;
const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Executa a opcao confirmada pelo usuario, com o envelope padrao do store. */
export function executeIntentOption(
  option: DragIntentOption,
): Promise<GitCommandResult | null> {
  const body = option.body;

  switch (option.endpoint) {
    case INTENT_ENDPOINTS.cherryPick:
      return runOperation(
        option.label,
        () =>
          api.cherryPick({
            commits: asStrings(body.commits),
            onto: asOptionalString(body.onto),
          }),
        { refresh: "all", successMessage: t("exec.cherryPick.done") },
      );

    case INTENT_ENDPOINTS.merge:
      return runOperation(
        option.label,
        () =>
          api.merge({
            source: asString(body.source),
            into: asOptionalString(body.into),
          }),
        { refresh: "all", successMessage: t("exec.merge.done") },
      );

    case INTENT_ENDPOINTS.rebase:
      return runOperation(
        option.label,
        () =>
          api.rebase({
            source: asString(body.source),
            onto: asString(body.onto),
          }),
        { refresh: "all", successMessage: t("exec.rebase.done") },
      );

    case INTENT_ENDPOINTS.deleteBranchLocal:
      return runOperation(
        option.label,
        () =>
          api.deleteBranchLocal({
            name: asString(body.name),
            force: body.force === true,
          }),
        { refresh: "refs", successMessage: t("exec.deleteLocal.done") },
      );

    case INTENT_ENDPOINTS.deleteBranchRemote:
      return runOperation(
        option.label,
        () =>
          api.deleteBranchRemote({
            remote: asString(body.remote),
            name: asString(body.name),
          }),
        { refresh: "refs", successMessage: t("exec.deleteRemote.done") },
      );

    default:
      toast(
        "error",
        t("exec.unknownRoute"),
        t("exec.unknownRoute.body", { endpoint: option.endpoint }),
      );
      return Promise.resolve(null);
  }
}
