import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-agent'
import { isAgentLoopRequest, type StreamChunk, type UserMessage } from '@deepseek-ai/dsh-llm'
import { Config, readConfig, type LiveConfig, type Options } from './config.js'
import { createTranslator } from './translation.js'
import { translatePrompts, translateStream } from './pipeline.js'
import { detectLanguage, type ReturnLanguage } from './direction.js'
import { registerInlineRoute } from './inline-route.js'
import { registerAnswerLanguage } from './answer-language.js'

export const name = 'dsh-prompt-translation'
export const inject = ['llm']
export { Config }
interface TurnTranslation { options: Options; language?: ReturnLanguage; failure?: string }
/** Register translation through the host's lifecycle-owned public waterfalls. */
export function apply(ctx: Context, config: LiveConfig): void {
  const lifecycle = new AbortController()
  // Session keys isolate parallel conversations; agent teardown releases their state.
  const turns = new Map<string, TurnTranslation>()
  const owners = new WeakSet<object>()
  ctx.effect(() => () => { lifecycle.abort(new Error('翻译插件已卸载')); turns.clear() })
  const signalFor = (signal?: AbortSignal) => AbortSignal.any([lifecycle.signal, ...(signal ? [signal] : [])])
  ctx.on('agent/pre-step', async ({ agent, signal, step }, next) => {
    const decision = await next()
    const options = readConfig(config)
    if (decision.kind !== 'enter') return decision
    const key = String(agent.session.id)
    if (!options.enabled) { turns.delete(key); return decision }
    if (!owners.has(agent)) {
      owners.add(agent)
      agent.ctx.effect(() => () => { turns.delete(key) })
    }
    const human: UserMessage[] = decision.messages.filter(message => message.source.kind === 'user')
    if (step === 1) turns.delete(key)
    if (!human.length) return decision
    const state: TurnTranslation = { options }
    turns.delete(key); turns.set(key, state)
    try {
      if (options.reasoning || options.output) {
        const text = human.flatMap(message => message.content.flatMap(block => block.type === 'text' ? [block.text] : [])).join('\n')
        state.language = await detectLanguage(text, options, ctx.llm, signalFor(signal))
      }
      if (!options.userPrompt) return decision
      return { ...decision, messages: await translatePrompts(decision.messages, createTranslator(options, ctx.llm), signalFor(signal), { source: state.language ?? options.source, target: options.target }) }
    } catch (error) {
      // Claiming precedes pre-step; throwing here loses the visible user/message.
      // Admit the original batch, then fail the stream BEFORE invoking the main model.
      state.failure = signal.aborted ? '翻译已取消' : error instanceof Error ? error.message : '翻译失败'
      return decision
    }
  })
  ctx.on('llm/stream', (request, next) => {
    if (!isAgentLoopRequest(request)) return next()
    const state = request.sessionId === undefined ? undefined : turns.get(String(request.sessionId))
    const options = state?.options ?? readConfig(config)
    if (!options.enabled) return next()
    const failure = state?.failure
    if (failure) return (async function* (): AsyncIterable<StreamChunk> {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSLATION_FAILED', message: failure } } }
    })()
    if (!options.reasoning && !options.output) return next()
    const language = options.source === 'auto' ? state?.language : options.source
    if (!language) return (async function* (): AsyncIterable<StreamChunk> {
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'TRANSLATION_LANGUAGE_UNKNOWN', message: '未确定本轮原始语言，请明确选择原始语言后重试。' } } }
    })()
    // Answers may already use the user's language, so detect their source independently.
    return translateStream(next(), options, createTranslator({ ...options, source: 'auto', target: language }, ctx.llm), signalFor(request.signal))
  })
  // The inline layer translates paragraphs the Host already rendered; it needs a
  // route, not a waterfall, so it is registered beside the two hooks above.
  registerInlineRoute(ctx, config)
  // With the sub-text layer on, the answer must stay in the target language or
  // there is nothing English to annotate; state that once in the system prompt.
  registerAnswerLanguage(ctx, config)
}
