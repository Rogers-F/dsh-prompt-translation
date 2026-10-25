import { installPresentation, type EventRegistry } from './presentation.js'
import { css } from './styles.js'
import { SettingsCard, QuickPicker, type Props } from './components.js'
import { loadSettings, type SettingsApi, type Catalog } from './settings.js'
import { InlineLayer } from './inline.js'
import { installSelectionTranslation } from './selection.js'
import { TranslateOverlay } from './overlay.js'
import { defaults, type Options } from '../options.js'
export const name = 'dsh-prompt-translation'
export const inject = ['slots', 'remote', 'remote.settings']
interface ClientContext {
  effect(factory: () => (() => void) | void): void
  inject?(services: string[], callback: (ctx: { uiConversation: { events: EventRegistry }; effect(factory: () => () => void): void }) => void): unknown
  on(event: string, callback: (...args: unknown[]) => void): () => void
  logger?: { warn?(message: string): void }
  remote: { settings: SettingsApi; session?: Catalog; $on(event: string, callback: (...args: unknown[]) => void): () => void }
  slots: {
    inject(name: string, callback: () => (() => void)): () => void
    register(options: { name: string; id: string; key?: string; order?: number; inject: () => Props }, component: typeof SettingsCard): () => void
  }
}

/** Register plugin-list settings, a composer control, and the inline sub-text layer; dispose with the fiber. */
export function apply(ctx: ClientContext): void {
  // The inline layer reads a settings snapshot kept in sync with the settings
  // document: the layer is DOM code, not a React subtree, so it cannot use the
  // settings hook the card uses. The prompt presentation reads it too, to decide
  // whether the bubble leads with the translated text.
  let snapshot: Options = { ...defaults }
  ctx.inject?.(['uiConversation'], child => {
    child.effect(() => installPresentation(child.uiConversation.events, () => snapshot.inline))
  })
  const listeners = new Set<() => void>()
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
  const props = { api: ctx.remote.settings, catalog: ctx.remote.session, subscribe }
  ctx.effect(() => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({ name: 'plugins.bundle.config', id: name, key: name, inject: () => props }, SettingsCard)))
  ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: name, order: -1000, inject: () => props }, QuickPicker)))
  // The frame-wide badge and its short-path panel: the composer control is easy
  // to miss, and the panel's test button is the quickest way to prove the Host
  // route is alive.
  ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: `${name}-frame`, inject: () => props },
    TranslateOverlay as unknown as typeof SettingsCard,
  )))
  // The inline layer reads a settings snapshot kept in sync with the settings
  // document: the layer is DOM code, not a React subtree, so it cannot use the
  // settings hook the card uses.
  const layer = new InlineLayer(
    () => ({ enabled: snapshot.enabled && snapshot.inline, target: snapshot.inlineTarget }),
    message => ctx.logger?.warn?.(`dsh-prompt-translation: ${message}`),
  )
  const reload = async (): Promise<void> => {
    try {
      const result = await loadSettings(ctx.remote.settings)
      snapshot = result.value
      layer.update()
    } catch (error) {
      ctx.logger?.warn?.(`dsh-prompt-translation: inline settings unavailable (${String((error as Error)?.message ?? error)})`)
    }
  }
  ctx.effect(() => {
    layer.start()
    void reload()
    return () => layer.dispose()
  })
  // Selecting text in the transcript gets the same translator through the same
  // route; the panel and the sub-text lines can never drift apart.
  ctx.effect(() => installSelectionTranslation(() => snapshot.inlineTarget, message => ctx.logger?.warn?.(`dsh-prompt-translation: ${message}`)))
  ctx.effect(() => {
    const style = document.createElement('style')
    style.dataset.dshPromptTranslation = ''
    style.textContent = css
    document.head.append(style)
    const refresh = () => { for (const listener of listeners) listener() }
    const dispose = ctx.remote.$on('settings/document-updated', ns => {
      if (ns === 'prompt-translation') refresh()
      void reload()
    })
    const reconnect = ctx.on('connection/reset', () => { refresh(); void reload() })
    return () => { dispose(); reconnect(); style.remove(); listeners.clear() }
  })
}
