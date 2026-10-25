/**
 * Host route behind the inline sub-text layer.
 *
 * The browser half cannot call `ctx.llm` — the model lives in the Host — so the
 * annotation layer POSTs the paragraphs it wants translated to this route and
 * gets one translated string per paragraph back. The route reuses the plugin's
 * own translator, so the inline layer obeys exactly the same provider, model,
 * reasoning effort, timeout and segmentation limits as every other translation
 * this plugin performs; there is no second translation stack.
 *
 * The route is registered on `webServer` inside a soft `ctx.inject` layer: a
 * non-web Host (the CLI, a headless profile) simply never mounts it, and the
 * annotation layer degrades to "no sub-text" instead of failing the plugin.
 *
 * The trust fence is the app's own: `connection.requestRejection(req)` is what
 * the shipped API routes use, and it covers Host/Origin trust plus the browser
 * session token. Translation is never served to an unauthorized origin.
 *
 * @module dsh-prompt-translation/inline-route
 */

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-llm'
import { languages, readConfig, type Language, type LiveConfig } from './config.js'
import { createTranslator } from './translation.js'

/** Route the browser half posts to. Exact path; the prefix below covers it. */
const ROUTE_PATH = '/prompt-translation/inline'

/** Prefix the route table keys on, so one plugin owns one namespace. */
const ROUTE_PREFIX = '/prompt-translation'

/** One request carries at most this many paragraphs. */
const MAX_SEGMENTS = 60

/** Longest single paragraph the route will translate, in code points. */
const MAX_SEGMENT_CHARS = 4000

/** Request body ceiling; annotation payloads are prose, never files. */
const MAX_BODY_BYTES = 512 * 1024

/** Parallel model calls per request, so one long answer cannot serialize forever. */
const CONCURRENCY = 3

/** The Host services this route needs, captured through one inject layer. */
interface HostContext {
  connection: { requestRejection(req: unknown): number | undefined }
  webServer: { register(route: unknown): () => void }
  effect(factory: () => () => void, label?: string): void
}

interface Reply {
  ok: boolean
  value?: unknown
  error?: { code: string; message: string }
}

/** Answer one JSON payload. */
function writeJson(res: ServerResponseLike, status: number, payload: Reply): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

/** A rejected request, with a message the annotation layer can show verbatim. */
function reject(res: ServerResponseLike, status: number, message: string): void {
  writeJson(res, status, { ok: false, error: { code: 'prompt-translation/inline', message } })
}

/** Minimal shape of the Node response the route writes to. */
interface ServerResponseLike {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

/** Minimal shape of the Node request the route reads from. */
interface ServerRequestLike extends AsyncIterable<Uint8Array> {
  method?: string
}

/** Read a bounded request body as UTF-8 text. */
async function readBody(req: ServerRequestLike): Promise<string> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.byteLength
    if (size > MAX_BODY_BYTES) throw new Error('请求体过大')
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** Accept only a language this plugin actually knows about. */
function normalizeTarget(value: unknown, fallback: Exclude<Language, 'auto'>): Exclude<Language, 'auto'> {
  return typeof value === 'string' && value in languages && value !== 'auto' ? (value as Exclude<Language, 'auto'>) : fallback
}

/**
 * Translate a batch of paragraphs with bounded parallelism.
 *
 * One failure does not sink the batch: the paragraph reports its own empty
 * string and the layer paints that line as failed, which is the honest picture
 * — the other paragraphs still have their sub-text.
 */
async function translateBatch(translate: (text: string) => Promise<string>, texts: string[]): Promise<string[]> {
  const out = new Array<string>(texts.length).fill('')
  let cursor = 0
  const workers = Array.from({ length: Math.min(CONCURRENCY, texts.length) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= texts.length) return
      const text = texts[index]!
      try {
        out[index] = await translate(text)
      } catch {
        out[index] = ''
      }
    }
  })
  await Promise.all(workers)
  return out
}

/**
 * Register the inline translation route.
 *
 * Never throws: a Host composition without `connection`/`webServer` (a CLI run,
 * a headless profile) keeps the plugin working for prompt and stream
 * translation and simply has no inline layer.
 *
 * @param ctx - the plugin context.
 * @param config - live plugin configuration, read per request so a settings
 * change takes effect on the next paragraph rather than at the next restart.
 */
export function registerInlineRoute(ctx: Context, config: LiveConfig): void {
  const logger = (ctx as { logger?: { info?(message: string): void; warn?(message: string): void } }).logger
  try {
    ctx.inject(['connection', 'webServer'], (hostCtx: Context) => {
      const host = hostCtx as unknown as HostContext
      const handler = async (req: ServerRequestLike, res: ServerResponseLike): Promise<void> => {
        const rejection = host.connection.requestRejection(req)
        if (rejection !== undefined) {
          res.writeHead(rejection)
          res.end(rejection === 401 ? 'unauthorized' : 'forbidden')
          return
        }
        if (req.method !== 'POST') {
          res.writeHead(405)
          res.end()
          return
        }
        let body: unknown
        try {
          body = JSON.parse(await readBody(req))
        } catch {
          reject(res, 400, '请求体不是合法 JSON')
          return
        }
        if (body === null || typeof body !== 'object') {
          reject(res, 400, '请求体必须是对象')
          return
        }
        const payload = body as { segments?: unknown; target?: unknown }
        if (!Array.isArray(payload.segments)) {
          reject(res, 400, 'segments 必须是数组')
          return
        }
        const texts = payload.segments
          .filter((entry): entry is string => typeof entry === 'string')
          .map(entry => entry.slice(0, MAX_SEGMENT_CHARS))
          .filter(entry => entry.trim() !== '')
          .slice(0, MAX_SEGMENTS)
        if (texts.length === 0) {
          writeJson(res, 200, { ok: true, value: { segments: [], target: normalizeTarget(payload.target, 'zh') } })
          return
        }
        const options = readConfig(config)
        if (!options.enabled) {
          reject(res, 409, '翻译插件已停用')
          return
        }
        const target = normalizeTarget(payload.target, options.inlineTarget)
        const translate = createTranslator({ ...options, source: 'auto', target }, ctx.llm)
        const segments = await translateBatch(text => translate(text), texts)
        writeJson(res, 200, { ok: true, value: { segments, target } })
      }
      const route = { kind: 'prefix', path: ROUTE_PREFIX, handler }
      host.effect(() => host.webServer.register(route), 'dsh-prompt-translation: inline route')
      logger?.info?.(`dsh-prompt-translation: inline route listening on ${ROUTE_PATH}`)
    })
  } catch (error) {
    logger?.warn?.(`dsh-prompt-translation: inline route unavailable (${String((error as Error)?.message ?? error)})`)
  }
}
