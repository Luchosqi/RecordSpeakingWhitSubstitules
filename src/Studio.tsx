import type React from "react"
import { useCallback, useEffect, useRef, useState } from 'react'
import { Prompter } from './Prompter'
import { fmt, wordAt, type Script } from './pacing'
import type { Settings } from './settings'

export type Take = {
  id: string
  n: number
  url: string
  blob: Blob
  duration: number
  createdAt: Date
  ext: string
  fav: boolean
}

type Phase = 'idle' | 'countdown' | 'running'

function pickMime(): { mime: string; ext: string } {
  const opts = [
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
    { mime: 'video/mp4;codecs=avc1,mp4a', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
  ]
  if (typeof MediaRecorder === 'undefined') return { mime: '', ext: 'webm' }
  return opts.find((o) => MediaRecorder.isTypeSupported(o.mime)) ?? { mime: '', ext: 'webm' }
}

export function Studio({
  settings,
  update,
  onBack,
  takes,
  setTakes,
}: {
  takes: Take[]
  setTakes: React.Dispatch<React.SetStateAction<Take[]>>
  settings: Settings
  update: (p: Partial<Settings>) => void
  onBack: () => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const discardRef = useRef(false)
  const recordingRef = useRef(false) // false = ensayo
  const timersRef = useRef<number[]>([])
  const rafRef = useRef(0)
  const startRef = useRef(0)
  const lastFrameRef = useRef(0)
  const promptRef = useRef(0)
  const speedRef = useRef(1)
  const pausedRef = useRef(false)
  const scriptRef = useRef<Script | null>(null)

  const [camError, setCamError] = useState<string | null>(null)
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [camId, setCamId] = useState<string>('')
  const [micId, setMicId] = useState<string>('')
  const [phase, setPhase] = useState<Phase>('idle')
  const [isRecording, setIsRecording] = useState(false)
  const [count, setCount] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [promptT, setPromptT] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  const [viewing, setViewing] = useState<Take | null>(null)
  const [showTakes, setShowTakes] = useState(true)

  const { duration } = settings

  // ---- Cámara ----
  useEffect(() => {
    let cancelled = false
    async function open() {
      setCamError(null)
      streamRef.current?.getTracks().forEach((t) => t.stop())
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: camId ? { exact: camId } : undefined,
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
          audio: {
            deviceId: micId ? { exact: micId } : undefined,
            echoCancellation: true,
            noiseSuppression: true,
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream
        const list = await navigator.mediaDevices.enumerateDevices()
        if (!cancelled) setDevices(list)
      } catch (e) {
        const err = e as DOMException
        setCamError(
          err.name === 'NotAllowedError'
            ? 'No diste permiso para usar la cámara/micrófono. Actívalo en el navegador y recarga.'
            : err.name === 'NotFoundError'
              ? 'No se encontró cámara o micrófono.'
              : `No se pudo abrir la cámara: ${err.message || err.name}`,
        )
      }
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamError('Este navegador no permite usar la cámara (necesita https o localhost).')
      return
    }
    open()
    return () => {
      cancelled = true
    }
  }, [camId, micId])

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((t) => t.stop())
      timersRef.current.forEach(clearTimeout)
      cancelAnimationFrame(rafRef.current)
    },
    [],
  )

  // ---- Bucle de tiempo ----
  const tick = useCallback(() => {
    const now = performance.now()
    const dt = (now - lastFrameRef.current) / 1000
    lastFrameRef.current = now
    if (!pausedRef.current) promptRef.current += dt * speedRef.current
    const el = (now - startRef.current) / 1000
    setElapsed(el)
    setPromptT(promptRef.current)
    if (settings.autoStop && el >= duration) {
      stopRun(true)
      return
    }
    rafRef.current = requestAnimationFrame(tick)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoStop, duration])

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
  }

  const beginRun = useCallback(() => {
    const stream = streamRef.current
    if (recordingRef.current) {
      if (!stream) return
      const { mime, ext } = pickMime()
      const rec = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: 6_000_000,
      })
      chunksRef.current = []
      discardRef.current = false
      const started = performance.now()
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data)
      rec.onstop = () => {
        if (discardRef.current) return
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mime || 'video/webm' })
        setTakes((ts) => [
          {
            id: crypto.randomUUID(),
            n: (ts[0]?.n ?? 0) + 1,
            url: URL.createObjectURL(blob),
            blob,
            duration: (performance.now() - started) / 1000,
            createdAt: new Date(),
            ext,
            fav: false,
          },
          ...ts,
        ])
      }
      rec.start(250)
      recRef.current = rec
    }
    promptRef.current = 0
    startRef.current = lastFrameRef.current = performance.now()
    pausedRef.current = false
    setPaused(false)
    setPhase('running')
    rafRef.current = requestAnimationFrame(tick)
  }, [tick, setTakes])

  const startCountdown = useCallback(
    (record: boolean) => {
      if (record && !streamRef.current) return
      clearTimers()
      recordingRef.current = record
      setIsRecording(record)
      setElapsed(0)
      setPromptT(0)
      const secs = settings.countdown
      if (secs <= 0) return beginRun()
      setPhase('countdown')
      setCount(secs)
      for (let i = 1; i <= secs; i++) {
        timersRef.current.push(
          window.setTimeout(() => {
            if (i === secs) beginRun()
            else setCount(secs - i)
          }, i * 1000),
        )
      }
    },
    [settings.countdown, beginRun],
  )

  function stopRun(save: boolean) {
    clearTimers()
    cancelAnimationFrame(rafRef.current)
    const rec = recRef.current
    if (rec && rec.state !== 'inactive') {
      discardRef.current = !save
      rec.stop()
    }
    recRef.current = null
    setPhase('idle')
    if (save) setShowTakes(true)
  }

  const retry = () => {
    const record = phase === 'idle' ? true : recordingRef.current
    stopRun(false)
    startCountdown(record)
  }

  const changeSpeed = (delta: number) => {
    const s = Math.min(2, Math.max(0.5, Math.round((speedRef.current + delta) * 100) / 100))
    speedRef.current = s
    setSpeed(s)
  }

  const togglePause = () => {
    pausedRef.current = !pausedRef.current
    setPaused(pausedRef.current)
  }

  const jumpLine = (delta: number) => {
    const s = scriptRef.current
    if (!s || !s.words.length) return
    const idx = wordAt(s, promptRef.current)
    const line = Math.min(s.lines.length - 1, Math.max(0, s.words[idx].line + delta))
    promptRef.current = s.lines[line].start + 0.001
    setPromptT(promptRef.current)
  }

  // ---- Atajos de teclado ----
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {})
  keyHandler.current = (e: KeyboardEvent) => {
    if (viewing) {
      if (e.key === 'Escape') setViewing(null)
      return
    }
    if ((e.target as HTMLElement)?.tagName === 'SELECT') return
    switch (e.key) {
      case ' ':
        e.preventDefault()
        if (phase === 'idle') startCountdown(true)
        else stopRun(phase === 'running')
        break
      case 'r':
      case 'R':
        retry()
        break
      case 'Escape':
        if (phase !== 'idle') stopRun(false)
        break
      case 'p':
      case 'P':
        if (phase === 'running') togglePause()
        break
      case 'ArrowUp':
        e.preventDefault()
        changeSpeed(0.05)
        break
      case 'ArrowDown':
        e.preventDefault()
        changeSpeed(-0.05)
        break
      case 'ArrowRight':
        if (phase === 'running') jumpLine(1)
        break
      case 'ArrowLeft':
        if (phase === 'running') jumpLine(-1)
        break
    }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyHandler.current(e)
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  // ---- Derivados de UI ----
  const remaining = duration - elapsed
  const progress = phase === "idle" ? 0 : Math.min(1, elapsed / duration)
  const scriptProgress = (() => {
    const s = scriptRef.current
    if (phase === "idle" || !s || !s.words.length) return 0
    return Math.min(1, promptT / s.words[s.words.length - 1].end)
  })()
  const timeState = remaining < 0 ? 'over' : remaining <= Math.max(5, duration * 0.15) ? 'warn' : 'ok'
  const cams = devices.filter((d) => d.kind === 'videoinput')
  const mics = devices.filter((d) => d.kind === 'audioinput')
  const busy = phase !== 'idle'

  const download = (t: Take) => {
    const a = document.createElement('a')
    a.href = t.url
    a.download = `toma-${t.n}-${fmt(t.duration).replace(':', 'm')}s.${t.ext}`
    a.click()
  }
  const removeTake = (t: Take) => {
    URL.revokeObjectURL(t.url)
    setTakes((ts) => ts.filter((x) => x.id !== t.id))
    if (viewing?.id === t.id) setViewing(null)
  }
  const toggleFav = (t: Take) =>
    setTakes((ts) => ts.map((x) => (x.id === t.id ? { ...x, fav: !x.fav } : x)))

  return (
    <div className={'studio' + (showTakes ? ' with-takes' : '')}>
      <div className="stage">
        <video
          ref={videoRef}
          className={'cam' + (settings.mirror ? ' mirror' : '')}
          autoPlay
          muted
          playsInline
        />

        {camError && <div className="cam-error">{camError}</div>}

        {/* Barra superior: tiempo */}
        <div className="hud-top">
          <button className="ghost" onClick={onBack} disabled={busy} title="Editar guion">
            ← Guion
          </button>
          <div className={'clock ' + (busy ? timeState : '')}>
            {isRecording && phase === 'running' && <span className="rec-dot" />}
            <span className="clock-main">{fmt(busy ? elapsed : 0)}</span>
            <span className="clock-sep">/</span>
            <span>{fmt(duration)}</span>
            {busy && phase === 'running' && (
              <span className="clock-rem">
                {remaining >= 0 ? `quedan ${fmt(remaining)}` : `+${fmt(-remaining)} pasado`}
              </span>
            )}
          </div>
          <button className="ghost" onClick={() => setShowTakes((v) => !v)}>
            Tomas ({takes.length})
          </button>
        </div>

        <div className="bars">
          <div className={'bar time ' + timeState} style={{ width: `${progress * 100}%` }} />
          <div className="bar script" style={{ width: `${scriptProgress * 100}%` }} />
        </div>

        {phase === 'countdown' && (
          <div className="countdown" key={count}>
            {count}
          </div>
        )}

        {paused && phase === 'running' && <div className="paused-badge">Texto en pausa (P)</div>}

        {/* Prompter abajo */}
        <div className="prompter-wrap">
          <Prompter
            text={settings.text}
            duration={duration}
            time={phase === 'running' ? promptT : -1}
            fontSize={settings.fontSize}
            visibleLines={settings.lines}
            onScript={(s) => (scriptRef.current = s)}
          />
        </div>

        {/* Controles */}
        <div className="controls">
          {phase === 'idle' ? (
            <>
              <button className="btn rec" onClick={() => startCountdown(true)} disabled={!!camError}>
                <span className="dot" /> Grabar
              </button>
              <button className="btn" onClick={() => startCountdown(false)}>
                Ensayar
              </button>
            </>
          ) : (
            <>
              <button className="btn stop" onClick={() => stopRun(phase === 'running')}>
                ■ {isRecording ? 'Detener y guardar' : 'Terminar ensayo'}
              </button>
              <button className="btn" onClick={retry} title="Descarta y empieza de nuevo (R)">
                ↺ Reintentar
              </button>
              <button className="btn" onClick={togglePause} disabled={phase !== 'running'}>
                {paused ? '▶ Seguir texto' : '❚❚ Pausar texto'}
              </button>
            </>
          )}
          <div className="speed">
            <button className="mini" onClick={() => changeSpeed(-0.05)} title="Más lento (↓)">
              −
            </button>
            <span title="Velocidad del texto">{Math.round(speed * 100)}%</span>
            <button className="mini" onClick={() => changeSpeed(0.05)} title="Más rápido (↑)">
              +
            </button>
          </div>
        </div>
        <div className="hints">
          Espacio grabar/detener · R reintentar · P pausar texto · ↑↓ velocidad · ←→ saltar línea · Esc
          cancelar
        </div>
      </div>

      {showTakes && (
        <aside className="takes">
          <div className="takes-head">
            <h2>Tomas</h2>
            <button className="mini" onClick={() => setShowTakes(false)} aria-label="Cerrar">
              ×
            </button>
          </div>

          <div className="devices">
            <label>
              Cámara
              <select value={camId} onChange={(e) => setCamId(e.target.value)} disabled={busy}>
                <option value="">Predeterminada</option>
                {cams.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Cámara ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Micrófono
              <select value={micId} onChange={(e) => setMicId(e.target.value)} disabled={busy}>
                <option value="">Predeterminado</option>
                {mics.map((d, i) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Micrófono ${i + 1}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.mirror}
                onChange={(e) => update({ mirror: e.target.checked })}
              />
              Vista espejo
            </label>
          </div>

          {takes.length === 0 ? (
            <p className="empty">
              Aún no hay tomas. Presiona <b>Grabar</b> (o Espacio). Cada intento queda guardado aquí
              para que elijas el mejor.
            </p>
          ) : (
            <ul className="take-list">
              {takes.map((t) => {
                const diff = t.duration - duration
                const close = Math.abs(diff) <= Math.max(2, duration * 0.05)
                return (
                  <li key={t.id} className={t.fav ? 'fav' : ''}>
                    <button className="thumb" onClick={() => setViewing(t)} title="Ver toma">
                      <video src={t.url} muted preload="metadata" />
                      <span className="play">▶</span>
                    </button>
                    <div className="take-info">
                      <div className="take-title">
                        Toma {t.n}
                        <button
                          className={'star' + (t.fav ? ' on' : '')}
                          onClick={() => toggleFav(t)}
                          title="Marcar como favorita"
                        >
                          ★
                        </button>
                      </div>
                      <div className="take-meta">
                        {fmt(t.duration)}{' '}
                        <span className={'diff ' + (close ? 'ok' : diff > 0 ? 'over' : 'under')}>
                          {close ? 'en tiempo' : `${diff > 0 ? '+' : '−'}${Math.round(Math.abs(diff))}s`}
                        </span>
                      </div>
                      <div className="take-actions">
                        <button className="mini" onClick={() => download(t)}>
                          Descargar
                        </button>
                        <button className="mini danger" onClick={() => removeTake(t)}>
                          Borrar
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {takes.length > 0 && (
            <p className="note">Las tomas viven en esta pestaña: descarga las que quieras conservar.</p>
          )}
        </aside>
      )}

      {viewing && (
        <div className="modal" onClick={() => setViewing(null)}>
          <div className="modal-body" onClick={(e) => e.stopPropagation()}>
            <video src={viewing.url} controls autoPlay />
            <div className="modal-actions">
              <span>
                Toma {viewing.n} · {fmt(viewing.duration)}
              </span>
              <button className="btn" onClick={() => download(viewing)}>
                Descargar
              </button>
              <button className="btn" onClick={() => setViewing(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
