
export default defineEventHandler(async (event) => {
  return {
    env_gemini: !!process.env.GEMINI_API_KEY,
    env_openai: !!process.env.OPENAI_API_KEY,
    process_env_keys: Object.keys(process.env).filter(k => k.includes('API_KEY')),
    raw_gemini: process.env.GEMINI_API_KEY ? 'HIDDEN' : 'EMPTY',
  }
})
