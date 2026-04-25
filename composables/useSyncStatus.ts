import type { YouTubeStatus } from '~/shared/types'

export function useSyncStatus() {
  const { data, refresh } = useFetch<YouTubeStatus>('/api/youtube/status', {
    server: false,
  })

  const isRunning = computed(() => data.value?.lastSync?.status === 'running')
  const lastSync = computed(() => data.value?.lastSync ?? null)
  const isAutoSuggesting = computed(() => data.value?.autoSuggestRunning ?? false)

  const justCompleted = ref(false)
  const justAutoSuggestCompleted = ref(false)

  let completedTimer: ReturnType<typeof setTimeout> | null = null
  let autoSuggestTimer: ReturnType<typeof setTimeout> | null = null
  let pollTimer: ReturnType<typeof setTimeout> | null = null

  watch(isRunning, (running, wasRunning) => {
    if (wasRunning && !running) {
      justCompleted.value = true
      completedTimer = setTimeout(() => {
        justCompleted.value = false
      }, 4000)
    }
  })

  watch(isAutoSuggesting, (running, wasRunning) => {
    if (wasRunning && !running) {
      justAutoSuggestCompleted.value = true
      autoSuggestTimer = setTimeout(() => {
        justAutoSuggestCompleted.value = false
      }, 100) // brief — just enough for watchers to react
    }
  })

  function scheduleNext() {
    // Poll faster when either sync or auto-suggest is active
    const delay = (isRunning.value || isAutoSuggesting.value) ? 3000 : 15000
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
    if (autoSuggestTimer) clearTimeout(autoSuggestTimer)
  })

  return { isRunning, justCompleted, lastSync, isAutoSuggesting, justAutoSuggestCompleted }
}
