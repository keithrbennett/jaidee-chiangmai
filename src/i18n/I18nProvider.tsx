import { useEffect, type ReactNode } from 'react'
import { useLocalStorage } from '../lib/useLocalStorage'
import { detectLang, I18nContext, LANGUAGES, MESSAGES, type Lang } from '.'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [stored, setLang] = useLocalStorage<Lang>('jaidee.lang', detectLang())
  const lang: Lang = stored in MESSAGES ? stored : 'en'

  useEffect(() => {
    document.documentElement.lang = LANGUAGES.find((l) => l.code === lang)!.htmlLang
  }, [lang])

  return <I18nContext.Provider value={{ lang, setLang, m: MESSAGES[lang] }}>{children}</I18nContext.Provider>
}
