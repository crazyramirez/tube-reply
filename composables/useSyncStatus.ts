import type { YouTubeStatus } from '~/shared/types'

export function useSyncStatus() {
  const { data, refresh } = useFetch<YouTubeStatus>('/api/youtube/status', {
    server: false,
  })

  const isRunning = computed(() => data.value?.lastSync?.status === 'running')
  const lastSync = computed(() => data.value?.lastSync ?? null)

  const justCompleted = ref(false)
  let completedTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null

  watch(isRunning, (running, wasRunning) => {
    if (wasRunning && !running) {
      justCompleted.value = true
      completedTimer = setTimeout(() => {
        justCompleted.value = false
      }, 4000)
    }
  })

  function scheduleNext() {
    const delay = isRunning.value ? 3000 : 15000
    pollTimer = setTimeout(async () => {
      await refresh()
      scheduleNext()
    }, delay)
  }

  onMounted(() => {
    refresh().then(() => scheduleNext())
  })

  onUnmounted(() => {
    if (pollTimer) clearTimeout(pollTimer)
    if (completedTimer) clearTimeout(completedTimer)
  })

  return { isRunning, justCompleted, lastSync }
}
