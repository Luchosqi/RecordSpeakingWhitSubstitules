import { countWords, fmt } from './pacing'
import type { Settings } from './settings'

const NATURAL_WPM = 150 // ritmo conversacional típico en español

function paceLabel(wpm: number) {
  if (wpm < 110) return { text: 'pausado', cls: 'slow' }
  if (wpm <= 170) return { text: 'natural', cls: 'ok' }
  if (wpm <= 200) return { text: 'rápido', cls: 'warn' }
  return { text: 'muy rápido', cls: 'over' }
}

export function Editor({
  settings,
  update,
  onStart,
}: {
  settings: Settings
  update: (p: Partial<Settings>) => void
  onStart: () => void
}) {
  const words = countWords(settings.text)
  const wpm = settings.duration > 0 ? Math.round((words / settings.duration) * 60) : 0
  const suggested = Math.max(5, Math.round((words / NATURAL_WPM) * 60))
  const pace = paceLabel(wpm)
  const minutes = Math.floor(settings.duration / 60)
  const seconds = settings.duration % 60

  const setDuration = (m: number, s: number) =>
    update({ duration: Math.max(5, Math.min(60 * 60, m * 60 + s)) })

  return (
    <main className="editor">
      <header className="brand">
        <div className="logo">●</div>
        <div>
          <h1>Prompter Cam</h1>
          <p>Escribe lo que vas a decir, elige el tiempo y grábate con el texto en pantalla.</p>
        </div>
      </header>

      <section className="card">
        <label className="field-label" htmlFor="script">
          Tu guion
        </label>
        <textarea
          id="script"
          value={settings.text}
          onChange={(e) => update({ text: e.target.value })}
          placeholder="Escribe o pega aquí lo que vas a decir…"
          rows={10}
        />
        <div className="stats">
          <span>{words} palabras</span>
          <span>
            {wpm} palabras/min · <b className={pace.cls}>{pace.text}</b>
          </span>
          <button className="link" onClick={() => update({ duration: suggested })}>
            Usar tiempo natural ({fmt(suggested)})
          </button>
        </div>
      </section>

      <section className="card grid">
        <div>
          <span className="field-label">Duración objetivo</span>
          <div className="duration">
            <input
              type="number"
              min={0}
              max={60}
              value={minutes}
              onChange={(e) => setDuration(Number(e.target.value) || 0, seconds)}
              aria-label="Minutos"
            />
            <span>min</span>
            <input
              type="number"
              min={0}
              max={59}
              value={seconds}
              onChange={(e) => setDuration(minutes, Number(e.target.value) || 0)}
              aria-label="Segundos"
            />
            <span>seg</span>
          </div>
          <div className="presets">
            {[15, 30, 45, 60, 90, 120].map((s) => (
              <button
                key={s}
                className={'chip' + (settings.duration === s ? ' on' : '')}
                onClick={() => update({ duration: s })}
              >
                {s < 60 ? `${s}s` : `${s / 60} min`}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="field-label">Tamaño del texto · {settings.fontSize}px</span>
          <input
            type="range"
            min={18}
            max={56}
            value={settings.fontSize}
            onChange={(e) => update({ fontSize: Number(e.target.value) })}
          />
          <span className="field-label">Líneas visibles · {settings.lines}</span>
          <input
            type="range"
            min={2}
            max={6}
            value={settings.lines}
            onChange={(e) => update({ lines: Number(e.target.value) })}
          />
        </div>

        <div className="opts">
          <label className="check">
            Cuenta regresiva
            <select
              value={settings.countdown}
              onChange={(e) => update({ countdown: Number(e.target.value) })}
            >
              <option value={0}>Sin cuenta</option>
              <option value={3}>3 segundos</option>
              <option value={5}>5 segundos</option>
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.autoStop}
              onChange={(e) => update({ autoStop: e.target.checked })}
            />
            Detener al llegar al tiempo
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={settings.mirror}
              onChange={(e) => update({ mirror: e.target.checked })}
            />
            Vista espejo (el video se guarda normal)
          </label>
        </div>
      </section>

      <button className="btn rec big" onClick={onStart} disabled={words === 0}>
        <span className="dot" /> Ir a grabar
      </button>
    </main>
  )
}
