import { expect, it, vi } from 'vitest'
import { presentPrompt, installPresentation, PROMPT_ORIGINAL_MARKER, type Definition } from '../src/client/presentation.js'
import { promptAudit } from '../src/audit.js'
import { translatePrompts } from '../src/pipeline.js'
import { createUserMessage } from '@deepseek-ai/dsh-llm'

it('persists original text and language direction alongside the exact model input', async () => {
  const original = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '你好' }] })
  const [sent] = await translatePrompts([original], async () => 'こんにちは', undefined, { source: 'zh', target: 'ja' })
  expect(sent!.content).toEqual([{ type: 'text', text: 'こんにちは' }])
  expect(sent!.id).toBe(original.id)
  const restored = JSON.parse(JSON.stringify(sent))
  expect(promptAudit(restored.source)).toMatchObject({ version: 1, original: original.content, source: 'zh', target: 'ja' })
  expect(presentPrompt(restored, 'chat').content).toEqual(original.content)
  const trajectory = presentPrompt(restored, 'trajectory')
  expect(trajectory.content).toEqual([
    { type: 'text', text: '翻译前 / Original (简体中文)\n你好\n\n翻译后 / Sent to model (日本語)\nこんにちは' },
  ])
  expect(restored.content).toEqual(sent!.content)
  const image = { type: 'image', attachment: { id: 'image' } }
  const mixed = { ...restored, content: [image, { type: 'text', text: 'こん' }, { type: 'text', text: 'にちは' }] }
  expect(presentPrompt(mixed, 'trajectory').content).toEqual([image, ...trajectory.content])
  expect(mixed.content).toHaveLength(3)
})
it('leads the chat bubble with the translated prompt when inline display is on', async () => {
  const original = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '你好' }] })
  const [sent] = await translatePrompts([original], async () => 'Hello', undefined, { source: 'zh', target: 'en' })
  const restored = JSON.parse(JSON.stringify(sent))
  expect(presentPrompt(restored, 'chat', { inline: true }).content).toEqual([
    { type: 'text', text: 'Hello' },
    { type: 'text', text: `${PROMPT_ORIGINAL_MARKER}你好` },
  ])
  expect(presentPrompt(restored, 'chat').content).toEqual(original.content)
  const chat: Definition = { kind: 'input-message', buildViewNode: () => ({ data: restored }) }
  const entries = [chat]
  const dispose = installPresentation({ entries: () => entries, subscribe: () => () => {}, register: () => () => {} }, () => true)
  expect(JSON.stringify(chat.buildViewNode!())).toContain(PROMPT_ORIGINAL_MARKER)
  dispose()
})
it('retranslations use the original instead of translating an older translation', async () => {
  const original = createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: '你好' }] })
  const first = await translatePrompts([original], async () => 'こんにちは', undefined, { source: 'auto', target: 'ja' })
  const translator = vi.fn(async () => 'Hello')
  const [second] = await translatePrompts(first, translator, undefined, { source: 'auto', target: 'en' })
  expect(translator).toHaveBeenCalledWith('你好', undefined)
  expect(promptAudit(second!.source)?.original).toEqual(original.content)
  expect(promptAudit(second!.source)?.target).toBe('en')
})
it('wraps existing and late host definitions, retaining themes, attachments and teardown', () => {
  const source = { kind: 'user', dshPromptTranslation: { version: 1, source: 'zh', target: 'en', original: [{ type: 'text', text: '原文' }, { type: 'image', attachment: { id: 'img' } }] } }
  const message = { content: [{ type: 'text', text: 'translation' }], source }
  const chat: Definition = { kind: 'input-message', buildViewNode: () => ({ key: 'stable', data: message }) }
  const originalChat = chat.buildViewNode
  const entries = [chat]
  let notify: () => void = () => {}
  const dispose = installPresentation({ entries: () => entries, subscribe: listener => { notify = listener; return () => { notify = () => {} } }, register: () => { notify(); return () => {} } })
  expect(chat.buildViewNode!()?.key).toBe('stable')
  expect(chat.buildViewNode!()?.data.content).toEqual(source.dshPromptTranslation.original)
  const trajectory: Definition = { kind: 'trajectory-input-message', buildViewNode: () => ({ data: { kind: 'node', node: message } }) }
  const originalTrajectory = trajectory.buildViewNode
  entries.push(trajectory); notify()
  expect(JSON.stringify(trajectory.buildViewNode!())).toContain('Sent to model')
  dispose()
  expect(chat.buildViewNode).toBe(originalChat)
  expect(trajectory.buildViewNode).toBe(originalTrajectory)
})
it('leaves historical unannotated messages unchanged and refuses malformed metadata', () => {
  const message = { content: [{ type: 'text', text: 'old message' }], source: { kind: 'user' } }
  expect(presentPrompt(message, 'chat')).toBe(message)
  expect(presentPrompt(message, 'trajectory')).toBe(message)
  expect(promptAudit({ dshPromptTranslation: { version: 1, source: 'zh', target: 'en', original: [{ type: 'text', text: null }] } })).toBeUndefined()
})

it('projects assistant comparisons only into trajectory and restores the original definition on unload', async () => {
  const { presentAssistant } = await import('../src/client/presentation.js')
  const { assistantAudit } = await import('../src/audit.js')
  const thought = { type: 'reasoning', text: '译后思考', dshAssistantTranslation: { version: 1, original: 'original reasoning' } }
  const answer = { type: 'text', text: '译后回答', dshAssistantTranslation: { version: 1, original: 'original answer' } }
  const tool = { kind: 'tool-call', callId: 'call-1', name: 'read', argsRaw: '{"path":"a"}' }
  const message = { blocks: [{ kind: 'reasoning', text: thought.text }, { kind: 'text', text: answer.text }, tool], usage: { inputTokens: 12 } }
  const content = [thought, answer, { type: 'tool-call' }]
  const shown = presentAssistant(message, content)
  expect(shown.blocks[0]?.text).toBe('翻译前 / Original\noriginal reasoning\n\n翻译后 / Translation\n译后思考')
  expect(shown.blocks[1]?.text).toContain('original answer')
  expect(shown.blocks[2]).toBe(tool)
  expect(shown.usage).toBe(message.usage)
  expect(message.blocks[1]).toEqual({ kind: 'text', text: '译后回答' })
  expect(presentAssistant(message, [])).toBe(message)
  expect(assistantAudit({ dshAssistantTranslation: { version: 1, original: 3 } })).toBeUndefined()
  const definition: Definition = { kind: 'trajectory-assistant-step', buildViewNode: () => ({ data: { kind: 'assistant', node: message, partial: null } }) }
  const original = definition.buildViewNode
  const dispose = installPresentation({ entries: () => [definition], subscribe: () => () => {}, register: () => () => {} })
  const context = { state: { final: { event: { type: 'assistant/message', data: { message: { content } } } } } }
  expect(JSON.stringify(definition.buildViewNode!(context))).toContain('original reasoning')
  expect(JSON.stringify(definition.buildViewNode!({ state: {} }))).not.toContain('original reasoning')
  dispose()
  expect(definition.buildViewNode).toBe(original)
})
