import { assistantAudit, promptAudit } from '../audit.js'
import { languages } from '../options.js'

interface MessageView { content: readonly unknown[]; source?: unknown; [key: string]: unknown }
interface ViewNode { data: MessageView | { node?: unknown; [key: string]: unknown }; [key: string]: unknown }
/**
 * Invisible separator between the translated prompt and its original inside one
 * bubble text. The annotation layer splits on it and styles the second half as
 * sub-text; a plain render without that layer still shows both halves, so the
 * original is never lost.
 */
export const PROMPT_ORIGINAL_MARKER = '\u2063pt-original:\u2063'

/** Whether the chat bubble should lead with the translated prompt. */
export interface PresentOptions { inline?: boolean }

/** The text blocks of a content array, joined as the bubble renders them. */
function textOf(content: readonly unknown[]): string {
  return content
    .filter((block): block is { type: 'text'; text: string } => !!block && typeof block === 'object'
      && (block as { type?: unknown }).type === 'text' && typeof (block as { text?: unknown }).text === 'string')
    .map(block => block.text)
    .join('\n')
}
export interface Definition {
  kind: string
  target?: string
  buildViewNode?: (...args: unknown[]) => ViewNode | null
}
export interface EventRegistry {
  entries(): readonly Definition[]
  subscribe(listener: () => void): () => void
  register(definition: unknown): () => void
}
/** Change only view data; durable content remains the exact translated model input. */
export function presentPrompt(message: MessageView, target: 'chat' | 'trajectory', options: PresentOptions = {}): MessageView {
  const audit = promptAudit(message.source)
  if (!audit) return message
  if (target === 'chat') {
    // The bubble leads with what the model actually received; the marker keeps
    // the original underneath, where the annotation layer styles it as sub-text.
    if (options.inline !== true) return { ...message, content: audit.original }
    const original = textOf(audit.original)
    if (original.trim() === '') return { ...message, content: audit.original }
    return { ...message, content: [...message.content, { type: 'text', text: `${PROMPT_ORIGINAL_MARKER}${original}` }] }
  }
  const label = (code: string) => languages[code as keyof typeof languages] ?? code
  const isText = (block: unknown): block is { type: 'text'; text: string } =>
    !!block && typeof block === 'object' && (block as { type?: unknown }).type === 'text'
    && typeof (block as { text?: unknown }).text === 'string'
  const original = audit.original.filter(isText).map(block => block.text).join('')
  const translated = message.content.filter(isText).map(block => block.text).join('')
  let inserted = false
  const content = message.content.flatMap(block => {
    if (!isText(block)) return [block]
    if (inserted) return []
    inserted = true
    return [{ type: 'text', text: `翻译前 / Original (${label(audit.source)})\n${original}\n\n翻译后 / Sent to model (${label(audit.target)})\n${translated}` }]
  })
  return { ...message, content }
}
interface AssistantView { blocks: readonly { kind: string; text?: string; [key: string]: unknown }[]; [key: string]: unknown }
interface AssistantContext {
  state?: { final?: { event?: { type?: string; data?: { message?: { content?: readonly unknown[] } } } } }
}
/** Keep native thinking/output grouping; expand only the translated blocks for Trajectory. */
export function presentAssistant(view: AssistantView, content: readonly unknown[]): AssistantView {
  let changed = false
  const blocks = view.blocks.map((block, index) => {
    if (block.kind !== 'text' && block.kind !== 'reasoning') return block
    const raw = content[index] as { type?: string; text?: string } | undefined
    const audit = assistantAudit(raw)
    if (!audit || raw?.type !== block.kind || typeof raw.text !== 'string') return block
    changed = true
    return { ...block, text: `翻译前 / Original\n${audit.original}\n\n翻译后 / Translation\n${raw.text}` }
  })
  return changed ? { ...view, blocks } : view
}
/** Adapt existing host definitions so native bubble actions, themes and attachments survive. */
export function installPresentation(registry: EventRegistry, getInline: () => boolean = () => false): () => void {
  const wrapped = new Map<Definition, { original: NonNullable<Definition['buildViewNode']>; wrapper: NonNullable<Definition['buildViewNode']> }>()
  const reconcile = () => {
    for (const definition of registry.entries()) {
      if (wrapped.has(definition) || !definition.buildViewNode) continue
      if (definition.kind !== 'input-message' && definition.kind !== 'trajectory-input-message' && definition.kind !== 'trajectory-assistant-step') continue
      const original = definition.buildViewNode
      const wrapper: NonNullable<Definition['buildViewNode']> = function (this: unknown, ...args) {
        const node = original.apply(this, args)
        if (!node) return node
        if (definition.kind === 'trajectory-assistant-step') {
          const context = args[0] as AssistantContext | undefined
          const final = context?.state?.final?.event
          const content = final?.type === 'assistant/message' ? final.data?.message?.content : undefined
          const data = node.data as { node?: AssistantView; [key: string]: unknown }
          return content && data.node?.blocks ? { ...node, data: { ...data, node: presentAssistant(data.node, content) } } : node
        }
        if (definition.kind === 'input-message') return { ...node, data: presentPrompt(node.data as MessageView, 'chat', { inline: getInline() }) }
        const data = node.data as { node?: MessageView; [key: string]: unknown }
        return data.node ? { ...node, data: { ...data, node: presentPrompt(data.node, 'trajectory') } } : node
      }
      definition.buildViewNode = wrapper
      wrapped.set(definition, { original, wrapper })
    }
  }
  reconcile()
  const stop = registry.subscribe(reconcile)
  // Public registry registration invalidates already-open view assemblies too.
  const remove = registry.register({ kind: 'dsh-prompt-translation-presentation', match: () => null, start: () => undefined, update: () => undefined, publication: () => 'none' })
  return () => {
    stop()
    for (const [definition, { original, wrapper }] of wrapped) if (definition.buildViewNode === wrapper) definition.buildViewNode = original
    wrapped.clear()
    remove()
  }
}
