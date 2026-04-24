export default defineNuxtRouteMiddleware(async (to) => {
  if (to.path === '/login') return

  const { data } = await useFetch<{ authenticated: boolean }>('/api/auth/session')
  if (!data.value?.authenticated) {
    return navigateTo('/login')
  }
})
