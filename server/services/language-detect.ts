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
const RE_ES_WORDS = /\b(gracias|siempre|también|nosotros|vosotros|hermoso|hermosa|hermosos|hermosas|tejido|tejidos|enseñanza|enseñanzas|cosas|muy|bueno|buena|buenos|buenas|esta|este|esto|esta|hola|donde|como|cuando|porque|quiero|hacer|tengo|tiene)\b/i

// Portuguese-exclusive: ão ending + lh/nh digraphs + words not in Spanish
const RE_PT_CHARS = /ão\b|ã\b/
const RE_PT_DIGRAPHS = /\b\w*(?:lh|nh)\w*\b/
const RE_PT_WORDS = /\b(obrigado|obrigada|você|vocês|não|coração|muito|ótimo|olá|tudo|também|valeu|muito|esta|este|pode|fazer|tenho|tem)\b/i

// English common short words (to avoid misdetecting as Spanish)
const RE_EN_WORDS = /\b(thank|thanks|good|great|amazing|love|nice|beautiful|please|help|how|when|where|why|want|make|have|has|this|that|these|those)\b/i

const COMMON_SHORT_ES = /\b(si|no|ya|va|tu|el|la|un|es|da)\b/i

function disambiguateRomance(text: string): 'es' | 'pt' | 'en' | null {
  // Definitive Spanish chars — no false positives
  if (RE_ES_CHARS.test(text)) return 'es'

  // Definitive Portuguese patterns
  if (RE_PT_CHARS.test(text)) return 'pt'
  if (RE_PT_DIGRAPHS.test(text)) return 'pt'

  // Word-count tiebreaker
  const esHits = (text.match(RE_ES_WORDS) ?? []).length
  const ptHits = (text.match(RE_PT_WORDS) ?? []).length
  const enHits = (text.match(RE_EN_WORDS) ?? []).length
  const shortEsHits = (text.match(COMMON_SHORT_ES) ?? []).length

  if (esHits > 0 || shortEsHits > 0) {
    if (esHits >= ptHits && esHits >= enHits) return 'es'
  }
  if (enHits > 0 && enHits > esHits && enHits > ptHits) return 'en'
  if (ptHits > 0 && ptHits > esHits && ptHits > enHits) return 'pt'

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

  if (!cleaned) {
    return { lang: 'und', confidence: 0 }
  }

  // Rule-based pass first — catches Spanish/Portuguese confusion and short words
  const ruleLang = disambiguateRomance(cleaned)
  if (ruleLang) {
    return { lang: ruleLang, confidence: 0.97 }
  }

  // For very short comments (e.g. "Hola", "Genial"), default to 'es' if it looks like romance
  if (cleaned.length < 12) {
    // If it has Spanish/Portuguese vowels and no English-only patterns
    if (/[aeiouáéíóú]/i.test(cleaned) && !/\b(the|and|for|with)\b/i.test(cleaned)) {
      return { lang: 'es', confidence: 0.5 }
    }
  }

  // francAll returns [isoCode, distance] sorted ascending (0 = perfect match)
  const results = francAll(cleaned, {
    minLength: 3, // Lowered from 5 to catch more
    only: Object.keys(ISO_TO_BCP47),
  })

  if (!results.length || results[0][0] === 'und') {
    // Final fallback for the specific channel context: default to 'es'
    return { lang: 'es', confidence: 0.1 }
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
  
  // If it's a rare language (like 'qu', 'ny', 'li') and confidence is not very high,
  // it's probably a misidentification of a short Spanish/Portuguese comment.
  const commonLangs = ['es', 'en', 'pt', 'fr', 'it', 'de', 'tr']
  if (!commonLangs.includes(bcp47) && confidence < 0.6) {

      return { lang: 'es', confidence: 0.3 }
  }

  return { lang: bcp47, confidence }
}

