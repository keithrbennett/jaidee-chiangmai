import { createContext, useContext } from 'react'
import { en, type Messages } from './en'
import { th } from './th'
import { zh } from './zh'

export type { Messages }
export type Lang = 'en' | 'th' | 'zh'

export const LANGUAGES: { code: Lang; htmlLang: string; flag: string; name: string }[] = [
  { code: 'th', htmlLang: 'th', flag: '🇹🇭', name: 'ไทย' },
  { code: 'en', htmlLang: 'en', flag: '🇬🇧', name: 'English' },
  { code: 'zh', htmlLang: 'zh-CN', flag: '🇨🇳', name: '简体中文' },
]

export const MESSAGES: Record<Lang, Messages> = { en, th, zh }

/** First browser language we support, else English. */
export function detectLang(): Lang {
  for (const l of navigator.languages ?? [navigator.language]) {
    const code = l.toLowerCase().split('-')[0]
    if (code === 'th' || code === 'zh' || code === 'en') return code
  }
  return 'en'
}

export interface I18n {
  lang: Lang
  setLang: (lang: Lang) => void
  m: Messages
}

export const I18nContext = createContext<I18n>({ lang: 'en', setLang: () => {}, m: en })

/** Current language and its UI text: `const { m } = useI18n()` then `m.tabs.map`, `m.list.count(n)`. */
export const useI18n = () => useContext(I18nContext)
