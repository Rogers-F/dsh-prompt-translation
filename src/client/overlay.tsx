/**
 * The frame-wide control panel: a small 「译」badge in the corner that opens a
 * popover with the switches people actually flip mid-conversation.
 *
 * The plugin-list settings card stays the full form; this panel is the short
 * path — enable/disable, the input direction, the inline sub-text switch and its
 * language, plus a one-click test translation that proves the Host route works
 * without waiting for a model reply.
 *
 * Mounted into the shell's additive `shell.overlay` seat, so it never competes
 * with a message-surface slot and uninstalls with the plugin.
 *
 * @module dsh-prompt-translation/client/overlay
 */

import { useEffect, useState } from 'react'
import { languages, type Language, type Options } from '../options.js'
import { loadSettings, saveSettings, type SettingsApi } from './settings.js'

/** Host route the test button exercises. */
const ROUTE = '/prompt-translation/inline'

/** Sample text for the test button: one English sentence, one Chinese one. */
const SAMPLE = 'The quick brown fox jumps over the lazy dog. 这是一句中文。'

export interface OverlayProps {
  api: SettingsApi
  subscribe: (listener: () => void) => () => void
}

/** Run one translation through the Host route. */
async function probe(target: string): Promise<string> {
  const response = await fetch(ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ segments: [SAMPLE], target }),
  })
  const payload: unknown = await response.json().catch(() => undefined)
  const reply = payload as { ok?: boolean; value?: { segments?: unknown }; error?: { message?: string } } | undefined
  if (reply?.ok !== true) throw new Error(reply?.error?.message ?? `HTTP ${response.status}`)
  const segments = reply.value?.segments
  const first = Array.isArray(segments) ? segments[0] : undefined
  return typeof first === 'string' && first.trim() !== '' ? first : '（未返回译文）'
}

/** The badge and its popover. */
export function TranslateOverlay({ api, subscribe }: OverlayProps) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<Options | undefined>(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState('')

  useEffect(() => {
    let alive = true
    const refresh = () => {
      void loadSettings(api).then(next => { if (alive) { setValue(next.value); setError('') } })
        .catch((failure: unknown) => { if (alive) setError(String((failure as Error)?.message ?? failure)) })
    }
    refresh()
    return subscribe(refresh)
  }, [api, subscribe])

  const patch = async (changes: Partial<Options>): Promise<void> => {
    setBusy(true); setError('')
    try {
      await saveSettings(api, changes)
      const next = await loadSettings(api)
      setValue(next.value)
    } catch (failure) {
      setError(String((failure as Error)?.message ?? failure))
    } finally { setBusy(false) }
  }

  const armed = value?.enabled === true
  const inline = value?.inline === true

  return <div className="dsh-pt-frame">
    {open && <div className="dsh-pt-panel" role="dialog" aria-label="翻译设置">
      <div className="dsh-pt-panel-head">
        <strong>翻译</strong>
        <button type="button" className="dsh-pt-panel-close" title="关闭" onClick={() => setOpen(false)}>×</button>
      </div>
      {value === undefined
        ? <p className="dsh-pt-panel-note">{error === '' ? '正在读取设置…' : error}</p>
        : <>
          <label><input type="checkbox" disabled={busy} checked={armed} onChange={event => { void patch({ enabled: event.target.checked }) }} />启用翻译</label>
          <div className="dsh-pt-panel-row">
            <select aria-label="原始语言" disabled={busy} value={value.source} onChange={event => { void patch({ source: event.target.value as Language }) }}>
              {Object.entries(languages).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
            <span className="dsh-pt-arrow">→</span>
            <select aria-label="目标语言" disabled={busy} value={value.target} onChange={event => { const next = event.target.value as Language; if (next !== 'auto') void patch({ target: next }) }}>
              {Object.entries(languages).filter(([key]) => key !== 'auto').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <label><input type="checkbox" disabled={busy} checked={inline} onChange={event => {
            const next = event.target.checked
            // Inline sub-text needs the original answer; replacing it would leave
            // nothing to annotate, so the two switches are kept exclusive here too.
            void patch(next ? { inline: true, output: false } : { inline: false })
          }} />英文段落下方显示小字译文</label>
          {inline && <div className="dsh-pt-panel-row">
            <span className="dsh-pt-panel-note">小字语言</span>
            <select aria-label="小字译文语言" disabled={busy} value={value.inlineTarget} onChange={event => { void patch({ inlineTarget: event.target.value as Options['inlineTarget'] }) }}>
              {Object.entries(languages).filter(([key]) => key !== 'auto').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>}
          <button type="button" className="dsh-pt-button" disabled={busy} onClick={() => {
            setBusy(true); setError(''); setResult('…')
            void probe(value.inlineTarget).then(text => setResult(text))
              .catch((failure: unknown) => { setResult(''); setError(String((failure as Error)?.message ?? failure)) })
              .finally(() => setBusy(false))
          }}>测试翻译</button>
          {result !== '' && <p className="dsh-pt-panel-result">{result}</p>}
          {error !== '' && <p className="dsh-pt-panel-error" role="alert">{error}</p>}
          <p className="dsh-pt-panel-note">更多选项在「插件 → 提示词与输出翻译」。</p>
        </>}
    </div>}
    <button type="button" className={`dsh-pt-badge${armed ? ' dsh-pt-badge-on' : ''}`} title={armed ? '翻译已开启' : '翻译已关闭'} aria-expanded={open} onClick={() => setOpen(current => !current)}>{armed ? '译' : '译·关'}</button>
  </div>
}
