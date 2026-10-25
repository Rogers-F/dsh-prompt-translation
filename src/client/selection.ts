/**
 * Selection translation: select any text in the transcript, get a floating
 * panel with its translation.
 *
 * The reference implementation of this feature in the merged plugin family
 * needed a second translation transport; here the panel posts to the same Host
 * route the inline layer uses, so one translator, one configuration.
 *
 * @module dsh-prompt-translation/client/selection
 */

/** Host route that performs the translation. */
const ROUTE = '/prompt-translation/inline'

/** Longest selection the panel will send, in code points. */
const MAX_CHARS = 4000

/** Panel id, so a second mount replaces the first instead of stacking. */
const PANEL_ID = 'dsh-pt-selection-panel'

/** Trim a selection to something worth translating. */
function usable(text: string): boolean {
  const trimmed = text.trim()
  return trimmed.length >= 2 && trimmed.length <= MAX_CHARS
}

/** Ask the Host for one translation. */
async function translateOne(text: string, target: string, signal: AbortSignal): Promise<string> {
  const response = await fetch(ROUTE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    signal,
    body: JSON.stringify({ segments: [text], target }),
  })
  const payload: unknown = await response.json().catch(() => undefined)
  const reply = payload as { ok?: boolean; value?: { segments?: unknown }; error?: { message?: string } } | undefined
  if (reply?.ok !== true) throw new Error(reply?.error?.message ?? `HTTP ${response.status}`)
  const segments = reply.value?.segments
  const first = Array.isArray(segments) ? segments[0] : undefined
  if (typeof first !== 'string' || first.trim() === '') throw new Error('未返回译文')
  return first
}

/** Remove a previously mounted panel. */
function clearPanel(): void {
  document.getElementById(PANEL_ID)?.remove()
}

/**
 * Mount the selection listener.
 *
 * @param getTarget - reads the live inline target language.
 * @param log - diagnostic sink.
 * @returns a disposer removing listeners and the panel.
 */
export function installSelectionTranslation(getTarget: () => string, log: (message: string) => void = () => {}): () => void {
  let controller: AbortController | undefined

  const anchorRect = (): DOMRect | undefined => {
    const selection = window.getSelection()
    if (selection === null || selection.rangeCount === 0) return undefined
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    return rect.width === 0 && rect.height === 0 ? undefined : rect
  }

  const show = async (text: string): Promise<void> => {
    clearPanel()
    const rect = anchorRect()
    if (rect === undefined) return
    controller?.abort()
    controller = new AbortController()
    const panel = document.createElement('div')
    panel.id = PANEL_ID
    panel.className = 'dsh-pt-selection'
    panel.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 360))}px`
    panel.style.top = `${Math.min(rect.bottom + 8, window.innerHeight - 140)}px`
    const body = document.createElement('div')
    body.className = 'dsh-pt-selection-body'
    body.textContent = '…'
    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'dsh-pt-selection-close'
    close.textContent = '×'
    close.title = '关闭'
    close.addEventListener('click', () => panel.remove())
    panel.append(close, body)
    document.body.append(panel)
    try {
      body.textContent = await translateOne(text, getTarget(), controller.signal)
    } catch (error) {
      if (controller.signal.aborted) return
      const message = String((error as Error)?.message ?? error)
      log(`selection translation failed: ${message}`)
      body.textContent = `译文获取失败：${message}`
    }
  }

  const onPointerUp = (event: PointerEvent): void => {
    const target = event.target
    if (target instanceof HTMLElement && target.closest(`#${PANEL_ID}`) !== null) return
    const selection = window.getSelection()?.toString() ?? ''
    if (!usable(selection)) { clearPanel(); return }
    void show(selection.trim())
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') { controller?.abort(); clearPanel() }
  }

  document.addEventListener('pointerup', onPointerUp)
  document.addEventListener('keydown', onKeyDown)
  return () => {
    controller?.abort()
    document.removeEventListener('pointerup', onPointerUp)
    document.removeEventListener('keydown', onKeyDown)
    clearPanel()
  }
}
