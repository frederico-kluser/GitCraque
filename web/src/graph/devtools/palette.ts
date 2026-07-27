/**
 * A paleta do app, em dado, para o SVG de exemplo (`docs/graph-sample.svg`).
 *
 * O arquivo de exemplo e um artefato de documentacao: ele e aberto solto, fora
 * do app, entao nao tem `styles/theme.css` para resolver `var(--lane-N)`. Em vez
 * de cravar hex a mao — que sairia do ar assim que o tema mudasse — os MESMOS
 * valores oklch do tema entram aqui como numero e sao convertidos para sRGB na
 * hora de gerar.
 */

/** [L, C, H] exatamente como em `styles/theme.css`. */
export type Oklch = readonly [number, number, number];

export interface Palette {
  lanes: Oklch[];
  background: Oklch;
  surface: Oklch;
  foreground: Oklch;
  muted: Oklch;
  border: Oklch;
  primary: Oklch;
}

export const LIGHT: Palette = {
  lanes: [
    [0.62, 0.17, 258],
    [0.66, 0.17, 150],
    [0.68, 0.18, 60],
    [0.62, 0.21, 12],
    [0.62, 0.19, 305],
    [0.66, 0.14, 200],
    [0.7, 0.16, 100],
    [0.6, 0.16, 340],
  ],
  background: [0.985, 0.002, 250],
  surface: [0.995, 0.001, 250],
  foreground: [0.21, 0.012, 260],
  muted: [0.53, 0.014, 258],
  border: [0.9, 0.006, 258],
  primary: [0.52, 0.16, 258],
};

export const DARK: Palette = {
  lanes: [
    [0.72, 0.16, 258],
    [0.75, 0.16, 150],
    [0.79, 0.16, 72],
    [0.7, 0.19, 15],
    [0.72, 0.17, 305],
    [0.76, 0.13, 200],
    [0.8, 0.15, 105],
    [0.7, 0.15, 340],
  ],
  background: [0.185, 0.012, 262],
  surface: [0.2, 0.013, 262],
  foreground: [0.93, 0.006, 255],
  muted: [0.66, 0.012, 258],
  border: [0.3, 0.014, 262],
  primary: [0.72, 0.14, 258],
};

/**
 * Interpola duas cores em oklch (matiz pelo arco curto).
 * `t = 0` devolve `a`; `t = 1` devolve `b`.
 *
 * Serve para pre-misturar os fundos dos chips com o fundo da pagina em vez de
 * usar `opacity`: cor solida atravessa qualquer renderizador de SVG, e alfa nao.
 */
export function mix(a: Oklch, b: Oklch, t: number): Oklch {
  let delta = b[2] - a[2];
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + delta * t];
}

const gamma = (channel: number): number =>
  channel <= 0.0031308 ? 12.92 * channel : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;

const byte = (channel: number): number =>
  Math.max(0, Math.min(255, Math.round(gamma(channel) * 255)));

/** oklch -> `#rrggbb`. Conversao padrao (oklab -> LMS -> sRGB linear -> gama). */
export function hex([lightness, chroma, hue]: Oklch): string {
  const radians = (hue * Math.PI) / 180;
  const a = chroma * Math.cos(radians);
  const b = chroma * Math.sin(radians);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return `#${[byte(r), byte(g), byte(bb)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}
