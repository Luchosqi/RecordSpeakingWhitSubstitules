import { useState } from 'react'
import { Editor } from './Editor'
import { Studio, type Take } from './Studio'
import { useSettings } from './settings'

export default function App() {
  const [settings, update] = useSettings()
  const [view, setView] = useState<'editor' | 'studio'>('editor')
  const [takes, setTakes] = useState<Take[]>([]) // sobreviven al volver al guion

  return view === 'editor' ? (
    <Editor settings={settings} update={update} onStart={() => setView('studio')} />
  ) : (
    <Studio
      settings={settings}
      update={update}
      onBack={() => setView('editor')}
      takes={takes}
      setTakes={setTakes}
    />
  )
}
