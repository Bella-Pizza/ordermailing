import { ref, computed } from 'vue'
import { translations, type Lang } from './i18n'

const lang = ref<Lang>(
  typeof window !== 'undefined' ? ((localStorage.getItem('app_lang') as Lang) ?? 'en') : 'en',
)

export function useLocale() {
  function setLang(l: Lang) {
    lang.value = l
    if (typeof window !== 'undefined') {
      localStorage.setItem('app_lang', l)
    }
  }

  function t(key: string, params?: Record<string, string | number>): string {
    const dict = translations[lang.value] ?? translations.en
    let str: string = (dict as Record<string, string>)[key] ?? (translations.en as Record<string, string>)[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replaceAll(`{${k}}`, String(v))
      }
    }
    return str
  }

  const locale = computed(() => (lang.value === 'fr' ? 'fr-FR' : 'en-GB'))

  return { lang, setLang, t, locale }
}
