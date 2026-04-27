export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return

  const { authenticated, checkSession } = useAuth()

  // Avoid blocking every single navigation with a network request.
  // If we already know we're authenticated in the local state, proceed instantly.
  if (!authenticated.value) {
    const isOk = await checkSession()
    if (!isOk) return navigateTo('/login', { replace: true })
  }
})
