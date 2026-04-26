import { detectLanguage } from '../server/services/language-detect'

const testTexts = [
  { text: "Hola, ¿cómo estás? 🔥🚀", expected: 'es' },
  { text: "This is a test in English with some emojis! 😃👍", expected: 'en' },
  { text: "Obrigado pelo vídeo, muito bom! 🇧🇷", expected: 'pt' },
  { text: "C'est magnifique! ✨", expected: 'fr' },
  { text: "La cara de loca 😂😂😂, bonita la blusa ❤️", expected: 'es' },
  { text: "Das ist ein sehr interessantes Video. 🇩🇪", expected: 'de' },
  { text: "🔥🚀😍", expected: 'und' },
  { text: "Hola", expected: 'und' },
  { text: "Muy buena info! 👍👍👍", expected: 'es' },
  { text: "Me encanta este canal ❤️❤️❤️", expected: 'es' },
  { text: "Subscribed! 🔔", expected: 'en' },
  // Caso problemático original — Rioplatense español detectado como portugués
  { text: "Que DIVINA que sos MonaMonisima!!!!!! Que hermosos tejidos mostras siempre!!!!!!!! Gracias por tus enseñanzas,Gracias por inspirar a otros, como a mi , a hacer cosas bonitas!!! ERES DIVINA!!!!!❤❤", expected: 'es' },
  // Más casos Romance similares
  { text: "Que lindo canal! Obrigada por compartilhar isso com a gente.", expected: 'pt' },
  { text: "Sempre que vejo seus vídeos fico feliz! Não para de postar!", expected: 'pt' },
  { text: "Siempre me alegras el día con tus vídeos, gracias de corazón.", expected: 'es' },
]

console.log("\n🧪 Test de Detección de Idioma (con limpieza de emojis)\n" + "=".repeat(50))

let passed = 0
testTexts.forEach(({ text, expected }) => {
  const result = detectLanguage(text)
  const ok = result.lang === expected
  if (ok) passed++
  const status = ok ? '✅' : `❌ (expected ${expected.toUpperCase()})`
  const short = text.length > 60 ? text.slice(0, 57) + '...' : text
  console.log(`Texto: "${short}"`)
  console.log(`${status} Detectado: ${result.lang.toUpperCase()} | Confianza: ${result.confidence.toFixed(2)}`)
  console.log("-".repeat(60))
})
console.log(`\nResultado: ${passed}/${testTexts.length} correctos`)
