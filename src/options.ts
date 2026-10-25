
export const languages = {
  auto: '自动检测', zh: '简体中文', 'zh-TW': '繁體中文', en: 'English', ja: '日本語',
  ko: '한국어', fr: 'Français', de: 'Deutsch', es: 'Español', ru: 'Русский',
  pt: 'Português', it: 'Italiano', ar: 'العربية', hi: 'हिन्दी',
} as const
export type Language = keyof typeof languages
export interface Options {
  enabled: boolean
  source: Language
  target: Exclude<Language, 'auto'>
  type: 'traditional' | 'agent'
  userPrompt: boolean
  reasoning: boolean
  output: boolean
  engine: 'google' | 'baidu' | 'deepl' | 'microsoft'
  apiKey: string
  appId: string
  region: string
  deeplFree: boolean
  provider: string
  model: string
  reasoningEffort: string
  timeoutMs: number
  maxChars: number
  /** Show a small sub-text translation under each assistant paragraph instead of replacing the answer. */
  inline: boolean
  /** Language of that sub-text. */
  inlineTarget: Exclude<Language, 'auto'>
}
export const defaults: Options = {
  enabled: false, source: 'auto', target: 'en', type: 'traditional',
  userPrompt: true, reasoning: false, output: false, engine: 'google',
  apiKey: '', appId: '', region: '', deeplFree: true,
  provider: '', model: '', reasoningEffort: '', timeoutMs: 60000, maxChars: 2000,
  inline: false, inlineTarget: 'zh',
}
