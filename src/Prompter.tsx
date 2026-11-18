import { useEffect, useRef, useState } from 'react'
import { buildScript, wordAt, type Script } from './pacing'

type Props = {
  text: string
  duration: number
  time: number
  fontSize: number
  visibleLines: number
  onScript?: (s: Script) => void
}

/** Texto tipo subtítulo que avanza al ritmo del tiempo objetivo. */
export function Prompter({ text, duration, time, fontSize, visibleLines, onScript }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const charsPerLine = Math.max(12, Math.floor(width / (fontSize * 0.58)))
  const [script, setScript] = useState<Script>(() => buildScript(text, duration, charsPerLine))

  useEffect(() => {
    const s = buildScript(text, duration, charsPerLine)
    setScript(s)
    onScript?.(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, duration, charsPerLine])

  const idx = time < 0 ? -1 : wordAt(script, time)
  const current = idx >= 0 ? script.words[idx] : null
  const lineIdx = current?.line ?? 0
  const line = script.lines[lineIdx]
  // Desplazamiento suave: avanza dentro de la línea según el tiempo.
  const frac = line && line.end > line.start
    ? Math.min(1, Math.max(0, (time - line.start) / (line.end - line.start)))
    : 0
  // La línea activa queda arriba; en su último 25% se desliza hacia la siguiente.
  const scrollLines = lineIdx + Math.max(0, (frac - 0.75) / 0.25)
  const lineHeight = Math.round(fontSize * 1.45)
  const finished = script.words.length > 0 && time >= script.words[script.words.length - 1].end

  return (
    <div
      ref={boxRef}
      className="prompter"
      style={{ height: lineHeight * visibleLines, fontSize, lineHeight: `${lineHeight}px` }}
    >
      <div
        className="prompter-track"
        style={{
          transform: `translateY(${-((finished ? lineIdx : scrollLines) - (visibleLines >= 3 ? 1 : 0)) * lineHeight}px)`,
        }}
      >
        {script.lines.map((l, li) => (
          <div
            key={li}
            className={'p-line' + (li < lineIdx ? ' past' : li === lineIdx ? ' active' : '')}
            style={{ height: lineHeight }}
          >
            {l.words.map((wi) => {
              const w = script.words[wi]
              const state = finished || wi < idx ? 'read' : wi === idx ? 'now' : 'next'
              return (
                <span key={wi} className={'w ' + state}>
                  {w.text}{' '}
                </span>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
