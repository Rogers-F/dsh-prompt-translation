import Schema from '@deepseek-ai/schemastery'
import { languages, defaults, type Options } from './options.js'
export { languages, defaults, type Options, type Language } from './options.js'
const lang = Object.keys(languages)
const field = <T>(schema: Schema<T>, description: string) => schema.description(description).volatile()
export const Config = Schema.object({
  enabled: field(Schema.boolean().default(false), '启用翻译'),
  source: field(Schema.union(lang).default('auto'), '原始语言（自动检测）'),
  target: field(Schema.union(lang.filter(x => x !== 'auto')).default('en'), '目标语言'),
  type: field(Schema.union(['traditional', 'agent']).default('traditional'), '翻译类型：传统接口 / 智能体'),
  userPrompt: field(Schema.boolean().default(true), '翻译用户提示词'),
  reasoning: field(Schema.boolean().default(false), '翻译思考内容'),
  output: field(Schema.boolean().default(false), '翻译输出内容'),
  engine: field(Schema.union(['google', 'baidu', 'deepl', 'microsoft']).default('google'), '传统翻译服务'),
  apiKey: field(Schema.string().role('secret').default(''), '翻译 API 密钥（百度为密钥，非 App ID）'),
  appId: field(Schema.string().default(''), '百度 App ID'),
  region: field(Schema.string().default(''), '微软资源区域'),
  deeplFree: field(Schema.boolean().default(true), '使用 DeepL Free API'),
  provider: field(Schema.string().default(''), '已有模型提供商 ID'),
  model: field(Schema.string().default(''), '已有模型 ID'),
  reasoningEffort: field(Schema.string().default(''), '推理强度 ID，空值使用模型默认值'),
  timeoutMs: field(Schema.number().min(1000).max(300000).step(1).default(60000), '翻译超时（毫秒）'),
  maxChars: field(Schema.number().min(100).max(4000).step(1).default(2000), '每次翻译最大 Unicode 字符数'),
  inline: field(Schema.boolean().default(false), '英文段落下方显示小字译文（保留原文，不做整段替换）'),
  inlineTarget: field(Schema.union(lang.filter(x => x !== 'auto')).default('zh'), '小字译文语言'),
})
export type LiveConfig = { [K in keyof Options]: Options[K] | { get(): Options[K] } }
/** Read one consistent configuration snapshot for a translation operation. */
export function readConfig(config: Partial<LiveConfig>): Options {
  const result = { ...defaults }
  for (const key of Object.keys(defaults) as (keyof Options)[]) {
    const value = config[key]
    if (value !== undefined) Object.assign(result, { [key]: typeof value === 'object' ? value.get() : value })
  }
  return result
}
