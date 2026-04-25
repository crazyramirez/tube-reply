import { detectLanguage } from '../server/services/language-detect'

const testTexts = [
  "Hola, ¿cómo estás? 🔥🚀",
  "This is a test in English with some emojis! 😃👍",
  "Obrigado pelo vídeo, muito bom! 🇧🇷",
  "C'est magnifique! ✨",
  "La cara de loca 😂😂😂, bonita la blusa ❤️",
  "Das ist ein sehr interessantes Video. 🇩🇪",
  "🔥🚀😍", // Solo emojis, debería ser 'und'
  "Hola", // Muy corto, debería ser 'und'
  "Muy buena info! 👍👍👍", // Debería detectar 'es' correctamente al quitar emojis
  "Me encanta este canal ❤️❤️❤️",
  "Subscribed! 🔔",
]

console.log("\n🧪 Test de Detección de Idioma (con limpieza de emojis)\n" + "=".repeat(50))

testTexts.forEach(text => {
  const result = detectLanguage(text)
  const status = result.lang === 'und' ? '❓' : '✅'
  
  console.log(`Texto: "${text}"`)
  console.log(`${status} Idioma detectado: ${result.lang.toUpperCase()} | Confianza: ${result.confidence}`)
  console.log("-".repeat(50))
})
