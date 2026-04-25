<script setup lang="ts">
import type { YouTubeStatus } from "~/shared/types";

definePageMeta({ middleware: "auth" });

const toast = useToast();
const { t, locale, setLocale } = useI18n();

const { data: ytStatus, refresh } = await useFetch<YouTubeStatus>(
  "/api/youtube/status",
);

const route = useRoute();
const youtubeConnected = computed(() => route.query.youtube_connected === "1");
const youtubeError = computed(
  () => route.query.youtube_error as string | undefined,
);

const SYNC_COOLDOWN_MINUTES = 30;
const SYNC_QUOTA_COST = 123;
const MAX_QUOTA_PER_DAY = 10000;

const quotaUsed = computed(() => ytStatus.value?.dailyQuotaUsed ?? 0);
const quotaPct = computed(() =>
  Math.min(100, Math.round((quotaUsed.value / MAX_QUOTA_PER_DAY) * 100)),
);
const quotaBarClass = computed(() =>
  quotaPct.value >= 90
    ? "bg-red-500"
    : quotaPct.value >= 70
      ? "bg-amber-500"
      : "bg-emerald-500",
);

const syncing = ref(false);
const connecting = ref(false);
const disconnecting = ref(false);
const syncWarning = ref<{ minutesAgo: number; minutesLeft: number } | null>(
  null,
);

let syncInterval: any = null;

function startPolling() {
  if (syncInterval) return;
  syncing.value = true;
  syncInterval = setInterval(async () => {
    await refresh();
    if (ytStatus.value?.lastSync?.status !== "running") {
      stopPolling();
      toast.add({
        title: t("settings.sync_completed") || "Sincronización finalizada",
        color: "emerald",
      });
    }
  }, 3000);
}

function stopPolling() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
  syncing.value = false;
}

onMounted(() => {
  if (ytStatus.value?.lastSync?.status === "running") {
    startPolling();
  }
});

onUnmounted(() => {
  stopPolling();
});

const languageOptions = computed(() => [
  { label: "🇬🇧 " + t("settings.language_english"), value: "en" },
  { label: "🇪🇸 " + t("settings.language_spanish"), value: "es" },
]);

async function connectYouTube() {
  connecting.value = true;
  try {
    const { url } = await $fetch<{ url: string }>("/api/youtube/connect");
    window.location.href = url;
  } catch {
    toast.add({ title: t("settings.connect_failed"), color: "red" });
    connecting.value = false;
  }
}

const showDisconnectModal = ref(false);

async function disconnectYouTube() {
  disconnecting.value = true;
  try {
    await $fetch("/api/youtube/disconnect", {
      method: "DELETE",
      headers: useCsrfHeaders(),
    });
    toast.add({ title: t("settings.disconnect_success"), color: "yellow" });
    await refresh();
  } catch {
    toast.add({ title: t("settings.disconnect_failed"), color: "red" });
  } finally {
    disconnecting.value = false;
    showDisconnectModal.value = false;
  }
}

async function syncNow(force = false) {
  if (!force && ytStatus.value?.lastSync?.completedAt) {
    const minutesAgo = Math.floor(
      (Date.now() - new Date(ytStatus.value.lastSync.completedAt).getTime()) /
        60000,
    );
    if (minutesAgo < SYNC_COOLDOWN_MINUTES) {
      syncWarning.value = {
        minutesAgo,
        minutesLeft: SYNC_COOLDOWN_MINUTES - minutesAgo,
      };
      setTimeout(() => {
        syncWarning.value = null;
      }, 6000);
      return;
    }
  }
  syncWarning.value = null;
  syncing.value = true;
  try {
    await $fetch("/api/youtube/sync", {
      method: "POST",
      headers: useCsrfHeaders(),
    });
    toast.add({ title: t("settings.sync_started"), color: "green" });
    startPolling();
  } catch {
    toast.add({ title: t("settings.sync_failed"), color: "red" });
    syncing.value = false;
  }
}

