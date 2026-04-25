<script setup lang="ts">
import type { YouTubeStatus } from '~/shared/types'

definePageMeta({ middleware: 'auth' })

const toast = useToast()
const { t, locale, setLocale } = useI18n()

const { data: ytStatus, refresh } = await useFetch<YouTubeStatus>('/api/youtube/status')

const route = useRoute()
const youtubeConnected = computed(() => route.query.youtube_connected === '1')
const youtubeError = computed(() => route.query.youtube_error as string | undefined)

const SYNC_COOLDOWN_MINUTES = 30
const SYNC_QUOTA_COST = 123
const MAX_QUOTA_PER_DAY = 10000

const quotaUsed = computed(() => ytStatus.value?.dailyQuotaUsed ?? 0)
const quotaPct = computed(() => Math.min(100, Math.round((quotaUsed.value / MAX_QUOTA_PER_DAY) * 100)))
const quotaBarClass = computed(() =>
  quotaPct.value >= 90 ? 'bg-red-500' : quotaPct.value >= 70 ? 'bg-amber-500' : 'bg-emerald-500'
)

const syncing = ref(false)
const connecting = ref(false)
const disconnecting = ref(false)
const syncWarning = ref<{ minutesAgo: number; minutesLeft: number } | null>(null)

const languageOptions = computed(() => [
  { label: '🇬🇧 ' + t('settings.language_english'), value: 'en' },
  { label: '🇪🇸 ' + t('settings.language_spanish'), value: 'es' },
])

async function connectYouTube() {
  connecting.value = true
  try {
    const { url } = await $fetch<{ url: string }>('/api/youtube/connect')
    window.location.href = url
  }
  catch {
    toast.add({ title: t('settings.connect_failed'), color: 'red' })
    connecting.value = false
  }
}

async function disconnectYouTube() {
  disconnecting.value = true
  try {
    await $fetch('/api/youtube/disconnect', { method: 'DELETE', headers: useCsrfHeaders() })
    toast.add({ title: t('settings.disconnect_success'), color: 'yellow' })
    await refresh()
  }
  catch {
    toast.add({ title: t('settings.disconnect_failed'), color: 'red' })
  }
  finally {
    disconnecting.value = false
  }
}

async function syncNow(force = false) {
  if (!force && ytStatus.value?.lastSync?.completedAt) {
    const minutesAgo = Math.floor((Date.now() - new Date(ytStatus.value.lastSync.completedAt).getTime()) / 60000)
    if (minutesAgo < SYNC_COOLDOWN_MINUTES) {
      syncWarning.value = { minutesAgo, minutesLeft: SYNC_COOLDOWN_MINUTES - minutesAgo }
      setTimeout(() => { syncWarning.value = null }, 6000)
      return
    }
  }
  syncWarning.value = null
  syncing.value = true
  try {
    await $fetch('/api/youtube/sync', { method: 'POST', headers: useCsrfHeaders() })
    toast.add({ title: t('settings.sync_started'), color: 'green' })
  }
  catch {
    toast.add({ title: t('settings.sync_failed'), color: 'red' })
  }
  finally {
    syncing.value = false
  }
}
</script>

