import { franc } from 'franc-min'

interface LangResult {
  lang: string // BCP-47
  confidence: number
}

// franc returns ISO 639-3 codes, map common ones to BCP-47
const ISO_TO_BCP47: Record<string, string> = {
  spa: 'es',
  eng: 'en',
  por: 'pt',
  fra: 'fr',
  deu: 'de',
  ita: 'it',
  cat: 'ca',
  nld: 'nl',
  pol: 'pl',
  rus: 'ru',
  jpn: 'ja',
  zho: 'zh',
  ara: 'ar',
  hin: 'hi',
  kor: 'ko',
  tur: 'tr',
  swe: 'sv',
  nor: 'no',
  dan: 'da',
  fin: 'fi',
}

export function detectLanguage(text: string): LangResult {
  if (!text || text.trim().length < 10) {
    return { lang: 'und', confidence: 0 }
  }

  const result = franc(text, { minLength: 5 })

  if (result === 'und') {
    return { lang: 'und', confidence: 0 }
  }

  const bcp47 = ISO_TO_BCP47[result] ?? result.substring(0, 2)

  // franc doesn't return confidence — estimate based on text length
  // Short texts are less reliable
  const confidence = text.length > 50 ? 0.85 : text.length > 20 ? 0.65 : 0.5

  return { lang: bcp47, confidence }
}
