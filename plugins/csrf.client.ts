export default defineNuxtPlugin(async () => {
  const csrfToken = useState<string>('csrf-token', () => '')
  try {
    const data = await $fetch<{ token: string }>('/api/auth/csrf')
    csrfToken.value = data.token
  } catch {}
})
