<script setup lang="ts">
import type { YouTubeStatus } from "~/shared/types";

definePageMeta({ middleware: "auth" });

const toast = useToast();
const route = useRoute();
const { t, locale, setLocale } = useI18n();

const SYNC_COOLDOWN_MINUTES = 2;
const SYNC_QUOTA_COST = 5;

// State
const activeTab = ref("account");
const syncing = ref(false);
const connecting = ref(false);
const disconnecting = ref(false);
const forcingSuggest = ref(false);
const backfillingAvatars = ref(false);
const resetting = ref(false);
const showDisconnectModal = ref(false);
const showForceSuggestModal = ref(false);
const showResetModal = ref(false);

const syncWarning = ref<{ minutesAgo: number; minutesLeft: number } | null>(
  null,
);

// Data fetching
const { data: ytStatus, refresh: refreshStatus } =
  await useFetch<YouTubeStatus>("/api/youtube/status");
const { data: settings, refresh: refreshSettings } =
  await useFetch<any>("/api/settings");
const { data: pendingCount, refresh: refreshPendingCount } = await useFetch<{
  count: number;
}>("/api/comments/suggest-pending");

const youtubeConnected = computed(() => route.query.youtube_connected === "1");
const youtubeError = computed(() => route.query.error as string | undefined);

const tabs = [
  {
    id: "account",
    label: "settings.youtube_connection",
    icon: "i-heroicons-play-circle",
    color: "text-red-500",
  },
  {
    id: "ai",
    label: "settings.ai_settings_title",
    icon: "i-heroicons-sparkles",
    color: "text-purple-500",
  },
  {
    id: "system",
    label: "settings.configuration",
    icon: "i-heroicons-cog-6-tooth",
    color: "text-indigo-500",
  },
  {
    id: "danger",
    label: "settings.danger_zone",
    icon: "i-heroicons-exclamation-triangle",
    color: "text-red-500",
  },
];

const languageOptions = [
  { label: "English", value: "en" },
  { label: "Español", value: "es" },
  { label: "Português", value: "pt" },
  { label: "Français", value: "fr" },
  { label: "Deutsch", value: "de" },
  { label: "Italiano", value: "it" },
  { label: "Nederlands", value: "nl" },
  { label: "Polski", value: "pl" },
  { label: "Русский", value: "ru" },
  { label: "日本語", value: "ja" },
  { label: "中文", value: "zh" },
  { label: "العربية", value: "ar" },
  { label: "한국어", value: "ko" },
  { label: "Türkçe", value: "tr" },
  { label: "Svenska", value: "sv" },
  { label: "Norsk", value: "no" },
  { label: "Dansk", value: "da" },
  { label: "Suomi", value: "fi" },
  { label: "Català", value: "ca" },
  { label: "Čeština", value: "cs" },
];

const currentLocale = computed({
  get: () => locale.value,
  set: (val) => setLocale(val),
});

const activeAiProvider = computed(() => settings.value?.aiProvider);
const autoSuggestEnabled = computed(() => settings.value?.autoSuggestEnabled);

const activeModel = computed(() => {
  if (!settings.value) return "-";
  return activeAiProvider.value === "openai"
    ? settings.value.openaiModel
    : settings.value.geminiModel;
});

const quotaUsed = computed(() => ytStatus.value?.dailyQuotaUsed ?? 0);
const MAX_QUOTA_PER_DAY = computed(
  () => settings.value?.maxQuotaPerDay ?? 10000,
);
const quotaPct = computed(() => {
  const pct = (quotaUsed.value / MAX_QUOTA_PER_DAY.value) * 100;
  if (pct > 0 && pct < 1) return pct.toFixed(2);
  return Math.min(100, Math.round(pct)).toString();
});

const quotaBarClass = computed(() => {
  if (quotaPct.value > 90) return "bg-red-500 shadow-red-500/50";
  if (quotaPct.value > 70) return "bg-amber-500 shadow-amber-500/50";
  return "bg-emerald-500 shadow-emerald-500/50";
});

const nextSyncDisplay = computed(() => {
  if (!ytStatus.value?.lastSync?.nextSyncAt) return "";
  const next = new Date(ytStatus.value.lastSync.nextSyncAt);
  const diff = next.getTime() - Date.now();
  const mins = Math.ceil(diff / 60000);
  if (mins <= 0) return t("settings.sync_imminent");
  return t("settings.sync_in_minutes", { m: mins });
});

