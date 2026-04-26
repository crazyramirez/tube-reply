import { francAll } from 'franc'

interface LangResult {
  lang: string // BCP-47
  confidence: number
}

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

// Spanish-exclusive: ñ/¡/¿ chars + words not in Portuguese
const RE_ES_CHARS = /[ñ¡¿]/
const RE_ES_WORDS = /\b(gracias|siempre|también|nosotros|vosotros|hermoso|hermosa|hermosos|hermosas|tejido|tejidos|enseñanza|enseñanzas|cosas|muy|bueno|buena|buenos|buenas)\b/i

// Portuguese-exclusive: ão ending + lh/nh digraphs + words not in Spanish
const RE_PT_CHARS = /ão\b|ã\b/
const RE_PT_DIGRAPHS = /\b\w*(?:lh|nh)\w*\b/
const RE_PT_WORDS = /\b(obrigado|obrigada|você|vocês|não|coração|muito|ótimo|olá|tudo|também)\b/i

function disambiguateRomance(text: string): 'es' | 'pt' | null {
  // Definitive Spanish chars — no false positives
  if (RE_ES_CHARS.test(text)) return 'es'

  // Definitive Portuguese patterns
  if (RE_PT_CHARS.test(text)) return 'pt'
  if (RE_PT_DIGRAPHS.test(text)) return 'pt'

  // Word-count tiebreaker
  const esHits = (text.match(RE_ES_WORDS) ?? []).length
  const ptHits = (text.match(RE_PT_WORDS) ?? []).length

  if (esHits > 0 && esHits > ptHits) return 'es'
  if (ptHits > 0 && ptHits > esHits) return 'pt'

  return null
}

function cleanTextForDetection(text: string): string {
  return text
    .replace(/\p{Emoji_Presentation}/gu, '')
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function detectLanguage(text: string): LangResult {
  const cleaned = cleanTextForDetection(text)

  if (!cleaned || cleaned.length < 5) {
    return { lang: 'und', confidence: 0 }
  }

  // Rule-based pass first — catches Spanish/Portuguese confusion
  const ruleLang = disambiguateRomance(cleaned)
  if (ruleLang) {
    return { lang: ruleLang, confidence: 0.97 }
  }

  // francAll returns [isoCode, distance] sorted ascending (0 = perfect match)
  const results = francAll(cleaned, {
    minLength: 5,
    only: Object.keys(ISO_TO_BCP47),
  })

  if (!results.length || results[0][0] === 'und') {
    return { lang: 'und', confidence: 0 }
  }

  const [bestCode, bestDist] = results[0]
  const secondDist = results[1]?.[1] ?? 1
  const gap = secondDist - bestDist

  // If top-2 are spa/por and gap is tight, run disambiguation
  const top2Bcp = results.slice(0, 2).map(r => ISO_TO_BCP47[r[0]])
  if (top2Bcp.includes('es') && top2Bcp.includes('pt') && gap < 0.1) {
    const fallback = disambiguateRomance(cleaned)
    if (fallback) return { lang: fallback, confidence: 0.82 }
  }

  // Confidence: blend of absolute distance quality + gap to next candidate
  const confidence = Math.min(0.95, Math.max(0.1, (1 - bestDist) * 0.6 + gap * 0.4))

  const bcp47 = ISO_TO_BCP47[bestCode] ?? bestCode.substring(0, 2)
  return { lang: bcp47, confidence }
}
