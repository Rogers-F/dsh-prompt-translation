/**
 * The inline sub-text layer: a small translation under every assistant
 * paragraph, with the original prose left exactly where it is.
 *
 * Why a DOM layer instead of a slot: the shipped assistant renderer is not
 * replaceable from a third-party plugin (its slot key is owned by the shipped
 * entry), and the Markdown renderer exposes no interception hook. So this layer
 * never touches the rendered markup — it appends a *sibling* node after each
 * paragraph-level block it decides to translate, and removes every node it owns
 * on dispose. An uninstall leaves no trace.
 *
 * Anchors (verified against the shipped Web build, `dsh-web-frontend` bundle):
 *   - a rendered Markdown document is the `MarkdownText` root, whose CSS-module
 *     class carries a `_markdown_<hash>` fragment (`_markdown_1ypvv_5` in
 *     0.2.1-rc.3, `_markdown_1wejo_28` in the other build), so the container
 *     selector matches the fragment rather than one hash;
 *   - the translated region is one paragraph-level block inside it (`p`, a
 *     tight list item's `li`, or a heading) — anchoring on the document would
 *     pile every translation at the bottom of the answer;
 *   - a reasoning row is `[data-variant="think"]`; its paragraphs are translated
 *     only when clicked (expanding thinking is a request to read it, not to pay
 *     for translating all of it).
 *
 * The layer degrades to doing nothing when the markup stops matching; it never
 * throws into the transcript.
 *
 * @module dsh-prompt-translation/client/inline
 */

import { PROMPT_ORIGINAL_MARKER } from './presentation.js'

/** Marks every node this layer injects, so removal is exact. */
const OWNED = 'data-dsh-pt-inline'

/** Marks a block this layer is already tracking. */
const CLAIMED = 'data-dsh-pt-inline-anchor'

/** A rendered user-message bubble (the prompt side). */
const BUBBLE = '[class*="_bubble"]'

/** A rendered Markdown document (the scan container). */
const MARKDOWN = '[class*="_markdown_"], [class$="_markdown"]'

/** The translated region: one paragraph-level prose block. */
const REGION = 'p, li, h1, h2, h3, h4, h5, h6'

/** A reasoning disclosure row whose paragraphs wait for a click. */
const THINK = '[data-variant="think"]'

/** Host route that performs the translation. */
const ROUTE = '/prompt-translation/inline'

/** Cache key in localStorage. */
const CACHE_KEY = 'dsh-prompt-translation:inline-cache'

/** Upper bound on cached paragraphs. */
const CACHE_LIMIT = 240

/** Rescan debounce, in milliseconds. */
const RESCAN_MS = 160

/** Longest paragraph sent to the route, in code points. */
const MAX_PARAGRAPH = 4000

/** Paragraphs per request; the Host caps its own side too. */
const BATCH = 12

/** Tags whose text belongs to their own region, never to the region being read. */
const BLOCK_TAGS = new Set([
  'P', 'LI', 'UL', 'OL', 'DL', 'DT', 'DD', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH',
  'BLOCKQUOTE', 'PRE', 'HR', 'FIGURE', 'FIGCAPTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'DIV',
])

/** What the layer needs from the plugin settings. */
export interface InlineSettings {
  enabled: boolean
  target: string
}

interface Entry {
  source: string
  node: HTMLElement
  span: HTMLElement
  /** Reasoning paragraphs wait for a click; answers translate on sight. */
  manual: boolean
  state: 'idle' | 'pending' | 'done' | 'error'
}

/** The prose an element carries on its own, excluding nested block subtrees. */
export function proseText(element: Element, depth = 0): string {
  if (depth > 24) return ''
  let out = ''
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType !== Node.ELEMENT_NODE) { out += node.textContent ?? ''; continue }
    const child = node as Element
    if (child.hasAttribute(OWNED)) continue
    if (BLOCK_TAGS.has(child.tagName.toUpperCase())) continue
    out += proseText(child, depth + 1)
  }
  return out
}

/**
 * Whether a region is worth translating: it must carry prose, must be mostly
 * Latin script (an answer already in Chinese needs no sub-text), and must not
 * be a code/URL/number line.
 */
export function worthTranslating(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2 || trimmed.length > MAX_PARAGRAPH) return false
  const latin = (trimmed.match(/[A-Za-z]/gu) ?? []).length
  const cjk = (trimmed.match(/[\u3400-\u9fff\uf900-\ufaff]/gu) ?? []).length
  if (latin < 3) return false
  return cjk / trimmed.length < 0.2
}

/** Insert this layer's node directly beneath one region. */
function placeBelow(region: HTMLElement, node: HTMLElement): void {
  // A tight list item keeps its prose as bare inline children, so its sub-text
  // belongs inside the item; every other region takes a sibling line.
  if (region.tagName === 'LI') {
    region.append(node)
    return
  }
  region.insertAdjacentElement('afterend', node)
}

