export default defineNuxtPlugin(async () => {
  // Fetch CSRF token on app start and store in cookie
  await $fetch('/api/auth/csrf').catch(() => {})
})
