// Reparte el guion en el tiempo objetivo: cada palabra recibe una ventana
// proporcional a su largo, con pausas extra en la puntuación.

export type Word = {
  text: string
  start: number // segundos
  end: number
  line: number
}

export type Script = {
  words: Word[]
  lines: { start: number; end: number; words: number[] }[]
  totalWords: number
}

const PAUSE_COMMA = 3
const PAUSE_STOP = 7
const PAUSE_PARAGRAPH = 10

export function buildScript(text: string, duration: number, charsPerLine: number): Script {
  const paragraphs = text
    .split(/\n\s*\n|\n/)
    .map((p) => p.trim())
    .filter(Boolean)

  type Raw = { text: string; weight: number; newLine: boolean }
  const raw: Raw[] = []
  paragraphs.forEach((p, pi) => {
    const tokens = p.split(/\s+/).filter(Boolean)
    tokens.forEach((tok, ti) => {
      let weight = tok.replace(/[^\p{L}\p{N}]/gu, '').length + 1
      if (/[,;:—–-]$/.test(tok)) weight += PAUSE_COMMA
      if (/[.!?¡¿…]$/.test(tok)) weight += PAUSE_STOP
      if (ti === tokens.length - 1 && pi < paragraphs.length - 1) weight += PAUSE_PARAGRAPH
      raw.push({ text: tok, weight, newLine: ti === 0 && pi > 0 })
    })
  })

  const totalWeight = raw.reduce((s, w) => s + w.weight, 0) || 1
  const secPerWeight = Math.max(duration, 1) / totalWeight

  const words: Word[] = []
  const lines: Script['lines'] = []
  let t = 0
  let lineChars = 0
  let line = -1

  raw.forEach((w, i) => {
    const len = w.text.length + 1
    if (line === -1 || w.newLine || lineChars + len > charsPerLine) {
      line++
      lineChars = 0
      lines.push({ start: t, end: t, words: [] })
    }
    lineChars += len
    const start = t
    t += w.weight * secPerWeight
    words.push({ text: w.text, start, end: t, line })
    lines[line].words.push(i)
    lines[line].end = t
  })

  return { words, lines, totalWords: words.length }
}

/** Índice de la palabra activa en el instante t (búsqueda binaria). */
export function wordAt(script: Script, t: number): number {
  const { words } = script
  if (!words.length) return -1
  let lo = 0
  let hi = words.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (words[mid].start <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}

export function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
