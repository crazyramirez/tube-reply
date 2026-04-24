export function useAuth() {
  const authenticated = useState('auth', () => false)

  async function login(password: string) {
    await $fetch('/api/auth/login', {
      method: 'POST',
      body: { password },
      headers: { 'X-CSRF-Token': useCsrfToken() },
    })
    authenticated.value = true
    await navigateTo('/dashboard')
  }

  async function logout() {
    await $fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'X-CSRF-Token': useCsrfToken() },
    }).catch(() => {})
    authenticated.value = false
    await navigateTo('/login')
  }

  async function checkSession() {
    const { authenticated: ok } = await $fetch<{ authenticated: boolean }>('/api/auth/session')
    authenticated.value = ok
    return ok
  }

  return { authenticated, login, logout, checkSession }
}

function useCsrfToken(): string {
  if (import.meta.server) return ''
  return document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? ''
}
