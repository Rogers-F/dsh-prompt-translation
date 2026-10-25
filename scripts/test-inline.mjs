/**
 * Headless check for the inline sub-text layer.
 *
 * The layer is DOM code, so it is exercised against a real DOM (jsdom) with a
 * stubbed Host route: one English paragraph must gain a translation line, a
 * Chinese paragraph must gain none, and a reasoning paragraph must wait for a
 * click. Run with the app's Node runtime:
 *
 *   ELECTRON_RUN_AS_NODE=1 "G:/DeepSeek Harness/DeepSeek Harness.exe" scripts/test-inline.mjs
 */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { JSDOM } from 'jsdom'

const out = await mkdtemp(join(tmpdir(), 'dsh-pt-inline-'))
try {
  const bundle = join(out, 'inline.mjs')
  await build({
    stdin: {
      contents: [
        "export { InlineLayer } from './inline.ts'",
        "export { PROMPT_ORIGINAL_MARKER } from './presentation.ts'",
      ].join('\n'),
      resolveDir: join(process.cwd(), 'src/client'),
      loader: 'ts',
    },
    bundle: true,
    platform: 'neutral',
    format: 'esm',
    target: 'es2022',
    outfile: bundle,
  })

  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1/' })
  const { window } = dom
  globalThis.window = window
  globalThis.document = window.document
  globalThis.Node = window.Node
  globalThis.HTMLElement = window.HTMLElement
  globalThis.MutationObserver = window.MutationObserver
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body)
    return {
      ok: true,
      status: 200,
      json: async () => ({ ok: true, value: { segments: body.segments.map(text => `译:${text}`) } }),
    }
  }

  const { InlineLayer, PROMPT_ORIGINAL_MARKER } = await import(pathToFileURL(bundle).href)

  const settle = () => new Promise(resolve => setTimeout(resolve, 320))
  const assistant = document.createElement('div')
  assistant.innerHTML = '<div class="_markdown_1ypvv_5"><p>Hello world, this is prose.</p><p>这是中文段落。</p></div>'
  document.body.append(assistant)
  const reasoning = document.createElement('div')
  reasoning.setAttribute('data-variant', 'think')
  reasoning.innerHTML = '<div class="_markdown_1ypvv_5"><p>Let me think about this.</p></div>'
  document.body.append(reasoning)
  // A user bubble as the presentation half prepares it: translated prompt, marker, original.
  const bubble = document.createElement('div')
  bubble.className = 'LOmM4q_bubble'
  bubble.textContent = `Hello, this is a test.${PROMPT_ORIGINAL_MARKER}你好，这是一个测试。`
  document.body.append(bubble)

  const layer = new InlineLayer(() => ({ enabled: true, target: 'zh' }), message => console.log('[layer]', message))
  layer.start()
  await settle()

  const lines = [...document.querySelectorAll('[data-dsh-pt-inline]')]
  const text = lines.map(node => node.textContent)
  const reasoningLine = reasoning.querySelector('[data-dsh-pt-inline]')
  const checks = [
    ['assistant paragraph translated', text.some(value => value === '译:Hello world, this is prose.')],
    ['chinese paragraph untouched', !text.some(value => value.includes('这是中文段落'))],
    ['reasoning waits for a click', reasoningLine !== null && reasoningLine.textContent.includes('点击翻译本段')],
    ['prompt bubble leads with the translated text', bubble.textContent.trim().startsWith('Hello, this is a test.')],
    ['prompt original becomes sub-text', bubble.querySelector('[data-dsh-pt-inline]')?.textContent === '你好，这是一个测试。'],
  ]

  reasoningLine?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await settle()
  checks.push(['reasoning translates after click', reasoningLine?.textContent === '译:Let me think about this.'])

  const failed = checks.filter(([, ok]) => !ok)
  for (const [name, ok] of checks) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  layer.dispose()
  if (document.querySelectorAll('[data-dsh-pt-inline]').length !== 0) {
    failed.push(['dispose removes every node', false])
    console.log('FAIL  dispose removes every node')
  } else console.log('PASS  dispose removes every node')
  if (failed.length > 0) process.exitCode = 1
} finally {
  await rm(out, { recursive: true, force: true })
}