const { data: settings, refresh: refreshSettings } = await useFetch<{
  aiProvider: string;
  geminiModel: string;
  openaiModel: string;
  syncIntervalMinutes: number;
  maxQuotaPerDay: number;
  lockoutDurationMinutes: number;
  autoSuggestEnabled: boolean;
}>("/api/settings");
const activeAiProvider = computed(() => settings.value?.aiProvider ?? "gemini");
const autoSuggestEnabled = computed(
  () => settings.value?.autoSuggestEnabled ?? false,
);

async function updateAutoSuggest(enabled: boolean) {
  try {
    await $fetch("/api/settings", {
      method: "PATCH",
      body: { autoSuggestEnabled: enabled },
      headers: useCsrfHeaders(),
    });
    toast.add({ title: t("settings.auto_suggest_saved"), color: "green" });
    await refreshSettings();
  } catch {
    toast.add({ title: t("settings.auto_suggest_failed"), color: "red" });
  }
}

async function updateAiProvider(provider: string) {
  try {
    await $fetch("/api/settings", {
      method: "PATCH",
      body: { aiProvider: provider },
      headers: useCsrfHeaders(),
    });
    toast.add({ title: t("settings.ai_provider_saved"), color: "green" });
    await refreshSettings();
  } catch {
    toast.add({ title: t("settings.ai_provider_failed"), color: "red" });
  }
}
</script>

