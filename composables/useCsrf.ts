export function useCsrf(): string {
  if (import.meta.server) return ''
  return document.cookie.match(/csrf_token=([^;]+)/)?.[1] ?? ''
}

export function useCsrfHeaders(): Record<string, string> {
  const token = useCsrf()
  return token ? { 'X-CSRF-Token': token } : {}
}
