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

const currentSection = ref('general')
const sections = computed(() => [
  { id: 'general', label: t('settings.language_title'), icon: 'i-heroicons-cog-6-tooth' },
  { id: 'youtube', label: t('settings.youtube_connection'), icon: 'i-heroicons-play-circle' },
  { id: 'system', label: t('settings.configuration'), icon: 'i-heroicons-cpu-chip' },
])

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
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="mb-8">
      <h1 class="text-3xl font-bold text-white tracking-tight">{{ $t('settings.title') }}</h1>
      <p class="text-slate-400 mt-1.5">{{ $t('settings.subtitle') }}</p>
    </div>

    <!-- Alerts -->
    <div class="space-y-4 mb-8">
      <div
        v-if="youtubeConnected"
        class="flex items-center gap-3 text-emerald-300 text-sm bg-emerald-500/[0.08] border border-emerald-500/20 rounded-2xl px-5 py-4 backdrop-blur-md"
      >
        <UIcon name="i-heroicons-check-circle" class="w-5 h-5 flex-shrink-0 text-emerald-400" />
        <span class="font-medium">{{ $t('settings.connected_success') }}</span>
      </div>

      <div
        v-if="youtubeError"
        class="flex items-start gap-3 text-red-300 text-sm bg-red-500/[0.08] border border-red-500/20 rounded-2xl px-5 py-4 backdrop-blur-md"
      >
        <UIcon name="i-heroicons-exclamation-circle" class="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" />
        <span class="font-medium">{{ $t('settings.connection_error', { error: youtubeError }) }}</span>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <!-- Sidebar Navigation -->
      <div class="lg:col-span-3 space-y-6">
        <nav class="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-2.5 backdrop-blur-xl">
          <button
            v-for="section in sections"
            :key="section.id"
            @click="currentSection = section.id"
            class="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200"
            :class="currentSection === section.id
              ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
              : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] border border-transparent'"
          >
            <UIcon :name="section.icon" class="w-5 h-5" />
            {{ section.label }}
          </button>
        </nav>

        <!-- Status Summary Widget -->
        <div class="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 space-y-5 backdrop-blur-xl">
          <div class="flex items-center justify-between">
            <span class="text-xs font-bold text-slate-500 uppercase tracking-wider">YouTube Status</span>
            <div
              class="w-2 h-2 rounded-full"
              :class="ytStatus?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'"
            />
          </div>

          <div v-if="ytStatus?.connected && ytStatus.channel" class="space-y-4">
            <div class="flex items-center gap-3">
              <img
                v-if="ytStatus.channel.thumbnailUrl"
                :src="ytStatus.channel.thumbnailUrl"
                class="w-10 h-10 rounded-full ring-2 ring-white/10"
                alt="Channel"
              />
              <div class="min-w-0">
                <p class="text-sm font-semibold text-white truncate">{{ ytStatus.channel.title }}</p>
                <p class="text-[10px] text-slate-500 uppercase tracking-tight mt-0.5">Verified Channel</p>
              </div>
            </div>

            <!-- Mini Quota -->
            <div class="space-y-1.5 pt-2 border-t border-white/[0.05]">
              <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <span>Daily Quota</span>
                <span :class="quotaPct >= 90 ? 'text-red-400' : quotaPct >= 70 ? 'text-amber-400' : 'text-slate-400'">
                  {{ quotaPct }}%
                </span>
              </div>
              <div class="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <div
                  class="h-full rounded-full transition-all duration-700"
                  :class="quotaBarClass"
                  :style="`width: ${quotaPct}%`"
                />
              </div>
            </div>
          </div>
          <div v-else class="text-center py-2">
            <p class="text-xs text-slate-500 italic">Not connected</p>
          </div>
        </div>
      </div>

      <!-- Main Content -->
      <div class="lg:col-span-9 space-y-6">
        <TransitionGroup
          name="fade"
          tag="div"
          class="space-y-6"
        >
          <!-- General Settings -->
          <div v-if="currentSection === 'general'" key="general" class="space-y-6">
            <div class="bg-white/[0.03] border border-white/[0.08] rounded-3xl overflow-hidden backdrop-blur-xl">
              <div class="px-8 py-6 border-b border-white/[0.06] flex items-center gap-3">
                <div class="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                  <UIcon name="i-heroicons-language" class="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h3 class="font-bold text-xl text-white">{{ $t('settings.language_title') }}</h3>
                  <p class="text-slate-500 text-sm">{{ $t('settings.language_subtitle') }}</p>
                </div>
              </div>
              <div class="p-8">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    v-for="opt in languageOptions"
                    :key="opt.value"
                    class="group relative flex flex-col items-start gap-4 p-6 rounded-2xl border text-sm font-semibold transition-all duration-300 cursor-pointer overflow-hidden"
                    :class="locale === opt.value
                      ? 'bg-indigo-500/10 border-indigo-500/40 text-white'
                      : 'bg-white/[0.02] border-white/[0.08] text-slate-400 hover:border-white/20 hover:bg-white/[0.04]'"
                    @click="setLocale(opt.value as 'en' | 'es')"
                  >
                    <div
                      class="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 transition-opacity duration-300"
                      :class="{ 'opacity-100': locale === opt.value }"
                    />
                    <span class="text-3xl filter saturate-[0.8]">{{ opt.label.split(' ')[0] }}</span>
                    <div class="relative z-10">
                      <p class="text-lg font-bold">{{ opt.label.split(' ')[1] }}</p>
                      <p class="text-xs text-slate-500 font-medium mt-1">
                        {{ locale === opt.value ? 'Selected' : 'Click to select' }}
                      </p>
                    </div>
                    <UIcon
                      v-if="locale === opt.value"
                      name="i-heroicons-check-circle"
                      class="absolute top-4 right-4 w-6 h-6 text-indigo-400"
                    />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- YouTube Settings -->
          <div v-if="currentSection === 'youtube'" key="youtube" class="space-y-6">
            <div class="bg-white/[0.03] border border-white/[0.08] rounded-3xl overflow-hidden backdrop-blur-xl">
              <div class="px-8 py-6 border-b border-white/[0.06] flex items-center gap-3">
                <div class="p-2 rounded-xl bg-red-500/10 border border-red-500/20">
                  <UIcon name="i-heroicons-play-circle" class="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h3 class="font-bold text-xl text-white">{{ $t('settings.youtube_connection') }}</h3>
                  <p class="text-slate-500 text-sm">{{ $t('settings.connect_hint') }}</p>
                </div>
              </div>

              <div class="p-8">
                <div v-if="ytStatus?.connected && ytStatus.channel" class="space-y-8">
                  <!-- Channel Details Grid -->
                  <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div class="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-center gap-5">
                      <img
                        v-if="ytStatus.channel.thumbnailUrl"
                        :src="ytStatus.channel.thumbnailUrl"
                        class="w-16 h-16 rounded-2xl ring-4 ring-white/5 shadow-2xl shadow-black/50"
                        alt="Channel"
                      />
                      <div class="min-w-0">
                        <p class="text-xl font-bold text-white truncate">{{ ytStatus.channel.title }}</p>
                        <p class="text-sm text-slate-500 mt-1">
                          {{ $t('settings.channel_info', { subscribers: ytStatus.channel.subscriberCount, videos: ytStatus.channel.videoCount }) }}
                        </p>
                      </div>
                    </div>

                    <!-- Sync Status Info -->
                    <div class="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex flex-col justify-center">
                      <div class="flex items-center gap-2.5 text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                        <UIcon name="i-heroicons-clock" class="w-4 h-4 text-slate-600" />
                        Last Synchronization
                      </div>
                      <p class="text-lg font-semibold text-slate-200">
                        {{ ytStatus.lastSync?.completedAt
                          ? new Date(ytStatus.lastSync.completedAt).toLocaleString()
                          : 'Never synchronized' }}
                      </p>
                      <p class="text-xs text-slate-500 mt-1.5 capitalize" v-if="ytStatus.lastSync">
                        Mode: {{ ytStatus.lastSync.syncType }} · Status:
                        <span :class="ytStatus.lastSync.status === 'failed' ? 'text-red-400' : 'text-emerald-400'">
                          {{ ytStatus.lastSync.status }}
                        </span>
                      </p>
                    </div>
                  </div>

                  <!-- Stats Grid -->
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-4" v-if="ytStatus.lastSync">
                    <div
                      v-for="stat in [
                        { label: $t('settings.videos'), value: ytStatus.lastSync.videosProcessed ?? 0, icon: 'i-heroicons-video-camera', color: 'text-white' },
                        { label: $t('settings.found'), value: ytStatus.lastSync.commentsFound ?? 0, icon: 'i-heroicons-magnifying-glass', color: 'text-white' },
                        { label: $t('settings.new'), value: '+' + (ytStatus.lastSync.newComments ?? 0), icon: 'i-heroicons-plus-circle', color: 'text-emerald-400' },
                        { label: $t('settings.quota'), value: ytStatus.lastSync.quotaUsed ?? 0, icon: 'i-heroicons-bolt', color: 'text-amber-400' },
                      ]"
                      :key="stat.label"
                      class="p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center group hover:bg-white/[0.05] transition-colors"
                    >
                      <UIcon :name="stat.icon" class="w-5 h-5 mx-auto mb-2.5 text-slate-500" />
                      <div class="text-2xl font-bold transition-transform group-hover:scale-110 duration-300" :class="stat.color">{{ stat.value }}</div>
                      <div class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">{{ stat.label }}</div>
                    </div>
                  </div>

                  <!-- Error Alert if failed -->
                  <div
                    v-if="ytStatus.lastSync?.status === 'failed' && ytStatus.lastSync.errorMessage"
                    class="p-5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm leading-relaxed"
                  >
                    <div class="flex items-center gap-2 font-bold mb-1.5 uppercase text-xs tracking-wider">
                      <UIcon name="i-heroicons-exclamation-triangle" class="w-4 h-4" />
                      Sync Error
                    </div>
                    {{ ytStatus.lastSync.errorMessage?.replace(/<[^>]+>/g, '') }}
                  </div>

                  <!-- Actions -->
                  <div class="flex flex-wrap gap-4 pt-4 border-t border-white/[0.06]">
                    <button
                      class="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all duration-200 cursor-pointer disabled:opacity-50 shadow-xl shadow-indigo-900/20"
                      :disabled="syncing"
                      @click="syncNow()"
                    >
                      <UIcon name="i-heroicons-arrow-path" class="w-5 h-5" :class="syncing ? 'animate-spin' : ''" />
                      {{ syncing ? $t('settings.syncing') : $t('settings.sync_now') }}
                    </button>

                    <button
                      class="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl bg-white/[0.05] border border-white/[0.1] hover:bg-red-500/10 hover:border-red-500/30 text-slate-300 hover:text-red-400 font-bold transition-all duration-200 cursor-pointer disabled:opacity-50"
                      :disabled="disconnecting"
                      @click="disconnectYouTube"
                    >
                      <UIcon name="i-heroicons-power" class="w-5 h-5" :class="disconnecting ? 'animate-spin' : ''" />
                      {{ $t('settings.disconnect') }}
                    </button>
                  </div>

                  <!-- Sync Warning -->
                  <div
                    v-if="syncWarning"
                    class="flex items-center gap-4 p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 animate-pulse-slow"
                  >
                    <div class="p-2.5 rounded-xl bg-amber-500/20">
                      <UIcon name="i-heroicons-exclamation-triangle" class="w-6 h-6 text-amber-400" />
                    </div>
                    <div class="flex-1">
                      <p class="text-amber-300 font-bold">{{ $t('settings.sync_warning_title', { m: syncWarning.minutesAgo }) }}</p>
                      <p class="text-amber-500/80 text-sm">{{ $t('settings.sync_warning_cost', { cost: SYNC_QUOTA_COST, m: syncWarning.minutesLeft }) }}</p>
                    </div>
                    <button
                      class="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 font-bold text-xs uppercase tracking-widest transition-colors cursor-pointer"
                      @click="syncNow(true)"
                    >
                      {{ $t('settings.force') }}
                    </button>
                  </div>
                </div>

                <!-- Not Connected State -->
                <div v-else class="text-center py-10 space-y-8">
                  <div class="w-24 h-24 mx-auto rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                    <svg class="w-12 h-12 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
                    </svg>
                  </div>
                  <div class="max-w-md mx-auto">
                    <p class="text-slate-400 text-lg font-medium leading-relaxed">{{ $t('settings.connect_hint') }}</p>
                  </div>
                  <button
                    class="group relative inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-bold transition-all duration-300 cursor-pointer shadow-2xl shadow-red-900/40 overflow-hidden"
                    :disabled="connecting"
                    @click="connectYouTube"
                  >
                    <div class="absolute inset-0 bg-white/10 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                    <UIcon v-if="connecting" name="i-heroicons-arrow-path" class="w-5 h-5 animate-spin relative z-10" />
                    <UIcon v-else name="i-heroicons-link" class="w-5 h-5 relative z-10" />
                    <span class="relative z-10">{{ connecting ? $t('settings.redirecting') : $t('settings.connect_channel') }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- System Settings -->
          <div v-if="currentSection === 'system'" key="system" class="space-y-6">
            <div class="bg-white/[0.03] border border-white/[0.08] rounded-3xl overflow-hidden backdrop-blur-xl">
              <div class="px-8 py-6 border-b border-white/[0.06] flex items-center gap-3">
                <div class="p-2 rounded-xl bg-slate-500/10 border border-slate-500/20">
                  <UIcon name="i-heroicons-cpu-chip" class="w-6 h-6 text-slate-400" />
                </div>
                <div>
                  <h3 class="font-bold text-xl text-white">{{ $t('settings.configuration') }}</h3>
                  <p class="text-slate-500 text-sm">Technical system parameters and environment variables</p>
                </div>
              </div>
              <div class="p-8 space-y-8">
                <div class="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                  <p class="text-sm text-slate-400 leading-relaxed">
                    {{ $t('settings.config_hint').split('.env')[0] }}
                    <code class="bg-white/[0.08] border border-white/10 px-2 py-0.5 rounded text-indigo-300 text-xs font-mono">.env</code>
                    {{ $t('settings.config_hint').split('.env')[1]?.split('.env.example')[0] }}
                    <code class="bg-white/[0.08] border border-white/10 px-2 py-0.5 rounded text-indigo-300 text-xs font-mono">.env.example</code>
                    {{ $t('settings.config_hint').split('.env.example')[1] }}
                  </p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div
                    v-for="item in [
                      { env: 'SYNC_INTERVAL_MINUTES', labelKey: 'settings.sync_interval', icon: 'i-heroicons-clock' },
                      { env: 'MAX_QUOTA_PER_DAY', labelKey: 'settings.daily_quota_guard', icon: 'i-heroicons-shield-check' },
                      { env: 'LOCKOUT_DURATION_MINUTES', labelKey: 'settings.login_lockout', icon: 'i-heroicons-lock-closed' },
                    ]"
                    :key="item.env"
                    class="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] transition-colors"
                  >
                    <UIcon :name="item.icon" class="w-6 h-6 text-slate-500 mb-4" />
                    <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-1">{{ $t(item.labelKey) }}</p>
                    <code class="text-sm text-indigo-400 font-mono break-all">{{ item.env }}</code>
                  </div>
                </div>

                <div class="p-6 rounded-2xl bg-indigo-500/5 border border-indigo-500/10 flex items-start gap-4">
                  <UIcon name="i-heroicons-information-circle" class="w-6 h-6 text-indigo-400 shrink-0" />
                  <p class="text-xs text-slate-500 leading-relaxed italic">
                    Note: To change these values, you must update the server configuration and restart the application. These settings control the internal logic of the synchronization engine and security systems.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </TransitionGroup>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: all 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(10px);
}

.animate-pulse-slow {
  animation: pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.8; }
}
</style>
</template>
