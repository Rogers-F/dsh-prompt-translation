import { expect, it } from 'vitest'
import { ANSWER_SECTION_NAME, answerLanguageSection } from '../src/answer-language.js'

it('states the answer-language contract only while the sub-text layer is on', () => {
  const on = answerLanguageSection({ enabled: true, inline: true, target: 'en' })
  expect(on?.name).toBe(ANSWER_SECTION_NAME)
  expect(on?.text).toContain('Always write your visible reply in English')
  expect(on?.text).toContain('overrides any earlier instruction')
  expect(answerLanguageSection({ enabled: true, inline: false, target: 'en' })).toBeUndefined()
  expect(answerLanguageSection({ enabled: false, inline: true, target: 'en' })).toBeUndefined()
})
it('names the configured target language and tolerates an unknown code', () => {
  expect(answerLanguageSection({ enabled: true, inline: true, target: 'ja' })?.text).toContain('日本語')
  expect(answerLanguageSection({ enabled: true, inline: true, target: 'xx' })?.text).toContain('xx')
})
