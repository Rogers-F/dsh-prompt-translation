import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { languages, defaults, type Options, type Language } from '../options.js'
import { loadSettings, saveSettings, type Catalog, type CatalogModel, type SettingsApi } from './settings.js'
export interface Props { api: SettingsApi; catalog?: Catalog; subscribe: (fn: () => void) => () => void }
function useSettings({ api, subscribe }: Props) {
  const [value, setValue] = useState(defaults)
  const [ready, setReady] = useState(false)
  const [writable, setWritable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const generation = useRef(0)
  const alive = useRef(false)
  const refresh = async () => {
    const ticket = ++generation.current
    try {
      const result = await loadSettings(api)
      if (alive.current && ticket === generation.current) {
        setValue(result.value); setWritable(result.writable); setReady(true); setError('')
      }
    } catch (err) {
      if (alive.current && ticket === generation.current) {
        setReady(false); setError(err instanceof Error ? err.message : String(err))
      }
      throw err
    }
  }
  useEffect(() => {
    alive.current = true
    const reload = () => { void refresh().catch(() => {}) }
    reload()
    const dispose = subscribe(reload)
    return () => { alive.current = false; generation.current++; dispose() }
  }, [api, subscribe])
  const save = async (patch: Partial<Options>): Promise<boolean> => {
    setBusy(true); setError('')
    try {
      await saveSettings(api, patch)
      await refresh()
      return true
    } catch (err) {
      if (alive.current) setError(err instanceof Error ? err.message : String(err))
      return false
    } finally { if (alive.current) setBusy(false) }
  }
  return { value, ready, disabled: !ready || !writable || busy, error, save }
}
export function LanguageSelect({ source, value, onChange, disabled, compact }: { compact?: boolean; source?: boolean; value: string; onChange: (value: Language) => void; disabled?: boolean }) {
  return <label className={compact ? 'dsh-pt-language-compact' : undefined}>{!compact && (source ? '原始语言' : '目标语言')}<select aria-label={source ? '原始语言' : '目标语言'} disabled={disabled} value={value} onChange={event => onChange(event.target.value as Language)}>
    {Object.entries(languages).filter(([key]) => source || key !== 'auto').map(([key, label]) => <option key={key} value={key}>{label}</option>)}
  </select></label>
}
export function SettingsCard(props: Props) {
  const state = useSettings(props)
  const [expanded, setExpanded] = useState(true)
  const cardId = useId()
  const catalogId = useId()
  const { value, save, disabled } = state
  const [patch, setPatch] = useState<Partial<Options>>({})
  const [saveError, setSaveError] = useState('')
  const [providers, setProviders] = useState<{ id: string; name: string }[]>([])
  const [models, setModels] = useState<CatalogModel[]>([])
  const [catalogError, setCatalogError] = useState('')
  const draft = { ...value, ...patch }
  const dirty = Object.entries(patch).some(([key, next]) => next !== value[key as keyof Options])
  const edit = <K extends keyof Options>(key: K, next: Options[K]) => setPatch(current => ({ ...current, [key]: next }))
  useEffect(() => {
    let alive = true
    if (props.catalog) void props.catalog.modelCatalog().then(reply => {
      if (!alive) return
      if (reply.ok) setProviders(reply.value.groups)
      else setCatalogError(reply.error.message)
    }).catch(err => { if (alive) setCatalogError(String(err.message ?? err)) })
    return () => { alive = false }
  }, [props.catalog])
  useEffect(() => {
    let alive = true
    setModels([])
    if (draft.provider && props.catalog) void props.catalog.modelCatalog().then(reply => {
      if (!alive) return
      if (reply.ok) setModels(reply.value.groups.find(group => group.id === draft.provider)?.models ?? [])
      else setCatalogError(reply.error.message)
    }).catch(err => { if (alive) setCatalogError(String(err.message ?? err)) })
    return () => { alive = false }
  }, [props.catalog, draft.provider])
  const text = (key: 'apiKey' | 'appId' | 'region' | 'provider' | 'model' | 'reasoningEffort', label: string, list?: string) => <label>{label}<input
    type={key === 'apiKey' ? 'password' : 'text'} autoComplete="off" list={list ? `${catalogId}-${list}` : undefined}
    value={key === 'apiKey' ? patch.apiKey ?? '' : draft[key]}
    placeholder={key === 'apiKey' ? '留空保留已有密钥' : undefined}
    onChange={event => edit(key, event.target.value)} /></label>
  const submit = () => {
    const changes = { ...patch }
    setSaveError('')
    if (draft.engine !== value.engine && !changes.apiKey?.trim()) {
      setSaveError('切换翻译服务时，请输入新服务的 API 密钥。')
      return
    }
    if (changes.apiKey === '') delete changes.apiKey
    void save(changes).then(ok => { if (ok) setPatch({}) })
  }
  return <section className={`dsh-pt-card${expanded ? ' dsh-pt-card-open' : ''}`}>
    <button type="button" className="dsh-pt-card-header" aria-expanded={expanded} aria-controls={cardId} onClick={() => setExpanded(!expanded)}>
      <span className="dsh-pt-head-text"><span role="heading" aria-level={3} className="dsh-pt-card-name">提示词与输出翻译</span><span className="dsh-pt-card-description">输入译向目标语言，思考与回答译回原始语言。</span></span>
      {dirty && <span className="dsh-pt-tag">未保存</span>}
      <svg className={expanded ? 'dsh-pt-chevron dsh-pt-chevron-open' : 'dsh-pt-chevron'} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <form id={cardId} className="dsh-pt-card-body" hidden={!expanded} onSubmit={event => { event.preventDefault(); submit() }}>
    <fieldset disabled={disabled} className="dsh-pt-fields">
      <label><input type="checkbox" checked={draft.enabled} onChange={event => edit('enabled', event.target.checked)} />启用翻译</label>
      <div className="dsh-pt-row"><LanguageSelect source value={draft.source} onChange={next => edit('source', next)} /><span>→</span><LanguageSelect value={draft.target} onChange={next => { if (next !== 'auto') edit('target', next) }} /></div>
      <label>翻译类型<select value={draft.type} onChange={event => edit('type', event.target.value as Options['type'])}><option value="traditional">传统翻译接口</option><option value="agent">智能体（已有模型）</option></select></label>
      <div className="dsh-pt-row">{(['userPrompt', 'reasoning', 'output'] as const).map((key, index) => <label key={key}><input type="checkbox" checked={draft[key]} onChange={event => edit(key, event.target.checked)} />{['用户提示词', '思考内容', '输出内容'][index]}</label>)}</div>
      <label><input type="checkbox" checked={draft.inline} onChange={event => { const next = event.target.checked; edit('inline', next); if (next && draft.output) edit('output', false) }} />英文段落下方显示小字译文</label>
      {draft.inline && <div className="dsh-pt-row">
        <LanguageSelect value={draft.inlineTarget} onChange={next => { if (next !== 'auto') edit('inlineTarget', next as Options['inlineTarget']) }} />
        <small>保留英文原文，只在每段下面加一行译文；需要关闭「输出内容」。</small>
      </div>}
      {draft.type === 'traditional' ? <>
        <label>翻译服务<select value={draft.engine} onChange={event => { setSaveError(''); setPatch(current => ({ ...current, engine: event.target.value as Options['engine'], apiKey: '' })) }}><option value="baidu">百度</option><option value="google">Google Cloud Translation</option><option value="deepl">DeepL</option><option value="microsoft">Microsoft Translator</option></select></label>
        {text('apiKey', draft.engine === 'baidu' ? '百度密钥' : 'API 密钥')}
        {draft.engine === 'baidu' && text('appId', '百度 App ID')}
        {draft.engine === 'microsoft' && text('region', '微软资源区域')}
        {draft.engine === 'deepl' && <label><input type="checkbox" checked={draft.deeplFree} onChange={event => edit('deeplFree', event.target.checked)} />DeepL Free API</label>}
      </> : <>
        {text('provider', '提供商 ID', 'dsh-pt-providers')}<datalist id={`${catalogId}-dsh-pt-providers`}>{providers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</datalist>
        {text('model', '模型 ID', 'dsh-pt-models')}<datalist id={`${catalogId}-dsh-pt-models`}>{models.map(item => <option key={item.id} value={item.id}>{item.name ?? item.id}</option>)}</datalist>
        {text('reasoningEffort', '推理强度（留空使用模型默认值）', 'dsh-pt-efforts')}<datalist id={`${catalogId}-dsh-pt-efforts`}>{(models.find(model => model.id === draft.model)?.reasoning?.efforts ?? []).map(effort => <option key={effort.id} value={effort.id}>{effort.name}</option>)}</datalist>
        <small>使用 DSH 已配置的提供商与模型。推理强度必须是该模型支持的 ID。</small>
        {catalogError && <p role="status">模型列表暂不可用：{catalogError}。可以手动填写已有 ID。</p>}
      </>}
      <details><summary>高级设置</summary>
        <label>超时（毫秒）<input type="number" min={1000} max={300000} step={1} value={draft.timeoutMs} onChange={event => edit('timeoutMs', Number(event.target.value))} /></label>
        <label>分段字符数<input type="number" min={100} max={4000} step={1} value={draft.maxChars} onChange={event => edit('maxChars', Number(event.target.value))} /></label>
      </details>
    </fieldset>
    <p className="dsh-pt-help">系统提示词不翻译。自动检测以本轮用户输入为准；思考与回答在完整文本块结束后显示译文。</p>
    <div className="dsh-pt-card-footer">
      {(saveError || state.error) && <p role="alert" className="dsh-pt-error">{saveError || state.error}</p>}
      <button type="button" className="dsh-pt-button" disabled={disabled || !dirty} onClick={() => { setPatch({}); setSaveError('') }}>放弃修改</button>
      <button type="submit" className="dsh-pt-button dsh-pt-button-primary" disabled={disabled || !dirty}>保存设置</button>
    </div>
    </form>
  </section>
}
export function QuickPicker(props: Props) {
  const state = useSettings(props)
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const marker = anchor.current
    if (!marker) return
    // Host renderer guarantees data-slot anchors. Restrict lookup to this composer.
    const outlet = marker.closest('[data-slot="conversation.input.left"]')
    const row = outlet?.parentElement
    if (!row) return
    const mount = document.createElement('span')
    mount.className = 'dsh-pt-seat'
    const reconcile = () => {
      const permission = row.querySelector('[data-slot="conversation.input.permission"]')
      if (!permission?.parentElement) {
        mount.remove()
        setTarget(null)
        return
      }
      if (mount.previousElementSibling !== permission) {
        permission.after(mount)
        setTarget(mount)
      }
    }
    const observer = new MutationObserver(reconcile)
    observer.observe(row, { childList: true, subtree: true })
    reconcile()
    return () => { observer.disconnect(); mount.remove() }
  }, [])
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!panel.current?.contains(event.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const control = <div className="dsh-pt-quick" ref={panel} onKeyDown={event => { if (event.key === 'Escape') setOpen(false) }}>
    <button type="button" aria-label="翻译" aria-expanded={open} title={`翻译${state.value.enabled ? '已开启' : '已关闭'}：${languages[state.value.source]} ⇄ ${languages[state.value.target]}`} data-enabled={state.value.enabled} onClick={() => setOpen(!open)} className={state.value.enabled ? 'dsh-pt-active' : ''}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M3 5h12M9 2v3M5 5c1 6 4 9 9 11M13 5c-1 6-4 9-10 12M13 21l4-10 4 10M15 17h4" />{!state.value.enabled && <path data-translation-disabled="" d="M3 3l18 18" strokeWidth="2" />}</svg>
    </button>
    {open && <div className="dsh-pt-popover" role="dialog" aria-label="快捷翻译设置">
      <label><input type="checkbox" disabled={state.disabled} checked={state.value.enabled} onChange={event => { void state.save({ enabled: event.target.checked }) }} />启用翻译</label>
      <div className="dsh-pt-language-row"><LanguageSelect compact source disabled={state.disabled} value={state.value.source} onChange={source => { void state.save({ source }) }} />
      <span className="dsh-pt-arrow" aria-hidden="true">→</span><LanguageSelect compact disabled={state.disabled} value={state.value.target} onChange={target => { if (target !== 'auto') void state.save({ target }) }} />
      </div><small className="dsh-pt-scope">* 应用到当前 Profile 的所有会话</small>
      {state.error && <p role="alert">{state.error}</p>}
    </div>}
  </div>
  return <><span ref={anchor} data-dsh-prompt-translation-anchor="" style={target ? { display: 'none' } : undefined}>{target ? null : control}</span>{target && createPortal(control, target)}</>
}