<template>
  <div>
    <div class="mb-7">
      <h1 class="text-2xl font-bold text-white tracking-tight">
        {{ $t("settings.title") }}
      </h1>
      <p class="text-slate-500 text-sm mt-0.5">{{ $t("settings.subtitle") }}</p>
    </div>

    <div
      v-if="youtubeConnected"
      class="flex items-center gap-2.5 text-emerald-300 text-sm bg-emerald-500/[0.08] border border-emerald-500/20 rounded-xl px-4 py-3 mb-5"
    >
      <UIcon
        name="i-heroicons-check-circle"
        class="w-4 h-4 flex-shrink-0 text-emerald-400"
      />
      {{ $t("settings.connected_success") }}
    </div>

    <div
      v-if="youtubeError"
      class="flex items-start gap-2.5 text-red-300 text-sm bg-red-500/[0.08] border border-red-500/20 rounded-xl px-4 py-3 mb-5"
    >
      <UIcon
        name="i-heroicons-exclamation-circle"
        class="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400"
      />
      {{ $t("settings.connection_error", { error: youtubeError }) }}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <!-- Main Column: YouTube Connection -->
      <div class="lg:col-span-7 xl:col-span-8 space-y-6">
        <!-- YouTube Connection Card -->
        <div
          class="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden shadow-sm backdrop-blur-md"
        >
          <div
            class="px-6 py-4 border-b border-white/[0.06] flex items-center gap-2 bg-white/[0.01]"
          >
            <svg
              class="w-5 h-5 text-red-500 shrink-0"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"
              />
            </svg>
            <span class="font-semibold text-slate-200">{{
              $t("settings.youtube_connection")
            }}</span>
          </div>

          <div class="p-6">
            <div
              v-if="ytStatus?.connected && ytStatus.channel"
              class="space-y-6"
            >
              <div
                class="flex items-center gap-5 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]"
              >
                <img
                  :src="
                    ytStatus.channel.thumbnailUrl ||
                    '/images/icons/web-app-manifest-192x192.webp'
                  "
                  class="w-14 h-14 rounded-full ring-2 ring-white/10 object-cover"
                  alt="Channel"
                  referrerpolicy="no-referrer"
                  @error="
                    ($event.target as HTMLImageElement).src =
                      '/images/icons/web-app-manifest-192x192.webp'
                  "
                />
                <div class="flex-1 min-w-0">
                  <p class="font-bold text-white text-lg">
                    {{ ytStatus.channel.title }}
                  </p>
                  <p class="text-sm text-slate-500 mt-0.5">
                    {{
                      $t("settings.channel_info", {
                        subscribers: ytStatus.channel.subscriberCount,
                        videos: ytStatus.channel.videoCount,
                      })
                    }}
                  </p>
                </div>
                <div
                  class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
                >
                  <div
                    class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                  />
                  <span
                    class="text-xs font-semibold text-emerald-400 uppercase tracking-wider"
                    >{{ $t("settings.connected") }}</span
                  >
                </div>
              </div>

              <div v-if="ytStatus.lastSync" class="space-y-3">
                <p class="text-sm font-medium text-slate-400 ml-1">
                  {{
                    $t("settings.last_sync_status") ||
                    "Estado de sincronización"
                  }}
                </p>
                <div
                  class="border rounded-xl px-5 py-4 text-xs space-y-4"
                  :class="
                    ytStatus.lastSync.status === 'failed'
                      ? 'bg-red-500/[0.06] border-red-500/20'
                      : ytStatus.lastSync.status === 'running'
                        ? 'bg-blue-500/[0.06] border-blue-500/20'
                        : 'bg-white/[0.03] border-white/[0.06]'
                  "
                >
                  <!-- Header row -->
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <span
                        class="font-bold uppercase tracking-widest text-[10px]"
                        :class="{
                          'text-red-400': ytStatus.lastSync.status === 'failed',
                          'text-blue-400':
                            ytStatus.lastSync.status === 'running',
                          'text-emerald-400':
                            ytStatus.lastSync.status === 'completed',
                          'text-slate-400': ![
                            'failed',
                            'running',
                            'completed',
                          ].includes(ytStatus.lastSync.status),
                        }"
                      >
                        {{ ytStatus.lastSync.status }}
                      </span>
                      <span class="text-slate-700">·</span>
                      <span class="text-slate-400 font-medium capitalize">{{
                        ytStatus.lastSync.syncType
                      }}</span>
                    </div>
                    <span class="text-slate-500 font-mono">
                      {{
                        ytStatus.lastSync.completedAt
                          ? new Date(
                              ytStatus.lastSync.completedAt,
                            ).toLocaleString()
                          : ytStatus.lastSync.startedAt
                            ? new Date(
                                ytStatus.lastSync.startedAt,
                              ).toLocaleString()
                            : "-"
                      }}
                    </span>
                  </div>

                  <!-- Stats grid -->
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div
                      class="bg-white/[0.04] border border-white/[0.05] rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.07]"
                    >
                      <div class="text-white font-bold text-base">
                        {{ ytStatus.lastSync.videosProcessed ?? 0 }}
                      </div>
                      <div
                        class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mt-0.5"
                      >
                        {{ $t("settings.videos") }}
                      </div>
                    </div>
                    <div
                      class="bg-white/[0.04] border border-white/[0.05] rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.07]"
                    >
                      <div class="text-white font-bold text-base">
                        {{ ytStatus.lastSync.commentsFound ?? 0 }}
                      </div>
                      <div
                        class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mt-0.5"
                      >
                        {{ $t("settings.found") }}
                      </div>
                    </div>
                    <div
                      class="bg-white/[0.04] border border-white/[0.05] rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.07]"
                    >
                      <div class="text-emerald-400 font-bold text-base">
                        +{{ ytStatus.lastSync.newComments ?? 0 }}
                      </div>
                      <div
                        class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mt-0.5"
                      >
                        {{ $t("settings.new") }}
                      </div>
                    </div>
                    <div
                      class="bg-white/[0.04] border border-white/[0.05] rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.07]"
                    >
                      <div class="text-amber-400 font-bold text-base">
                        {{ ytStatus.lastSync.quotaUsed ?? 0 }}
                      </div>
                      <div
                        class="text-slate-500 text-[10px] uppercase font-bold tracking-wider mt-0.5"
                      >
                        {{ $t("settings.quota") }}
                      </div>
                    </div>
                  </div>

                  <!-- Error message -->
                  <div
                    v-if="
                      ytStatus.lastSync.status === 'failed' &&
                      ytStatus.lastSync.errorMessage
                    "
                    class="text-red-400/80 leading-relaxed bg-red-500/5 border border-red-500/10 p-3 rounded-lg"
                  >
                    {{
                      ytStatus.lastSync.errorMessage?.replace(/<[^>]+>/g, "")
                    }}
                  </div>
                </div>
              </div>

              <!-- Daily quota bar -->
              <div
                class="space-y-2.5 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05]"
              >
                <div class="flex items-center justify-between text-xs">
                  <span
                    class="text-slate-400 font-bold uppercase tracking-wider"
                    >{{ $t("settings.daily_quota") }}</span
                  >
                  <span
                    :class="
                      quotaPct >= 90
                        ? 'text-red-400'
                        : quotaPct >= 70
                          ? 'text-amber-400'
                          : 'text-slate-300'
                    "
                    class="font-mono"
                  >
                    {{ quotaUsed.toLocaleString() }} /
                    {{ MAX_QUOTA_PER_DAY.toLocaleString() }}
                  </span>
                </div>
                <div
                  class="h-2 bg-white/[0.06] rounded-full overflow-hidden p-[1px]"
                >
                  <div
                    class="h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                    :class="quotaBarClass"
                    :style="`width: ${quotaPct}%`"
                  />
                </div>
              </div>

              <div class="space-y-3 pt-2">
                <div class="flex flex-wrap gap-3">
                  <button
                    class="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-slate-200 hover:text-white text-sm font-bold transition-all duration-200 cursor-pointer disabled:opacity-50 group"
                    :disabled="syncing"
                    @click="syncNow()"
                  >
                    <UIcon
                      name="i-heroicons-arrow-path"
                      class="w-5 h-5 transition-transform group-hover:rotate-180 duration-500"
                      :class="syncing ? 'animate-spin' : ''"
                    />
                    {{
                      syncing ? $t("settings.syncing") : $t("settings.sync_now")
                    }}
                  </button>
                  <button
                    class="flex-1 min-w-[140px] flex items-center justify-center gap-2 px-5 py-3 rounded-xl border border-red-500/20 bg-red-500/[0.08] hover:bg-red-500/[0.14] text-red-400 text-sm font-bold transition-all duration-200 cursor-pointer disabled:opacity-50"
                    :disabled="disconnecting"
                    @click="showDisconnectModal = true"
                  >
                    <UIcon
                      name="i-heroicons-link-slash"
                      class="w-5 h-5"
                      :class="disconnecting ? 'animate-spin' : ''"
                    />
                    {{ $t("settings.disconnect") }}
                  </button>
                </div>

                <div
                  v-if="syncWarning"
                  class="flex items-center gap-4 px-5 py-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs shadow-lg shadow-amber-950/20 animate-in fade-in slide-in-from-top-2 duration-300"
                >
                  <div
                    class="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0"
                  >
                    <UIcon
                      name="i-heroicons-exclamation-triangle"
                      class="w-6 h-6 text-amber-400"
                    />
                  </div>
                  <div class="flex-1">
                    <p class="text-amber-300 font-bold text-sm mb-0.5">
                      {{
                        $t("settings.sync_warning_title", {
                          m: syncWarning.minutesAgo,
                        })
                      }}
                    </p>
                    <p class="text-amber-500/80 leading-relaxed">
                      {{
                        $t("settings.sync_warning_cost", {
                          cost: SYNC_QUOTA_COST,
                          m: syncWarning.minutesLeft,
                        })
                      }}
                    </p>
                  </div>
                  <button
                    class="shrink-0 px-4 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-bold cursor-pointer transition-colors border border-amber-500/30"
                    @click="syncNow(true)"
                  >
                    {{ $t("settings.force") }}
                  </button>
                </div>
              </div>
            </div>

            <div v-else class="text-center py-12 px-6">
              <div
                class="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-3xl flex items-center justify-center mx-auto mb-6"
              >
                <svg
                  class="w-10 h-10 text-red-500"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                >
                  <path
                    d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"
                  />
                </svg>
              </div>
              <h3 class="text-xl font-bold text-white mb-2">
                {{ $t("settings.not_connected_title") || "Canal no conectado" }}
              </h3>
              <p class="text-slate-500 text-sm mb-8 max-w-sm mx-auto">
                {{ $t("settings.connect_hint") }}
              </p>
              <button
                class="inline-flex items-center gap-3 px-8 py-3.5 rounded-2xl bg-red-600 hover:bg-red-500 text-white text-base font-bold transition-all duration-300 cursor-pointer disabled:opacity-50 shadow-xl shadow-red-900/40 hover:-translate-y-0.5 active:translate-y-0"
                :disabled="connecting"
                @click="connectYouTube"
              >
                <UIcon
                  v-if="connecting"
                  name="i-heroicons-arrow-path"
                  class="w-5 h-5 animate-spin"
                />
                <svg
                  v-else
                  class="w-5 h-5"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"
                  />
                </svg>
                {{
                  connecting
                    ? $t("settings.redirecting")
                    : $t("settings.connect_channel")
                }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Side Column: Language, AI & Config -->
      <div class="lg:col-span-5 xl:col-span-4 space-y-6">
        <!-- Compact General Settings -->
        <div
          class="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden shadow-sm backdrop-blur-md"
        >
          <div
            class="px-6 py-4 border-b border-white/[0.06] flex items-center gap-2 bg-white/[0.01]"
          >
            <UIcon
              name="i-heroicons-cog-6-tooth"
              class="w-5 h-5 text-slate-400 shrink-0"
            />
            <span class="font-semibold text-slate-200">{{
              $t("settings.general_title") || "General"
            }}</span>
          </div>

          <div class="p-4 space-y-2">
            <!-- Language Row -->
            <div
              class="flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.02] transition-colors"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center"
                >
                  <UIcon
                    name="i-heroicons-language"
                    class="w-4 h-4 text-indigo-400"
                  />
                </div>
                <span class="text-sm font-medium text-slate-300">{{
                  $t("settings.language_title")
                }}</span>
              </div>
              <div
                class="flex bg-black/40 p-1 rounded-xl border border-white/[0.05] shadow-inner"
              >
                <button
                  v-for="opt in languageOptions"
                  :key="opt.value"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer whitespace-nowrap"
                  :class="
                    locale === opt.value
                      ? 'bg-white/[0.08] text-white shadow-[0_0_10px_rgba(255,255,255,0.05)] ring-1 ring-white/10'
                      : 'text-slate-500 hover:text-slate-300'
                  "
                  @click="setLocale(opt.value as 'en' | 'es')"
                >
                  {{ opt.label.split(" ")[0] }} {{ opt.label.split(" ")[1] }}
                </button>
              </div>
            </div>

            <!-- AI Provider Row -->
            <div
              class="p-2 rounded-xl hover:bg-white/[0.02] transition-colors space-y-3"
            >
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <div
                    class="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center"
                  >
                    <UIcon
                      name="i-heroicons-cpu-chip"
                      class="w-4 h-4 text-purple-400"
                    />
                  </div>
                  <span class="text-sm font-medium text-slate-300">{{
                    $t("settings.ai_provider")
                  }}</span>
                </div>
                <div
                  class="flex bg-black/40 p-1 rounded-xl border border-white/[0.05] shadow-inner"
                >
                  <button
                    v-for="opt in [
                      { label: 'Gemini', value: 'gemini' },
                      { label: 'OpenAI', value: 'openai' },
                    ]"
                    :key="opt.value"
                    class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer"
                    :class="
                      activeAiProvider === opt.value
                        ? 'bg-white/[0.08] text-white shadow-[0_0_10px_rgba(255,255,255,0.05)] ring-1 ring-white/10'
                        : 'text-slate-500 hover:text-slate-300'
                    "
                    @click="updateAiProvider(opt.value)"
                  >
                    {{ opt.label }}
                  </button>
                </div>
              </div>

              <!-- Active Model Badge -->
              <div v-if="settings" class="flex items-center gap-2 pl-11">
                <div class="w-1 h-1 rounded-full bg-purple-500/40" />
                <span
                  class="text-[10px] uppercase font-bold tracking-widest text-slate-600 mr-1"
                  >{{ $t("settings.active_model") }}</span
                >
                <code class="text-[10px] text-purple-400/80 font-mono truncate">
                  {{
                    activeAiProvider === "openai"
                      ? settings.openaiModel
                      : settings.geminiModel
                  }}
                </code>
              </div>
            </div>

            <!-- Auto-Suggest Row -->
            <div
              class="flex items-center justify-between p-2 rounded-xl hover:bg-white/[0.02] transition-colors"
            >
              <div class="flex items-center gap-3">
                <div
                  class="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center"
                >
                  <UIcon
                    name="i-heroicons-bolt"
                    class="w-4 h-4 text-emerald-400"
                  />
                </div>
                <div>
                  <span class="text-sm font-medium text-slate-300">{{
                    $t("settings.auto_suggest_title")
                  }}</span>
                  <p class="text-[10px] text-slate-600 mt-0.5">
                    {{ $t("settings.auto_suggest_hint") }}
                  </p>
                </div>
              </div>
              <div
                class="flex bg-black/40 p-1 rounded-xl border border-white/[0.05] shadow-inner"
              >
                <button
                  v-for="opt in [
                    { label: $t('settings.auto_suggest_on'), value: true },
                    { label: $t('settings.auto_suggest_off'), value: false },
                  ]"
                  :key="String(opt.value)"
                  class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer whitespace-nowrap"
                  :class="
                    autoSuggestEnabled === opt.value
                      ? 'bg-white/[0.08] text-white shadow-[0_0_10px_rgba(255,255,255,0.05)] ring-1 ring-white/10'
                      : 'text-slate-500 hover:text-slate-300'
                  "
                  @click="updateAutoSuggest(opt.value)"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Config info -->
        <div
          class="bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden shadow-sm backdrop-blur-md"
        >
          <div class="px-6 py-4 border-b border-white/[0.06] bg-white/[0.01]">
            <span class="font-semibold text-slate-200">{{
              $t("settings.configuration")
            }}</span>
          </div>
          <div class="p-6 space-y-5">
            <p class="text-xs text-slate-500 leading-relaxed">
              {{ $t("settings.config_hint").split(".env")[0] }}
              <code
                class="bg-white/[0.06] border border-white/[0.08] px-1.5 py-0.5 rounded-lg text-slate-300 font-mono"
                >.env</code
              >
              {{
                $t("settings.config_hint")
                  .split(".env")[1]
                  ?.split(".env.example")[0]
              }}
              <code
                class="bg-white/[0.06] border border-white/[0.08] px-1.5 py-0.5 rounded-lg text-slate-300 font-mono"
                >.env.example</code
              >
              {{ $t("settings.config_hint").split(".env.example")[1] }}
            </p>
            <div class="space-y-3">
              <div
                v-for="item in [
                  {
                    env: 'SYNC_INTERVAL_MINUTES',
                    labelKey: 'settings.sync_interval',
                    value: settings?.syncIntervalMinutes,
                  },
                  {
                    env: 'MAX_QUOTA_PER_DAY',
                    labelKey: 'settings.daily_quota_guard',
                    value: settings?.maxQuotaPerDay,
                  },
                  {
                    env: 'LOCKOUT_DURATION_MINUTES',
                    labelKey: 'settings.login_lockout',
                    value: settings?.lockoutDurationMinutes,
                  },
                ]"
                :key="item.env"
                class="group"
              >
                <div
                  class="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-1 ml-1"
                >
                  {{ $t(item.labelKey) }}
                </div>
                <div
                  class="flex items-center justify-between bg-black/20 border border-white/[0.05] p-3 rounded-xl group-hover:border-white/[0.1] transition-colors"
                >
                  <div class="flex items-center gap-3">
                    <div
                      class="w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-slate-400 transition-colors"
                    />
                    <code class="text-slate-400 font-mono text-xs">{{
                      item.env
                    }}</code>
                  </div>
                  <span class="text-white font-mono text-xs font-bold">{{
                    item.value ?? "-"
                  }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Confirm Disconnect Modal -->
    <UiConfirmModal
      v-model="showDisconnectModal"
      :title="$t('settings.disconnect_modal_title')"
      :description="$t('settings.disconnect_modal_description')"
      :confirm-text="$t('settings.disconnect')"
      :cancel-text="$t('settings.cancel')"
      :loading="disconnecting"
      type="danger"
      @confirm="disconnectYouTube"
    />
  </div>
</template>

<style scoped>
/* Added empty style block to help SFC compiler distinguish parts */
</style>
