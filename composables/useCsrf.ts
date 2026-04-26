export function useCsrf(): string {
  if (import.meta.server) return ''
  return useState<string>('csrf-token', () => '').value
}

export function useCsrfHeaders(): Record<string, string> {
  const token = useCsrf()
  return token ? { 'X-CSRF-Token': token } : {}
}