/** Read the persisted cache, tolerating a full or disabled store. */
function loadCache(): Map<string, string> {
  const cache = new Map<string, string>()
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (raw === null) return cache
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return cache
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string' && cache.size < CACHE_LIMIT) cache.set(key, value)
    }
  } catch { /* a broken cache is not an error */ }
  return cache
}

/** Persist the cache, trimmed to its newest entries. */
function saveCache(cache: Map<string, string>): void {
  try {
    const entries = [...cache.entries()].slice(-CACHE_LIMIT)
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch { /* storage may be full; the in-memory cache still works */ }
}

/**
 * The layer itself: observe the transcript, claim paragraphs, translate them in
 * batches, paint one sub-text line per paragraph.
 */
export class InlineLayer {
  readonly #entries = new Map<HTMLElement, Entry>()
  readonly #queue: Entry[] = []
  readonly #inflight = new Set<AbortController>()
  readonly #promptLines = new Set<HTMLElement>()
  readonly #cache = loadCache()
  #observer: MutationObserver | undefined
  #timer: number | undefined
  #disposed = false

  /**
   * @param getSettings - reads the live settings snapshot (called per pass).
   * @param log - diagnostic sink; never used for user-facing errors.
   */
  constructor(
    private readonly getSettings: () => InlineSettings,
    private readonly log: (message: string) => void = () => {},
  ) {}

  /** Start observing the transcript. */
  start(): void {
    if (this.#disposed || this.#observer !== undefined) return
    this.#observer = new MutationObserver(() => this.#schedule())
    this.#observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    this.#schedule()
  }

  /** Re-evaluate every region (settings changed). */
  update(): void {
    this.#schedule()
  }

  /** Stop observing and remove everything this layer injected. */
  dispose(): void {
    this.#disposed = true
    if (this.#timer !== undefined) window.clearTimeout(this.#timer)
    this.#observer?.disconnect()
    this.#observer = undefined
    for (const controller of this.#inflight) controller.abort()
    this.#inflight.clear()
    saveCache(this.#cache)
    this.clear()
  }

  /** Remove every injected node and claim. */
  clear(): void {
    for (const line of this.#promptLines) line.remove()
    this.#promptLines.clear()
    for (const [region, entry] of this.#entries) {
      entry.node.remove()
      region.removeAttribute(CLAIMED)
    }
    this.#entries.clear()
    this.#queue.length = 0
  }

  #schedule(): void {
    if (this.#disposed) return
    if (this.#timer !== undefined) window.clearTimeout(this.#timer)
    this.#timer = window.setTimeout(() => {
      this.#timer = undefined
      try {
        this.#scan()
      } catch (error) {
        this.log(`inline scan failed: ${String((error as Error)?.message ?? error)}`)
      }
    }, RESCAN_MS)
  }

  #scan(): void {
    if (this.#disposed) return
    const settings = this.getSettings()
    if (!settings.enabled) { this.clear(); return }
    const seen = new Set<HTMLElement>()
    for (const container of Array.from(document.querySelectorAll<HTMLElement>(MARKDOWN))) {
      const manual = container.closest(THINK) !== null
      for (const region of Array.from(container.querySelectorAll<HTMLElement>(REGION))) {
        seen.add(region)
        this.#consider(region, manual)
      }
    }
    for (const region of Array.from(this.#entries.keys())) if (!seen.has(region) || !region.isConnected) this.#retire(region)
    this.#annotatePrompts()
    this.#flush()
  }

  /**
   * Split a user bubble's text at the presentation marker: the translated
   * prompt stays in the bubble, the original moves into a sub-text line.
   *
   * The marker rather than a structural hook, because the bubble renders one
   * prepared `text` string; splitting it here keeps the native bubble chrome,
   * copy button and timestamp untouched. A re-render restores the marker and the
   * next pass splits it again.
   */
  #annotatePrompts(): void {
    for (const bubble of Array.from(document.querySelectorAll<HTMLElement>(BUBBLE))) {
      // 4 is NodeFilter.SHOW_TEXT; the constant is not always global (jsdom, workers).
      const walker = document.createTreeWalker(bubble, 4)
      const hits: Text[] = []
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if ((node.textContent ?? '').includes(PROMPT_ORIGINAL_MARKER)) hits.push(node as Text)
      }
      for (const text of hits) {
        const raw = text.textContent ?? ''
        const at = raw.indexOf(PROMPT_ORIGINAL_MARKER)
        const lead = raw.slice(0, at).replace(/\s+$/u, '')
        const original = raw.slice(at + PROMPT_ORIGINAL_MARKER.length).trim()
        text.textContent = lead
        if (original === '') continue
        const line = document.createElement('div')
        line.setAttribute(OWNED, '1')
        line.className = 'dsh-pt-inline'
        line.textContent = original
        this.#promptLines.add(line)
        const anchor = text.parentElement
        try {
          if (anchor === null || anchor === bubble) bubble.append(line)
          else anchor.insertAdjacentElement('afterend', line)
        } catch (error) {
          this.log(`prompt annotation failed: ${String((error as Error)?.message ?? error)}`)
        }
      }
    }
  }

  /** Claim one region, or re-claim it when its prose changed under us. */
  #consider(region: HTMLElement, manual: boolean): void {
    const source = proseText(region).trim()
    if (!worthTranslating(source)) {
      if (this.#entries.has(region)) this.#retire(region)
      return
    }
    const existing = this.#entries.get(region)
    if (existing !== undefined) {
      // Streaming rewrites the paragraph on every delta: only the settled text
      // is worth a request, and an unchanged settled text is worth none.
      if (existing.source === source && existing.node.isConnected) return
      this.#retire(region)
    }
    const node = document.createElement('div')
    node.setAttribute(OWNED, '1')
    node.className = 'dsh-pt-inline'
    const span = document.createElement('span')
    node.append(span)
    try {
      placeBelow(region, node)
    } catch (error) {
      this.log(`inline placement failed: ${String((error as Error)?.message ?? error)}`)
      return
    }
    region.setAttribute(CLAIMED, '1')
    const entry: Entry = { source, node, span, manual, state: 'idle' }
    this.#entries.set(region, entry)
    const cached = this.#cache.get(`${this.getSettings().target}\u0000${source}`)
    if (cached !== undefined) {
      this.#paint(entry, 'done', cached)
      return
    }
    if (manual) {
      this.#paint(entry, 'idle', '')
      return
    }
    this.#paint(entry, 'pending', '')
    this.#queue.push(entry)
  }

  /** Drop one region's claim and node. */
  #retire(region: HTMLElement): void {
    const entry = this.#entries.get(region)
    if (entry !== undefined) {
      entry.node.remove()
      this.#entries.delete(region)
    }
    region.removeAttribute(CLAIMED)
  }

  /** Send the pending paragraphs, one request per batch. */
  #flush(): void {
    if (this.#queue.length === 0) return
    const pending = this.#queue.splice(0, this.#queue.length)
    for (let start = 0; start < pending.length; start += BATCH) void this.#run(pending.slice(start, start + BATCH))
  }

  /** Translate one entry on demand (a click on the idle marker, or a retry). */
  #request(entry: Entry, force: boolean): void {
    if (force) entry.state = 'idle'
    this.#paint(entry, 'pending', '')
    void this.#run([entry], force)
  }

  /** Paint one entry's state. */
  #paint(entry: Entry, state: Entry['state'], text: string): void {
    entry.state = state
    const { node, span } = entry
    node.style.display = 'block'
    span.style.color = ''
    if (state === 'idle') {
      span.textContent = '… 点击翻译本段'
      span.className = 'dsh-pt-inline-idle'
      node.onclick = () => { if (entry.state === 'idle') this.#request(entry, false) }
      return
    }
    node.onclick = () => { if (entry.state === 'done' || entry.state === 'error') this.#request(entry, true) }
    span.className = ''
    if (state === 'pending') { span.textContent = '…'; return }
    if (state === 'error') {
      span.style.color = 'var(--dsw-alias-label-error, #e5484d)'
      span.textContent = text
      return
    }
    span.textContent = text
  }

  /** Translate one batch and paint its lines. */
  async #run(batch: Entry[], force = false): Promise<void> {
    const settings = this.getSettings()
    const controller = new AbortController()
    this.#inflight.add(controller)
    try {
      const response = await fetch(ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
        body: JSON.stringify({ segments: batch.map(entry => entry.source), target: settings.target }),
      })
      const payload: unknown = await response.json().catch(() => undefined)
      const reply = payload as { ok?: boolean; value?: { segments?: unknown }; error?: { message?: string } } | undefined
      if (reply?.ok !== true) throw new Error(reply?.error?.message ?? `HTTP ${response.status}`)
      const segments = Array.isArray(reply.value?.segments) ? (reply.value.segments as unknown[]) : []
      batch.forEach((entry, index) => {
        if (!entry.node.isConnected) return
        const text = typeof segments[index] === 'string' ? (segments[index] as string).trim() : ''
        if (text === '') { this.#paint(entry, 'error', '（本段暂无译文）'); return }
        this.#cache.set(`${settings.target}\u0000${entry.source}`, text)
        this.#paint(entry, 'done', text)
      })
      if (force) saveCache(this.#cache)
    } catch (error) {
      if (controller.signal.aborted || this.#disposed) return
      const message = String((error as Error)?.message ?? error)
      this.log(`inline translation failed: ${message}`)
      for (const entry of batch) if (entry.node.isConnected) this.#paint(entry, 'error', `译文获取失败：${message}`)
    } finally {
      this.#inflight.delete(controller)
    }
  }
}
