/**
 * Captura de microfone pelo `MediaRecorder`.
 *
 * O audio NUNCA vai direto para a OpenRouter: ele sobe para o backend, que
 * guarda a chave. E a mesma disciplina do cofre de credenciais do git — o
 * navegador nunca ve o segredo.
 *
 * O formato gravado e `webm/opus`, que e o que o Chrome e o Firefox produzem
 * nativamente e que a OpenRouter aceita como esta. Nao ha transcodificacao no
 * caminho e o projeto continua sem `ffmpeg`.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** O que o hook sabe sobre o microfone antes de tentar usar. */
export type MicSupport = "unknown" | "ready" | "missing";

export interface VoiceRecorder {
  support: MicSupport;
  recording: boolean;
  /** Abre o microfone. Rejeita quando o navegador nega a permissao. */
  start: () => Promise<void>;
  /** Fecha e devolve o audio em base64, ou "" quando nao gravou nada util. */
  stop: () => Promise<{ audio: string; format: string }>;
  /** Descarta a gravacao em curso sem produzir audio. */
  cancel: () => void;
}

/** Formatos que o navegador pode oferecer, do preferido ao aceitavel. */
const CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/ogg"];

/** O container que a OpenRouter espera, derivado do mime que o browser deu. */
function formatOf(mime: string): string {
  return mime.includes("ogg") ? "ogg" : "webm";
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const candidate of CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return "";
}

/** Blob -> base64 puro, sem o prefixo `data:...;base64,`. */
function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read failed"));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : "");
    };
    reader.readAsDataURL(blob);
  });
}

export function useVoiceRecorder(): VoiceRecorder {
  const [support, setSupport] = useState<MicSupport>("unknown");
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const ok =
      typeof navigator !== "undefined" &&
      typeof MediaRecorder !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      pickMimeType() !== "";
    setSupport(ok ? "ready" : "missing");
  }, []);

  /** Solta o microfone. Sem isto o indicador de gravacao fica aceso no browser. */
  const release = useCallback(() => {
    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    const mimeType = pickMimeType();
    if (!mimeType) throw new Error("unsupported");
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;
    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }, []);

  const stop = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return { audio: "", format: "webm" };
    const mime = recorder.mimeType || "audio/webm";
    // `onstop` dispara depois do ultimo `ondataavailable`, entao os pedacos so
    // estao completos aqui dentro. Parar e ler na mesma tick perderia o final.
    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: mime }));
      recorder.stop();
    });
    release();
    setRecording(false);
    // Silencio absoluto ainda produz alguns bytes de cabecalho; abaixo disso
    // nao havia fala nenhuma e nao vale gastar uma chamada de transcricao.
    if (blob.size < 1_024) return { audio: "", format: formatOf(mime) };
    return { audio: await toBase64(blob), format: formatOf(mime) };
  }, [release]);

  const cancel = useCallback(() => {
    try {
      recorderRef.current?.stop();
    } catch {
      /* ja parado — soltar o microfone abaixo e o que importa */
    }
    release();
    setRecording(false);
  }, [release]);

  return { support, recording, start, stop, cancel };
}
