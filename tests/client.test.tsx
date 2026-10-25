// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { QuickPicker, SettingsCard, type Props } from '../src/client/components.js'
import { saveSettings, type SettingsApi } from '../src/client/settings.js'
import { TranslateOverlay } from '../src/client/overlay.js'
import { defaults } from '../src/options.js'
import { apply } from '../src/client/index.js'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const cleanup: (() => void)[] = []
afterEach(async () => { await act(async () => { for (const dispose of cleanup.splice(0)) dispose() }); document.body.innerHTML = '' })
function fixture() {
  let current = { ...defaults }
  const api: SettingsApi = {
    describe: vi.fn<SettingsApi['describe']>(async () => ({ ok: true, value: { writable: true, namespaces: [{ ns: 'prompt-translation', value: current, revision: 1 }] } })),
    mutate: vi.fn<SettingsApi['mutate']>(async (_ns, ops) => { for (const op of ops) Object.assign(current, { [op.path[0]!]: op.value }); return { ok: true, value: null } }),
  }
  const listeners = new Set<() => void>()
  const props: Props = { api, subscribe: fn => { listeners.add(fn); return () => { listeners.delete(fn) } } }
  return { props, api, listeners }
}
it('mounts directly after the permission slot, saves a language and cleans its portal on unload', async () => {
  document.body.innerHTML = '<div id="row"><div id="modes"><div data-slot="conversation.input.permission"><button>权限</button></div><div data-slot="conversation.input.plan"><button>计划</button></div></div><div data-slot="conversation.input.left"></div></div>'
  const fixtureState = fixture()
  const root = createRoot(document.querySelector('[data-slot="conversation.input.left"]')!)
  cleanup.push(() => root.unmount())
  await act(async () => root.render(createElement(QuickPicker, fixtureState.props)))
  const permission = document.querySelector('[data-slot="conversation.input.permission"]')!
  expect(permission.nextElementSibling?.querySelector('[aria-label="翻译"]')).not.toBeNull()
  await act(async () => (document.querySelector('[aria-label="翻译"]') as HTMLButtonElement).click())
  const source = document.querySelector('[aria-label="原始语言"]') as HTMLSelectElement
  expect(source.value).toBe('auto')
  expect(document.querySelector('[aria-label="目标语言"] option[value="auto"]')).toBeNull()
  await act(async () => { source.value = 'ja'; source.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(fixtureState.api.mutate).toHaveBeenCalledWith('prompt-translation', [{ op: 'set', path: ['source'], value: 'ja' }], 1)
  const parent = permission.parentElement!
  await act(async () => { permission.remove(); await Promise.resolve() })
  expect(document.querySelector('.dsh-pt-seat')).toBeNull()
  expect(document.querySelector('[data-dsh-prompt-translation-anchor] [aria-label="翻译"]')).not.toBeNull()
  await act(async () => { parent.prepend(permission); await Promise.resolve() })
  expect(permission.nextElementSibling?.querySelector('[aria-label="翻译"]')).not.toBeNull()
  await act(async () => root.unmount())
  cleanup.pop()
  expect(document.querySelector('.dsh-pt-seat')).toBeNull()
  expect(fixtureState.listeners.size).toBe(0)
})
it('retains edited configuration and displays failure when saving is rejected', async () => {
  const f = fixture()
  f.api.mutate = vi.fn<SettingsApi['mutate']>(async () => ({ ok: false, error: { code: 'denied', message: '保存被拒绝' } }))
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); cleanup.push(() => root.unmount())
  await act(async () => root.render(createElement(SettingsCard, f.props)))
  const select = host.querySelector('select[aria-label="原始语言"]') as HTMLSelectElement
  await act(async () => { select.value = 'fr'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  await act(async () => (host.querySelector('button[type=submit]') as HTMLButtonElement).click())
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('保存被拒绝')
  expect(select.value).toBe('fr')
})
it('retries a stale revision without overwriting unrelated settings or secrets', async () => {
  const f = fixture()
  f.api.mutate = vi.fn().mockResolvedValueOnce({ ok: false, error: { code: 'settings/conflict', message: 'conflict' } }).mockResolvedValueOnce({ ok: true, value: null })
  await saveSettings(f.api, { target: 'de' })
  expect(f.api.mutate).toHaveBeenCalledTimes(2)
  expect(f.api.mutate).toHaveBeenLastCalledWith('prompt-translation', [{ op: 'set', path: ['target'], value: 'de' }], 1)
})
it('registers both host slots and revokes styles and subscriptions on unload', () => {
  const f = fixture()
  const disposers: (() => void)[] = []
  const removeSlot = vi.fn()
  const offRemote = vi.fn()
  const offReconnect = vi.fn()
  const register = vi.fn(() => removeSlot)
  apply({
    effect: fn => { const dispose = fn(); if (dispose) disposers.push(dispose) },
    on: () => offReconnect,
    remote: { settings: f.api, $on: () => offRemote },
    slots: { inject: (_name, fn) => fn(), register },
  })
  expect(register.mock.calls.map(call => (call as unknown as [{ name: string }])[0].name)).toEqual(['plugins.bundle.config', 'conversation.input.left', 'shell.overlay'])
  expect(document.querySelector('style[data-dsh-prompt-translation]')).not.toBeNull()
  for (const dispose of disposers.reverse()) dispose()
  expect(removeSlot).toHaveBeenCalledTimes(3)
  expect(offRemote).toHaveBeenCalledOnce()
  expect(offReconnect).toHaveBeenCalledOnce()
  expect(document.querySelector('style[data-dsh-prompt-translation]')).toBeNull()
})

it('refuses to reuse a redacted credential when switching translation providers', async () => {
  const f = fixture()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); cleanup.push(() => root.unmount())
  await act(async () => root.render(createElement(SettingsCard, f.props)))
  const select = [...host.querySelectorAll('select')].find(el => el.value === 'google')!
  await act(async () => { select.value = 'deepl'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  await act(async () => (host.querySelector('button[type=submit]') as HTMLButtonElement).click())
  expect(f.api.mutate).not.toHaveBeenCalled()
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('新服务的 API 密钥')
})
it('ignores stale settings reads that finish after a newer invalidation', async () => {
  const f = fixture()
  let stale: ((value: Awaited<ReturnType<SettingsApi['describe']>>) => void) | undefined
  f.api.describe = vi.fn<SettingsApi['describe']>()
    .mockImplementationOnce(() => new Promise(resolve => { stale = resolve }))
    .mockResolvedValue({ ok: true, value: { writable: true, namespaces: [{ ns: 'prompt-translation', revision: 2, value: { ...defaults, source: 'ja' } }] } })
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); cleanup.push(() => root.unmount())
  await act(async () => root.render(createElement(SettingsCard, f.props)))
  await act(async () => { for (const listener of f.listeners) listener() })
  await act(async () => stale!({ ok: true, value: { writable: true, namespaces: [{ ns: 'prompt-translation', revision: 1, value: defaults }] } }))
  expect((host.querySelector('[aria-label="原始语言"]') as HTMLSelectElement).value).toBe('ja')
})

it('uses an icon-only toggle state and a single compact language row', async () => {
  const f = fixture()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); cleanup.push(() => root.unmount())
  await act(async () => root.render(createElement(QuickPicker, f.props)))
  const button = host.querySelector('button[aria-label="翻译"]') as HTMLButtonElement
  expect(button.textContent).toBe('')
  expect(button.querySelector('[data-translation-disabled]')).not.toBeNull()
  await act(async () => button.click())
  const row = host.querySelector('.dsh-pt-language-row')!
  expect(row.querySelectorAll('select')).toHaveLength(2)
  expect([...row.querySelectorAll('label')].every(label => label.childNodes.length === 1)).toBe(true)
  expect(host.querySelector('.dsh-pt-scope')?.textContent).toBe('* 应用到当前 Profile 的所有会话')
  await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click())
  expect(button.querySelector('[data-translation-disabled]')).toBeNull()
})
it('discards staged settings and collapses the themed card', async () => {
  const f = fixture()
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); cleanup.push(() => root.unmount())
  await act(async () => root.render(createElement(SettingsCard, f.props)))
  const select = host.querySelector('[aria-label="原始语言"]') as HTMLSelectElement
  await act(async () => { select.value = 'fr'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(host.querySelector('.dsh-pt-tag')?.textContent).toBe('未保存')
  await act(async () => (host.querySelector('.dsh-pt-card-footer button[type=button]') as HTMLButtonElement).click())
  expect(select.value).toBe('auto')
  expect(host.querySelector('.dsh-pt-tag')).toBeNull()
  await act(async () => (host.querySelector('.dsh-pt-card-header') as HTMLButtonElement).click())
  expect((host.querySelector('.dsh-pt-card-body') as HTMLElement).hidden).toBe(true)
})
it('opens the corner panel from the badge and keeps sub-text exclusive with output', async () => {
  const f = fixture()
  await f.api.mutate('prompt-translation', [{ op: 'set', path: ['output'], value: true }], 1)
  const host = document.createElement('div'); document.body.append(host)
  const root = createRoot(host); cleanup.push(() => root.unmount())
  await act(async () => root.render(createElement(TranslateOverlay, f.props)))
  const badge = host.querySelector('.dsh-pt-badge') as HTMLButtonElement
  expect(badge.textContent).toBe('译·关')
  await act(async () => badge.click())
  expect(host.querySelector('.dsh-pt-panel')).not.toBeNull()
  const boxes = [...host.querySelectorAll('.dsh-pt-panel input[type=checkbox]')] as HTMLInputElement[]
  await act(async () => boxes[boxes.length - 1]!.click())
  expect(f.api.mutate).toHaveBeenLastCalledWith('prompt-translation', [
    { op: 'set', path: ['inline'], value: true },
    { op: 'set', path: ['output'], value: false },
  ], 1)
  await act(async () => (host.querySelector('.dsh-pt-panel-close') as HTMLButtonElement).click())
  expect(host.querySelector('.dsh-pt-panel')).toBeNull()
})
