export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()

  router.onError((error) => {
    if (error?.message?.includes('Failed to fetch dynamically imported module')) {
      window.location.reload()
    }
  })

  nuxtApp.hook('app:error', (error: any) => {
    if (error?.message?.includes('Failed to fetch dynamically imported module')) {
      window.location.reload()
    }
  })
})