<template>
  <div>
    <div class="mb-7">
      <h1 class="text-2xl font-bold text-white tracking-tight">{{ $t('settings.title') }}</h1>
      <p class="text-slate-500 text-sm mt-0.5">{{ $t('settings.subtitle') }}</p>
    </div>

    <div
      v-if="youtubeConnected"
      class="flex items-center gap-2.5 text-emerald-300 text-sm bg-emerald-500/[0.08] border border-emerald-500/20 rounded-xl px-4 py-3 mb-5"
    >
      <UIcon name="i-heroicons-check-circle" class="w-4 h-4 flex-shrink-0 text-emerald-400" />
      {{ $t('settings.connected_success') }}
    </div>

    <div
      v-if="youtubeError"
      class="flex items-start gap-2.5 text-red-300 text-sm bg-red-500/[0.08] border border-red-500/20 rounded-xl px-4 py-3 mb-5"
    >
      <UIcon name="i-heroicons-exclamation-circle" class="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
      {{ $t('settings.connection_error', { error: youtubeError }) }}
    </div>

    <div class="space-y-5 max-w-2xl">

      <!-- Language selector -->
      <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-white/[0.06] flex items-center gap-2">
          <UIcon name="i-heroicons-language" class="w-5 h-5 text-indigo-400 shrink-0" />
          <span class="font-semibold text-slate-200">{{ $t('settings.language_title') }}</span>
        </div>
        <div class="p-6">
          <p class="text-slate-500 text-sm mb-4">{{ $t('settings.language_subtitle') }}</p>
          <div class="flex gap-2">
            <button
              v-for="opt in languageOptions"
              :key="opt.value"
              class="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all duration-150 cursor-pointer"
              :class="locale === opt.value
                ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300'
                : 'bg-white/[0.03] border-white/[0.08] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'"
              @click="setLocale(opt.value as 'en' | 'es')"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </div>

      <!-- YouTube Connection -->
      <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-white/[0.06] flex items-center gap-2">
          <svg class="w-5 h-5 text-red-500 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
          </svg>
          <span class="font-semibold text-slate-200">{{ $t('settings.youtube_connection') }}</span>
        </div>

        <div class="p-6">
          <div v-if="ytStatus?.connected && ytStatus.channel" class="space-y-5">
            <div class="flex items-center gap-4">
              <img
                v-if="ytStatus.channel.thumbnailUrl"
                :src="ytStatus.channel.thumbnailUrl"
                class="w-12 h-12 rounded-full ring-2 ring-white/10"
                alt="Channel"
              />
              <div v-else class="w-12 h-12 rounded-full bg-white/[0.06] flex items-center justify-center">
                <UIcon name="i-heroicons-user" class="w-6 h-6 text-slate-600" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-white">{{ ytStatus.channel.title }}</p>
                <p class="text-xs text-slate-500 mt-0.5">
                  {{ $t('settings.channel_info', { subscribers: ytStatus.channel.subscriberCount, videos: ytStatus.channel.videoCount }) }}
                </p>
              </div>
              <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span class="text-xs font-medium text-emerald-400">{{ $t('settings.connected') }}</span>
              </div>
            </div>

            <div v-if="ytStatus.lastSync" class="space-y-2">
              <div
                class="border rounded-xl px-4 py-3 text-xs space-y-2.5"
                :class="ytStatus.lastSync.status === 'failed'
                  ? 'bg-red-500/[0.06] border-red-500/20'
                  : ytStatus.lastSync.status === 'running'
                    ? 'bg-blue-500/[0.06] border-blue-500/20'
                    : 'bg-white/[0.03] border-white/[0.06]'"
              >
                <!-- Header row -->
                <div class="flex items-center gap-2">
                  <span
                    class="font-semibold uppercase tracking-wide"
                    :class="{
                      'text-red-400': ytStatus.lastSync.status === 'failed',
                      'text-blue-400': ytStatus.lastSync.status === 'running',
                      'text-emerald-400': ytStatus.lastSync.status === 'completed',
                      'text-slate-400': !['failed','running','completed'].includes(ytStatus.lastSync.status),
                    }"
                  >
                    {{ ytStatus.lastSync.status }}
                  </span>
                  <span class="text-slate-600">·</span>
                  <span class="text-slate-500 capitalize">{{ ytStatus.lastSync.syncType }}</span>
                  <span class="text-slate-600">·</span>
                  <span class="text-slate-500">
                    {{ ytStatus.lastSync.completedAt
                      ? new Date(ytStatus.lastSync.completedAt).toLocaleString()
                      : ytStatus.lastSync.startedAt
                        ? new Date(ytStatus.lastSync.startedAt).toLocaleString()
                        : '-' }}
                  </span>
                </div>

                <!-- Stats grid -->
                <div class="grid grid-cols-4 gap-2">
                  <div class="bg-white/[0.04] rounded-lg px-2.5 py-1.5 text-center">
                    <div class="text-white font-semibold text-sm">{{ ytStatus.lastSync.videosProcessed ?? 0 }}</div>
                    <div class="text-slate-600 mt-0.5">{{ $t('settings.videos') }}</div>
                  </div>
                  <div class="bg-white/[0.04] rounded-lg px-2.5 py-1.5 text-center">
                    <div class="text-white font-semibold text-sm">{{ ytStatus.lastSync.commentsFound ?? 0 }}</div>
                    <div class="text-slate-600 mt-0.5">{{ $t('settings.found') }}</div>
                  </div>
                  <div class="bg-white/[0.04] rounded-lg px-2.5 py-1.5 text-center">
                    <div class="text-emerald-400 font-semibold text-sm">+{{ ytStatus.lastSync.newComments ?? 0 }}</div>
                    <div class="text-slate-600 mt-0.5">{{ $t('settings.new') }}</div>
                  </div>
                  <div class="bg-white/[0.04] rounded-lg px-2.5 py-1.5 text-center">
                    <div class="text-amber-400 font-semibold text-sm">{{ ytStatus.lastSync.quotaUsed ?? 0 }}</div>
                    <div class="text-slate-600 mt-0.5">{{ $t('settings.quota') }}</div>
                  </div>
                </div>

                <!-- Error message -->
                <div
                  v-if="ytStatus.lastSync.status === 'failed' && ytStatus.lastSync.errorMessage"
                  class="text-red-400/80 leading-relaxed"
                >
                  {{ ytStatus.lastSync.errorMessage?.replace(/<[^>]+>/g, '') }}
                </div>
              </div>
            </div>

            <!-- Daily quota bar -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-slate-500 font-medium">{{ $t('settings.daily_quota') }}</span>
                <span :class="quotaPct >= 90 ? 'text-red-400' : quotaPct >= 70 ? 'text-amber-400' : 'text-slate-400'">
                  {{ quotaUsed.toLocaleString() }} / {{ MAX_QUOTA_PER_DAY.toLocaleString() }}
                </span>
              </div>
              <div class="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-500"
                  :class="quotaBarClass"
                  :style="`width: ${quotaPct}%`"
                />
              </div>
            </div>

            <div class="space-y-2">
              <div class="flex gap-2">
                <button
                  class="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06] text-slate-300 hover:text-white text-sm font-medium transition-all duration-150 cursor-pointer disabled:opacity-50"
                  :disabled="syncing"
                  @click="syncNow()"
                >
                  <UIcon name="i-heroicons-arrow-path" class="w-4 h-4" :class="syncing ? 'animate-spin' : ''" />
                  {{ syncing ? $t('settings.syncing') : $t('settings.sync_now') }}
                </button>
                <button
                  class="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.08] hover:bg-red-500/[0.14] text-red-400 text-sm font-medium transition-all duration-150 cursor-pointer disabled:opacity-50"
                  :disabled="disconnecting"
                  @click="disconnectYouTube"
                >
                  <UIcon name="i-heroicons-x-mark" class="w-4 h-4" :class="disconnecting ? 'animate-spin' : ''" />
                  {{ $t('settings.disconnect') }}
                </button>
              </div>

              <div
                v-if="syncWarning"
                class="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs"
              >
                <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <p class="text-amber-300 font-semibold">{{ $t('settings.sync_warning_title', { m: syncWarning.minutesAgo }) }}</p>
                  <p class="text-amber-500/80">{{ $t('settings.sync_warning_cost', { cost: SYNC_QUOTA_COST, m: syncWarning.minutesLeft }) }}</p>
                </div>
                <button
                  class="shrink-0 text-amber-400 hover:text-white font-bold cursor-pointer transition-colors ml-1"
                  @click="syncNow(true)"
                >
                  {{ $t('settings.force') }}
                </button>
              </div>
            </div>
          </div>

          <div v-else class="space-y-4">
            <p class="text-slate-500 text-sm">{{ $t('settings.connect_hint') }}</p>
            <button
              class="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-all duration-150 cursor-pointer disabled:opacity-50 shadow-lg shadow-red-900/30"
              :disabled="connecting"
              @click="connectYouTube"
            >
              <UIcon v-if="connecting" name="i-heroicons-arrow-path" class="w-4 h-4 animate-spin" />
              <svg v-else class="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
              </svg>
              {{ connecting ? $t('settings.redirecting') : $t('settings.connect_channel') }}
            </button>
          </div>
        </div>
      </div>

      <!-- Config info -->
      <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden">
        <div class="px-6 py-4 border-b border-white/[0.06]">
          <span class="font-semibold text-slate-200">{{ $t('settings.configuration') }}</span>
        </div>
        <div class="p-6 space-y-3">
          <p class="text-sm text-slate-500">
            {{ $t('settings.config_hint').split('.env')[0] }}
            <code class="bg-white/[0.06] border border-white/[0.08] px-1.5 py-0.5 rounded-lg text-slate-300 text-xs font-mono">.env</code>
            {{ $t('settings.config_hint').split('.env')[1]?.split('.env.example')[0] }}
            <code class="bg-white/[0.06] border border-white/[0.08] px-1.5 py-0.5 rounded-lg text-slate-300 text-xs font-mono">.env.example</code>
            {{ $t('settings.config_hint').split('.env.example')[1] }}
          </p>
          <div class="space-y-2">
            <div
              v-for="item in [
                { env: 'SYNC_INTERVAL_MINUTES', labelKey: 'settings.sync_interval' },
                { env: 'MAX_QUOTA_PER_DAY', labelKey: 'settings.daily_quota_guard' },
                { env: 'LOCKOUT_DURATION_MINUTES', labelKey: 'settings.login_lockout' },
              ]"
              :key="item.env"
              class="flex items-center gap-3 text-sm text-slate-600"
            >
              <span class="w-1 h-1 rounded-full bg-slate-700 shrink-0" />
              {{ $t(item.labelKey) }}:
              <code class="bg-white/[0.04] border border-white/[0.06] px-1.5 py-0.5 rounded-lg text-slate-500 text-xs font-mono">{{ item.env }}</code>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Added empty style block to help SFC compiler distinguish parts */
</style>
