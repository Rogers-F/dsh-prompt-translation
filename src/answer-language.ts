/**
 * Keep the visible answer in the language the reader's sub-text is translated
 * from.
 *
 * With inline mode on, the shape of one turn is:
 *
 *   prompt  (zh) --translated--> en      (what the model reads)
 *   answer  (en) --rendered----> en + zh (original, plus sub-text)
 *
 * The second half only holds if the model actually answers in `target`. A
 * workspace instruction ("reply in Simplified Chinese") outranks the language of
 * the prompt it just read, so without this section the answer comes back in
 * Chinese: there is nothing English to keep, and the sub-text layer correctly
 * finds nothing to translate. This section states the display contract once, in
 * the system prompt, instead of rewriting every user turn.
 *
 * @module dsh-prompt-translation/answer-language
 */

import type { Context } from '@deepseek-ai/cordis'
import { languages, readConfig, type LiveConfig } from './config.js'

/** Section name; stable so a reload replaces rather than duplicates it. */
export const ANSWER_SECTION_NAME = 'dsh-prompt-translation/answer-language'

/** One assembled prompt section. */
export interface PromptSection {
  name: string
  text: string
}

/**
 * The section text, or `undefined` when inline mode is off.
 *
 * @param options - the live plugin options.
 * @returns the instruction to append, or nothing.
 */
export function answerLanguageSection(options: { enabled: boolean; inline: boolean; target: string }): PromptSection | undefined {
  if (!options.enabled || !options.inline) return undefined
  const label = languages[options.target as keyof typeof languages] ?? options.target
  return {
    name: ANSWER_SECTION_NAME,
    text: [
      `Always write your visible reply in ${label}.`,
      'The user reads that reply with a translation underneath each paragraph, so the reply itself must stay in that language.',
      'This overrides any earlier instruction to answer in another language; keep tool use, code, paths, identifiers and quoted text as they are.',
    ].join(' '),
  }
}

/**
 * Append the answer-language section to every assembled system prompt.
 *
 * The waterfall's assembly type lives in the Host package this plugin does not
 * depend on, so the listener is typed structurally here.
 *
 * @param ctx - the plugin context.
 * @param config - live plugin configuration.
 */
export function registerAnswerLanguage(ctx: Context, config: LiveConfig): void {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const handler = async (assembly: any, _context: any, next: any): Promise<any> => {
    const result = await next()
    let section: PromptSection | undefined
    try {
      section = answerLanguageSection(readConfig(config))
    } catch {
      return result
    }
    if (section === undefined) return result
    const sections: PromptSection[] = Array.isArray(result?.sections) ? result.sections.filter((entry: PromptSection) => entry?.name !== ANSWER_SECTION_NAME) : []
    return { ...result, sections: [...sections, section] }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
  ctx.on('system-prompt/assemble', handler)
}