// Polling for sync status
let pollInterval: any = null;
function startPolling() {
  if (pollInterval) return;
  syncing.value = true;
  pollInterval = setInterval(async () => {
    await refreshStatus();
    if (ytStatus.value?.lastSync?.status !== "running") {
      stopPolling();
    }
  }, 3000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  syncing.value = false;
}

// Actions
async function connectYouTube() {
  connecting.value = true;
  try {
    const { url } = await $fetch<{ url: string }>("/api/youtube/connect");
    window.location.href = url;
  } catch (e) {
    toast.add({ title: t("settings.connect_failed"), color: "red" });
    connecting.value = false;
  }
}

async function disconnectYouTube() {
  disconnecting.value = true;
  try {
    await $fetch("/api/youtube/disconnect", {
      method: "POST",
      headers: useCsrfHeaders(),
    });
    await refreshStatus();
    toast.add({ title: t("settings.disconnect_success"), color: "green" });
    showDisconnectModal.value = false;
  } catch (e) {
    toast.add({ title: t("settings.disconnect_failed"), color: "red" });
  } finally {
    disconnecting.value = false;
  }
}

async function syncNow(force = false) {
  if (!force && ytStatus.value?.lastSync?.completedAt) {
    const minsAgo = Math.floor(
      (Date.now() - new Date(ytStatus.value.lastSync.completedAt).getTime()) /
        60000,
    );
    if (minsAgo < SYNC_COOLDOWN_MINUTES) {
      syncWarning.value = {
        minutesAgo: minsAgo,
        minutesLeft: SYNC_COOLDOWN_MINUTES - minsAgo,
      };
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
    toast.add({ title: t("settings.sync_started"), color: "blue" });
    startPolling();
  } catch (e) {
    toast.add({ title: t("settings.sync_failed"), color: "red" });
    syncing.value = false;
  }
}

async function updateAiProvider(provider: string) {
  try {
    await $fetch("/api/settings", {
      method: "PATCH",
      headers: useCsrfHeaders(),
      body: { aiProvider: provider },
    });
    await refreshSettings();
    toast.add({ title: t("settings.ai_provider_saved"), color: "green" });
  } catch (e: any) {
    toast.add({
      title: e.data?.message || t("settings.ai_provider_failed"),
      color: "red",
    });
  }
}

async function updateAutoSuggest(enabled: boolean) {
  try {
    await $fetch("/api/settings", {
      method: "PATCH",
      headers: useCsrfHeaders(),
      body: { autoSuggestEnabled: enabled },
    });
    await refreshSettings();
    toast.add({
      title: enabled
        ? t("settings.auto_suggest_saved")
        : t("comments.status_updated", {
            status: t("settings.auto_suggest_off"),
          }),
      color: "green",
    });

    if (enabled && (pendingCount.value?.count ?? 0) > 0) {
      toast.add({
        title: t("settings.auto_suggest_processing", {
          n: pendingCount.value?.count,
        }),
        description: t("settings.force_suggest_description", {
          n: pendingCount.value?.count,
        }),
        color: "blue",
      });
    }
  } catch (e) {
    toast.add({ title: t("settings.auto_suggest_failed"), color: "red" });
  }
}

async function forceSuggestNow() {
  forcingSuggest.value = true;
  try {
    await $fetch("/api/comments/suggest-pending", {
      method: "POST",
      headers: useCsrfHeaders(),
    });
    toast.add({ title: t("settings.force_suggest_started"), color: "green" });
    showForceSuggestModal.value = false;
    // Check pending count periodically
    const interval = setInterval(async () => {
      await refreshPendingCount();
      if ((pendingCount.value?.count ?? 0) === 0) clearInterval(interval);
    }, 5000);
  } catch (e) {
    toast.add({ title: t("settings.force_suggest_failed"), color: "red" });
  } finally {
    forcingSuggest.value = false;
  }
}

async function backfillAvatars() {
  backfillingAvatars.value = true;
  try {
    await $fetch("/api/youtube/backfill-avatars", {
      method: "POST",
      headers: useCsrfHeaders(),
    });
    toast.add({ title: t("settings.backfill_started"), color: "blue" });
  } catch (e) {
    toast.add({ title: t("settings.backfill_failed"), color: "red" });
  } finally {
    backfillingAvatars.value = false;
  }
}

async function resetApplication() {
  resetting.value = true;
  try {
    await $fetch("/api/settings/reset", {
      method: "POST",
      headers: useCsrfHeaders(),
    });
    toast.add({ title: t("settings.reset_success"), color: "green" });
    setTimeout(() => (window.location.href = "/login"), 1500);
  } catch (e) {
    toast.add({ title: t("settings.reset_failed"), color: "red" });
    resetting.value = false;
  }
}

onMounted(() => {
  if (ytStatus.value?.lastSync?.status === "running") {
    startPolling();
  }

  // Auto-switch provider if key is missing
  if (settings.value) {
    if (
      settings.value.aiProvider === "gemini" &&
      !settings.value.geminiKeyConfigured &&
      settings.value.openaiKeyConfigured
    ) {
      updateAiProvider("openai");
      toast.add({
        title: t("settings.ai_provider_switched"),
        description: t("settings.ai_provider_switched_desc", {
          name: "OpenAI",
        }),
        color: "amber",
      });
    } else if (
      settings.value.aiProvider === "openai" &&
      !settings.value.openaiKeyConfigured &&
      settings.value.geminiKeyConfigured
    ) {
      updateAiProvider("gemini");
      toast.add({
        title: t("settings.ai_provider_switched"),
        description: t("settings.ai_provider_switched_desc", {
          name: "Gemini",
        }),
        color: "amber",
      });
    }
  }
});

onUnmounted(() => {
  stopPolling();
});
</script>

<template>
  <div class="relative min-h-[calc(100vh-12rem)]">
    <!-- Decorative background blobs -->
    <div class="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <div
        class="absolute -top-[10%] -right-[10%] w-[40%] h-[40%] bg-indigo-600/5 blur-[120px] rounded-full"
      />
      <div
        class="absolute top-[20%] -left-[10%] w-[30%] h-[30%] bg-purple-600/5 blur-[100px] rounded-full"
      />
      <div
        class="absolute -bottom-[10%] right-[20%] w-[35%] h-[35%] bg-blue-600/5 blur-[110px] rounded-full"
      />
    </div>

    <div class="relative z-10">
      <div class="mb-8">
        <h1
          class="text-3xl font-black text-white tracking-tight flex items-center gap-3"
        >
          <div class="w-2 h-8 bg-indigo-500 rounded-full" />
          {{ $t("settings.title") }}
        </h1>
        <p class="text-slate-500 text-sm mt-1 ml-5">
          {{ $t("settings.subtitle") }}
        </p>
      </div>

      <div
        v-if="youtubeConnected"
        class="flex items-center gap-3 text-emerald-400 text-sm bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-5 py-4 mb-8 backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-500"
      >
        <div
          class="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center"
        >
          <UIcon name="i-heroicons-check-circle" class="w-5 h-5" />
        </div>
        <div class="flex-1">
          <p class="font-bold">{{ $t("settings.connected_success") }}</p>
        </div>
      </div>

      <div
        v-if="youtubeError"
        class="flex items-start gap-3 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-2xl px-5 py-4 mb-8 backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-500"
      >
        <div
          class="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0"
        >
          <UIcon name="i-heroicons-exclamation-circle" class="w-5 h-5" />
        </div>
        <div class="flex-1 pt-1">
          <p class="font-bold">{{ $t("settings.connection_error_title") }}</p>
          <p class="text-red-400/70">{{ youtubeError }}</p>
        </div>
      </div>

      <div class="flex flex-col min-[1200px]:flex-row gap-8 items-start">
        <!-- Vertical Tabs Sidebar -->
        <div class="w-full min-[1200px]:w-64 flex-shrink-0 space-y-2">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="w-full flex items-center gap-3 px-5 py-4 rounded-2xl transition-all duration-300 group relative overflow-hidden"
            :class="[
              activeTab === tab.id
                ? 'bg-white/10 text-white shadow-lg shadow-black/20 ring-1 ring-white/10'
                : 'text-slate-400 hover:bg-white/5 hover:text-slate-200',
            ]"
          >
            <div
              v-if="activeTab === tab.id"
              class="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500 rounded-full"
            />
            <UIcon
              :name="tab.icon"
              class="w-5 h-5 transition-transform group-hover:scale-110"
              :class="activeTab === tab.id ? tab.color : 'text-slate-500'"
            />
            <span class="font-bold text-sm tracking-wide">{{
              $t(tab.label)
            }}</span>
          </button>
        </div>

        <!-- Tab Content Area -->
        <div class="flex-1 w-full">
          <Transition
            mode="out-in"
            enter-active-class="transition duration-300 ease-out"
            enter-from-class="opacity-0 translate-y-4"
            enter-to-class="opacity-100 translate-y-0"
            leave-active-class="transition duration-200 ease-in"
            leave-from-class="opacity-100 translate-y-0"
            leave-to-class="opacity-0 -translate-y-4"
          >
            <div :key="activeTab" class="space-y-6">
              <!-- ACCOUNT TAB -->
              <div v-if="activeTab === 'account'" class="space-y-6">
                <!-- YouTube Channel Card -->
                <div
                  class="bg-white/[0.03] border border-white/[0.08] rounded-3xl overflow-hidden backdrop-blur-2xl shadow-xl shadow-black/10"
                >
                  <div
                    class="px-8 py-6 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.02]"
                  >
                    <div class="flex items-center gap-3">
                      <div
                        class="p-2 rounded-xl bg-red-500/10 border border-red-500/20"
                      >
                        <svg
                          class="w-5 h-5 text-red-500"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path
                            d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"
                          />
                        </svg>
                      </div>
                      <span
                        class="font-black text-slate-200 tracking-wider uppercase text-xs"
                        >{{ $t("settings.youtube_connection") }}</span
                      >
                    </div>
                    <div
                      v-if="ytStatus?.connected"
                      class="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20"
                    >
                      <div
                        class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
                      />
                      <span
                        class="text-[10px] font-black text-emerald-400 uppercase tracking-widest"
                        >{{ $t("settings.connected") }}</span
                      >
                    </div>
                  </div>

                  <div class="p-8">
                    <div
                      v-if="ytStatus?.connected && ytStatus.channel"
                      class="space-y-8"
                    >
                      <!-- Channel Detail -->
                      <div
                        class="flex flex-col md:flex-row items-center gap-6 p-6 rounded-3xl bg-white/[0.02] border border-white/[0.04] group hover:bg-white/[0.04] transition-colors duration-500"
                      >
                        <div class="relative">
                          <div
                            class="absolute inset-0 bg-red-600/20 blur-2xl rounded-full scale-75 group-hover:scale-100 transition-transform duration-700"
                          />
                          <img
                            :src="
                              ytStatus.channel.thumbnailUrl ||
                              '/images/icons/web-app-manifest-192x192.webp'
                            "
                            class="w-24 h-24 rounded-full ring-4 ring-white/10 object-cover relative z-10"
                            alt="Channel"
                            referrerpolicy="no-referrer"
                          />
                        </div>
                        <div class="flex-1 text-center md:text-left space-y-1">
                          <h2 class="text-2xl font-black text-white">
                            {{ ytStatus.channel.title }}
                          </h2>
                          <p class="text-slate-500 font-medium">
                            {{
                              $t("settings.channel_info", {
                                subscribers: ytStatus.channel.subscriberCount,
                                videos: ytStatus.channel.videoCount,
                              })
                            }}
                          </p>
                        </div>
                        <div class="flex flex-col gap-2 w-full md:w-auto">
                          <button
                            class="px-6 py-3 rounded-2xl border border-red-500/20 bg-red-500/10 hover:bg-red-500 text-red-400 hover:text-white text-sm font-bold transition-all duration-300 active:scale-95"
                            :disabled="disconnecting"
                            @click="showDisconnectModal = true"
                          >
                            {{ $t("settings.disconnect") }}
                          </button>
                        </div>
                      </div>

                      <!-- Sync Status & Controls -->
                      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <!-- Left: Sync Card -->
                        <div class="flex flex-col h-full space-y-4">
                          <div class="flex items-center justify-between px-2">
                            <span
                              class="text-xs font-black text-slate-500 uppercase tracking-widest"
                              >{{ $t("settings.last_sync_status") }}</span
                            >
                            <div
                              v-if="
                                ytStatus.lastSync?.nextSyncAt &&
                                ytStatus.lastSync.status !== 'running'
                              "
                              class="flex items-center gap-1.5 text-[10px] text-emerald-400 font-black uppercase tracking-tight"
                            >
                              <UIcon
                                name="i-heroicons-clock"
                                class="w-3.5 h-3.5"
                              />
                              {{ nextSyncDisplay }}
                            </div>
                          </div>
                          <div
                            class="flex-1 p-5 rounded-2xl border transition-all duration-500 flex flex-col justify-between"
                            :class="[
                              ytStatus.lastSync?.status === 'failed'
                                ? 'bg-red-500/5 border-red-500/20'
                                : ytStatus.lastSync?.status === 'running'
                                  ? 'bg-indigo-500/5 border-indigo-500/20'
                                  : 'bg-white/[0.02] border-white/[0.05]',
                            ]"
                          >
                            <div class="flex items-center justify-between mb-4">
                              <span
                                class="text-sm font-black uppercase tracking-widest"
                                :class="{
                                  'text-red-400':
                                    ytStatus.lastSync?.status === 'failed',
                                  'text-indigo-400':
                                    ytStatus.lastSync?.status === 'running',
                                  'text-emerald-400':
                                    ytStatus.lastSync?.status === 'completed',
                                }"
                              >
                                {{ ytStatus.lastSync?.status }}
                              </span>
                              <span
                                class="text-[12px] font-mono text-slate-500"
                              >
                                {{
                                  ytStatus.lastSync?.completedAt
                                    ? new Date(
                                        ytStatus.lastSync.completedAt,
                                      ).toLocaleTimeString()
                                    : "..."
                                }}
                              </span>
                            </div>

                            <div class="grid grid-cols-2 gap-3 mb-6">
                              <div
                                v-for="stat in [
                                  {
                                    label: 'settings.found',
                                    val: ytStatus.lastSync?.commentsFound ?? 0,
                                    color: 'text-white',
                                  },
                                  {
                                    label: 'settings.new',
                                    val: ytStatus.lastSync?.newComments ?? 0,
                                    color: 'text-emerald-400',
                                  },
                                ]"
                                :key="stat.label"
                                class="bg-black/20 p-3 rounded-xl border border-white/5"
                              >
                                <p
                                  class="text-lg font-black"
                                  :class="stat.color"
                                >
                                  <span
                                    v-if="
                                      stat.label === 'settings.new' &&
                                      stat.val > 0
                                    "
                                    >+</span
                                  >{{ stat.val }}
                                </p>
                                <p
                                  class="text-[10px] font-bold text-slate-500 uppercase tracking-wider"
                                >
                                  {{ $t(stat.label) }}
                                </p>
                              </div>
                            </div>

                            <button
                              class="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black transition-all duration-300 shadow-lg shadow-indigo-900/20 group overflow-hidden relative"
                              :disabled="syncing"
                              @click="syncNow()"
                            >
                              <div
                                class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite]"
                              />
                              <UIcon
                                name="i-heroicons-arrow-path"
                                class="w-5 h-5 relative z-10"
                                :class="
                                  syncing
                                    ? 'animate-spin'
                                    : 'group-hover:rotate-180 duration-500'
                                "
                              />
                              <span class="relative z-10">{{
                                syncing
                                  ? $t("settings.syncing")
                                  : $t("settings.sync_now")
                              }}</span>
                            </button>
                          </div>
                        </div>

                        <!-- Right: Quota Card -->
                        <div class="flex flex-col h-full space-y-4">
                          <div class="px-2">
                            <span
                              class="text-xs font-black text-slate-500 uppercase tracking-widest"
                              >{{ $t("settings.daily_quota") }}</span
                            >
                          </div>
                          <div
                            class="p-6 rounded-3xl bg-white/[0.02] border border-white/[0.05] flex-1 flex flex-col justify-between"
                          >
                            <div class="space-y-6">
                              <div class="flex items-end justify-between">
                                <div class="space-y-1">
                                  <p
                                    class="text-4xl font-black text-white tracking-tighter"
                                  >
                                    {{ quotaPct }}%
                                  </p>
                                  <p
                                    class="text-xs font-bold text-slate-500 uppercase"
                                  >
                                    {{ $t("settings.daily_quota") }}
                                  </p>
                                </div>
                                <div
                                  class="text-right space-y-1 font-mono text-[10px] text-slate-400"
                                >
                                  <p>
                                    {{ quotaUsed.toLocaleString() }}
                                    {{ $t("settings.used") }}
                                  </p>
                                  <p class="text-slate-600">
                                    {{ $t("settings.limit") }}:
                                    {{ MAX_QUOTA_PER_DAY.toLocaleString() }}
                                  </p>
                                </div>
                              </div>

                              <div
                                class="relative h-3 bg-white/5 rounded-full overflow-hidden p-0.5"
                              >
                                <div
                                  class="h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(0,0,0,0.5)]"
                                  :class="quotaBarClass"
                                  :style="`width: ${quotaPct}%`"
                                />
                                <!-- Decorative markers -->
                                <div
                                  class="absolute inset-0 flex justify-between px-2 pointer-events-none opacity-20"
                                >
                                  <div
                                    v-for="i in 4"
                                    :key="i"
                                    class="w-[1px] h-full bg-white/20"
                                  />
                                </div>
                              </div>
                            </div>

                            <p
                              class="text-[12px] text-slate-500 leading-relaxed mt-3 mb-2 italic bg-white/5 p-3 rounded-xl border border-white/5"
                            >
                              {{ $t("settings.quota_warning") }}
                            </p>
                          </div>
                        </div>
                      </div>

                      <!-- Sync Warning -->
                      <Transition
                        enter-active-class="transition duration-300 ease-out"
                        enter-from-class="opacity-0 -translate-y-4"
                        enter-to-class="opacity-100 translate-y-0"
                      >
                        <div
                          v-if="syncWarning"
                          class="flex flex-col md:flex-row items-center gap-6 px-8 py-6 rounded-3xl bg-amber-500/10 border border-amber-500/20 backdrop-blur-xl"
                        >
                          <div
                            class="w-16 h-16 rounded-2xl bg-amber-500/20 flex items-center justify-center shrink-0 shadow-lg shadow-amber-950/20"
                          >
                            <UIcon
                              name="i-heroicons-exclamation-triangle"
                              class="w-8 h-8 text-amber-500"
                            />
                          </div>
                          <div class="flex-1 text-center md:text-left">
                            <p class="text-amber-400 font-black text-lg">
                              {{
                                $t("settings.sync_warning_title", {
                                  m: syncWarning.minutesAgo,
                                })
                              }}
                            </p>
                            <p class="text-amber-400/60 text-sm font-medium">
                              {{
                                $t("settings.sync_warning_cost", {
                                  cost: SYNC_QUOTA_COST,
                                  m: syncWarning.minutesLeft,
                                })
                              }}
                            </p>
                          </div>
                          <button
                            class="px-8 py-3 rounded-2xl bg-amber-500 text-black font-black hover:bg-amber-400 transition-all active:scale-95 shadow-xl shadow-amber-900/20"
                            @click="syncNow(true)"
                          >
                            {{ $t("settings.force") }}
                          </button>
                        </div>
                      </Transition>
                    </div>

                    <div v-else class="text-center py-20 px-8">
                      <div class="relative inline-block mb-8">
                        <div
                          class="absolute inset-0 bg-red-600/20 blur-3xl rounded-full animate-pulse"
                        />
                        <div
                          class="relative w-24 h-24 bg-red-600/10 border-2 border-red-500/30 rounded-[2.5rem] flex items-center justify-center rotate-6"
                        >
                          <svg
                            class="w-12 h-12 text-red-500"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path
                              d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"
                            />
                          </svg>
                        </div>
                      </div>
                      <h3
                        class="text-3xl font-black text-white mb-3 tracking-tight"
                      >
                        {{ $t("settings.not_connected_title") }}
                      </h3>
                      <p
                        class="text-slate-500 text-lg mb-10 max-w-sm mx-auto font-medium"
                      >
                        {{ $t("settings.connect_hint") }}
                      </p>
                      <button
                        class="inline-flex items-center gap-4 px-10 py-5 rounded-[2rem] bg-red-600 hover:bg-red-500 text-white text-lg font-black transition-all duration-300 shadow-2xl shadow-red-900/50 hover:-translate-y-1 active:translate-y-0 group"
                        :disabled="connecting"
                        @click="connectYouTube"
                      >
                        <UIcon
                          v-if="connecting"
                          name="i-heroicons-arrow-path"
                          class="w-6 h-6 animate-spin"
                        />
                        <svg
                          v-else
                          class="w-6 h-6 group-hover:scale-110 transition-transform"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path
                            d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"
                          />
                        </svg>
                        <span>{{
                          connecting
                            ? $t("settings.redirecting")
                            : $t("settings.connect_channel")
                        }}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- AI TAB -->
              <div v-if="activeTab === 'ai'" class="space-y-6">
                <!-- AI Engine Card -->
                <div
                  class="bg-white/[0.03] border border-white/[0.08] rounded-3xl backdrop-blur-2xl"
                >
                  <div
                    class="px-8 py-6 border-b border-white/[0.05] bg-white/[0.02] flex items-center gap-3"
                  >
                    <div
                      class="flex items-center justify-center p-2 rounded-xl bg-purple-500/10 border border-purple-500/20"
                    >
                      <UIcon
                        name="i-heroicons-cpu-chip"
                        class="w-5 h-5 text-purple-500"
                      />
                    </div>
                    <span
                      class="font-black text-slate-200 tracking-wider uppercase text-xs"
                      >{{ $t("settings.ai_engine_title") }}</span
                    >
                  </div>

                  <div class="p-8 space-y-8">
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <!-- Provider Selection -->
                      <div class="space-y-4">
                        <label
                          class="text-xs font-black text-slate-500 uppercase tracking-widest px-1"
                          >{{ $t("settings.ai_provider") }}</label
                        >
                        <div
                          class="flex bg-black/40 p-1.5 rounded-2xl border border-white/5 shadow-inner"
                        >
                          <button
                            v-for="opt in [
                              {
                                label: $t('settings.ai_provider_gemini'),
                                value: 'gemini',
                              },
                              {
                                label: $t('settings.ai_provider_openai'),
                                value: 'openai',
                              },
                            ]"
                            :key="opt.value"
                            class="flex-1 px-4 py-3 rounded-xl text-sm font-black transition-all duration-300"
                            :class="
                              activeAiProvider === opt.value
                                ? 'bg-white/10 text-white shadow-lg ring-1 ring-white/10'
                                : 'text-slate-500 hover:text-slate-300'
                            "
                            @click="updateAiProvider(opt.value)"
                          >
                            {{ opt.label }}
                          </button>
                        </div>
                        <div
                          class="flex items-center gap-2 p-3 rounded-xl bg-purple-500/5 border border-purple-500/10"
                        >
                          <UIcon
                            name="i-heroicons-sparkles"
                            class="w-4 h-4 text-purple-400"
                          />
                          <span
                            class="text-[10px] font-black text-slate-500 uppercase tracking-widest mr-2"
                            >{{ $t("settings.active_model") }}:</span
                          >
                          <code class="text-xs text-purple-400 font-mono">{{
                            activeModel
                          }}</code>
                        </div>
                      </div>

                      <!-- Auto Suggest Toggle -->
                      <div class="space-y-4">
                        <label
                          class="text-xs font-black text-slate-500 uppercase tracking-widest px-1"
                          >{{ $t("settings.auto_suggest_title") }}</label
                        >
                        <div
                          class="flex bg-black/40 p-1.5 rounded-2xl border border-white/5 shadow-inner"
                        >
                          <button
                            v-for="opt in [
                              {
                                label: $t('settings.auto_suggest_on'),
                                value: true,
                              },
                              {
                                label: $t('settings.auto_suggest_off'),
                                value: false,
                              },
                            ]"
                            :key="String(opt.value)"
                            class="flex-1 px-4 py-3 rounded-xl text-sm font-black transition-all duration-300"
                            :class="
                              autoSuggestEnabled === opt.value
                                ? 'bg-emerald-500/20 text-emerald-400 shadow-lg ring-1 ring-emerald-500/20'
                                : 'text-slate-500 hover:text-slate-300'
                            "
                            @click="updateAutoSuggest(opt.value)"
                          >
                            {{ opt.label }}
                          </button>
                        </div>
                        <p
                          class="text-[10px] text-slate-500 leading-relaxed px-1"
                        >
                          {{ $t("settings.auto_suggest_hint") }}
                        </p>
                      </div>
                    </div>

                    <div
                      class="pt-6 border-t border-white/5 flex flex-col md:flex-row gap-4"
                    >
                      <button
                        class="flex-1 flex items-center justify-between gap-4 px-6 py-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 text-emerald-400 font-black transition-all group"
                        :disabled="!pendingCount?.count || forcingSuggest"
                        @click="showForceSuggestModal = true"
                      >
                        <div class="flex items-center gap-3">
                          <div
                            class="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center group-hover:scale-110 transition-transform"
                          >
                            <UIcon
                              name="i-heroicons-sparkles"
                              class="w-6 h-6"
                            />
                          </div>
                          <div class="text-left">
                            <p class="text-sm uppercase tracking-wider">
                              {{ $t("settings.force_suggest_button") }}
                            </p>
                            <p
                              class="text-[10px] text-emerald-500/60 font-bold"
                            >
                              {{ $t("settings.ai_engine_manual_queue") }}
                            </p>
                          </div>
                        </div>
                        <div
                          class="px-3 py-1 rounded-lg bg-emerald-500/20 text-xs"
                        >
                          {{
                            pendingCount?.count
                              ? $t("settings.force_suggest_count", {
                                  n: pendingCount.count,
                                })
                              : $t("settings.force_suggest_none")
                          }}
                        </div>
                      </button>

                      <NuxtLink
                        to="/settings/automation"
                        class="flex-1 flex items-center justify-between gap-4 px-6 py-5 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 hover:bg-indigo-500/10 text-indigo-400 font-black transition-all group"
                      >
                        <div class="flex items-center gap-3">
                          <div
                            class="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center group-hover:scale-110 transition-transform"
                          >
                            <UIcon name="i-heroicons-bolt" class="w-6 h-6" />
                          </div>
                          <div class="text-left">
                            <p class="text-sm uppercase tracking-wider">
                              {{ $t("settings.automation_rules_title") }}
                            </p>
                            <p class="text-[10px] text-indigo-500/60 font-bold">
                              {{ $t("settings.automation_rules_subtitle") }}
                            </p>
                          </div>
                        </div>
                        <UIcon
                          name="i-heroicons-chevron-right"
                          class="w-5 h-5 opacity-40 group-hover:translate-x-1 transition-transform"
                        />
                      </NuxtLink>
                    </div>
                  </div>
                </div>
              </div>

              <!-- SYSTEM TAB -->
              <div v-if="activeTab === 'system'" class="space-y-6">
                <div
                  class="relative z-20 grid grid-cols-1 md:grid-cols-2 gap-6"
                >
                  <!-- Language Card -->
                  <div
                    class="relative z-20 bg-white/[0.03] border border-white/[0.08] rounded-3xl backdrop-blur-2xl p-8 space-y-6"
                  >
                    <div class="flex items-center gap-3 mb-2">
                      <div
                        class="flex items-center justify-center p-2 rounded-xl bg-blue-500/10 border border-blue-500/20"
                      >
                        <UIcon
                          name="i-heroicons-language"
                          class="w-5 h-5 text-blue-500"
                        />
                      </div>
                      <span
                        class="font-black text-slate-200 tracking-wider uppercase text-xs"
                        >{{ $t("settings.language_title") }}</span
                      >
                    </div>
                    <p class="text-sm text-slate-500 font-medium">
                      {{ $t("settings.language_subtitle") }}
                    </p>

                    <USelectMenu
                      v-model="currentLocale"
                      :options="languageOptions"
                      value-attribute="value"
                      option-attribute="label"
                      class="w-full"
                      :ui-menu="{
                        background: 'bg-slate-900',
                        ring: 'ring-1 ring-white/10',
                        option: {
                          active: 'bg-white/10',
                          selected: 'text-indigo-400',
                        },
                      }"
                    >
                      <template #label>
                        <div class="flex items-center gap-2 py-1">
                          <span class="text-sm font-black">{{
                            languageOptions.find((o) => o.value === locale)
                              ?.label
                          }}</span>
                        </div>
                      </template>
                    </USelectMenu>
                  </div>

                  <!-- Backfill Card -->
                  <div
                    class="bg-white/[0.03] border border-white/[0.08] rounded-3xl backdrop-blur-2xl p-8 space-y-6 flex flex-col justify-between"
                  >
                    <div>
                      <div class="flex items-center gap-3 mb-2">
                        <div
                          class="flex items-center justify-center p-2 rounded-xl bg-amber-500/10 border border-amber-500/20"
                        >
                          <UIcon
                            name="i-heroicons-user-circle"
                            class="w-5 h-5 text-amber-500"
                          />
                        </div>
                        <span
                          class="font-black text-slate-200 tracking-wider uppercase text-xs"
                          >{{ $t("settings.maintenance_title") }}</span
                        >
                      </div>
                      <p class="text-sm text-slate-500 font-medium">
                        {{ $t("settings.maintenance_subtitle") }}
                      </p>
                    </div>

                    <button
                      class="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black transition-all active:scale-95 group"
                      :disabled="backfillingAvatars"
                      @click="backfillAvatars"
                    >
                      <UIcon
                        name="i-heroicons-arrow-path"
                        class="w-5 h-5 transition-transform"
                        :class="
                          backfillingAvatars
                            ? 'animate-spin'
                            : 'group-hover:rotate-180 duration-500'
                        "
                      />
                      {{
                        backfillingAvatars
                          ? $t("settings.syncing")
                          : $t("settings.backfill_avatars")
                      }}
                    </button>
                  </div>
                </div>

                <!-- Environment Config Card -->
                <div
                  class="relative z-10 bg-white/[0.03] border border-white/[0.08] rounded-3xl backdrop-blur-2xl"
                >
                  <div
                    class="px-8 py-6 border-b border-white/[0.05] bg-white/[0.02] flex items-center gap-3"
                  >
                    <div
                      class="flex items-center justify-center p-2 rounded-xl bg-slate-500/10 border border-slate-500/20"
                    >
                      <UIcon
                        name="i-heroicons-code-bracket"
                        class="w-5 h-5 text-slate-400"
                      />
                    </div>
                    <span
                      class="font-black text-slate-200 tracking-wider uppercase text-xs"
                      >{{ $t("settings.configuration") }}</span
                    >
                  </div>
                  <div class="p-8">
                    <div
                      class="bg-indigo-500/5 border border-indigo-500/10 p-4 rounded-2xl mb-8"
                    >
                      <p
                        class="text-xs text-indigo-400/80 leading-relaxed font-medium"
                      >
                        {{ $t("settings.config_hint").split(".env")[0] }}
                        <code
                          class="bg-white/5 px-1.5 py-0.5 rounded-lg text-white font-mono"
                          >.env</code
                        >
                        {{
                          $t("settings.config_hint")
                            .split(".env")[1]
                            ?.split(".env.example")[0]
                        }}
                        <code
                          class="bg-white/5 px-1.5 py-0.5 rounded-lg text-white font-mono"
                          >.env.example</code
                        >
                        {{
                          $t("settings.config_hint").split(".env.example")[1]
                        }}
                      </p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div
                        v-for="item in [
                          {
                            env: 'SYNC_INTERVAL_MINUTES',
                            label: 'settings.sync_interval',
                            value: settings?.syncIntervalMinutes,
                          },
                          {
                            env: 'MAX_QUOTA_PER_DAY',
                            label: 'settings.daily_quota_guard',
                            value: settings?.maxQuotaPerDay,
                          },
                          {
                            env: 'LOCKOUT_DURATION_MINUTES',
                            label: 'settings.login_lockout',
                            value: settings?.lockoutDurationMinutes,
                          },
                        ]"
                        :key="item.env"
                        class="p-5 rounded-2xl bg-black/20 border border-white/5 hover:border-white/10 transition-colors space-y-3"
                      >
                        <p
                          class="text-[10px] font-black text-slate-500 uppercase tracking-widest"
                        >
                          {{ $t(item.label) }}
                        </p>
                        <div class="flex items-center justify-between">
                          <code class="text-[10px] text-slate-400 font-mono">{{
                            item.env
                          }}</code>
                          <span
                            class="text-white font-mono font-black text-lg"
                            >{{ item.value ?? "-" }}</span
                          >
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- DANGER TAB -->
              <div v-if="activeTab === 'danger'" class="space-y-6">
                <div
                  class="bg-red-500/[0.02] border border-red-500/20 rounded-3xl overflow-hidden backdrop-blur-2xl"
                >
                  <div
                    class="px-8 py-6 border-b border-red-500/10 bg-red-500/[0.05] flex items-center gap-3"
                  >
                    <div
                      class="flex items-center justify-center p-2 rounded-xl bg-red-500/20 border border-red-500/30 shadow-lg shadow-red-900/20"
                    >
                      <UIcon
                        name="i-heroicons-exclamation-triangle"
                        class="w-5 h-5 text-red-500"
                      />
                    </div>
                    <span
                      class="font-black text-red-400 tracking-wider uppercase text-xs"
                      >{{ $t("settings.danger_zone") }}</span
                    >
                  </div>

                  <div class="p-10 text-center max-w-2xl mx-auto space-y-8">
                    <div class="space-y-4">
                      <h3 class="text-3xl font-black text-white tracking-tight">
                        {{ $t("settings.reset_app") }}
                      </h3>
                      <p class="text-slate-500 font-medium leading-relaxed">
                        {{ $t("settings.reset_description") }}
                      </p>
                    </div>

                    <div class="flex flex-col items-center gap-4">
                      <div
                        class="p-4 bg-red-500/5 border border-red-500/10 rounded-2xl text-xs text-red-400 font-bold mb-4"
                      >
                        {{ $t("settings.reset_warning") }}
                      </div>
                      <button
                        class="w-full md:w-auto px-12 py-5 rounded-[2rem] bg-red-600 hover:bg-red-500 text-white font-black transition-all duration-300 shadow-2xl shadow-red-900/40 hover:-translate-y-1 active:translate-y-0 active:scale-95"
                        @click="showResetModal = true"
                      >
                        {{ $t("settings.reset_app") }}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>

    <!-- Modals -->
    <UiConfirmModal
      v-model="showDisconnectModal"
      :title="$t('settings.disconnect_modal_title')"
      :description="$t('settings.disconnect_modal_description')"
      :confirm-text="$t('settings.disconnect')"
      :cancel-text="$t('comments.cancel')"
      type="danger"
      :loading="disconnecting"
      @confirm="disconnectYouTube"
    />

    <UiConfirmModal
      v-model="showForceSuggestModal"
      :title="$t('settings.force_suggest_modal_title')"
      :description="
        $t('settings.force_suggest_modal_description', {
          n: pendingCount?.count ?? 0,
        })
      "
      :confirm-text="$t('settings.force_suggest_modal_confirm')"
      :cancel-text="$t('comments.cancel')"
      type="warning"
      :loading="forcingSuggest"
      @confirm="forceSuggestNow"
    />

    <UiResetModal
      v-model="showResetModal"
      :loading="resetting"
      @confirm="resetApplication"
    />
  </div>
</template>

<style scoped>
@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.animate-shimmer {
  animation: shimmer 2s infinite;
}
</style>
