import { useEffect, useState } from 'react'

export type Settings = {
  text: string
  duration: number // segundos
  fontSize: number // px
  mirror: boolean
  countdown: number // segundos
  autoStop: boolean
  lines: number // líneas visibles del prompter
}

export const DEFAULTS: Settings = {
  text:
    'Hola, bienvenidos. Hoy les quiero contar en menos de un minuto de qué se trata este proyecto.\n\n' +
    'La idea es simple: escribes lo que quieres decir, eliges cuánto tiempo tienes, y la app te va mostrando el texto al ritmo justo mientras te grabas.\n\n' +
    'Si te equivocas, no pasa nada. Reintentas cuantas veces quieras y te quedas con la mejor toma.',
  duration: 45,
  fontSize: 30,
  mirror: true,
  countdown: 3,
  autoStop: false,
  lines: 3,
}

const KEY = 'rsws.settings.v1'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) return { ...DEFAULTS, ...JSON.parse(raw) }
    } catch {
      /* almacenamiento no disponible */
    }
    return DEFAULTS
  })

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      /* ignorar */
    }
  }, [settings])

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))
  return [settings, update] as const
}
