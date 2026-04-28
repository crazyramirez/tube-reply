<script setup lang="ts">
import type { DashboardStats, YouTubeStatus } from "~/shared/types";

definePageMeta({ middleware: "auth" });

const toast = useToast();
const { t } = useI18n();

useHead({
  meta: [{ name: "referrer", content: "no-referrer" }],
});

const { data: stats, refresh } = await useFetch<DashboardStats>(
  "/api/dashboard/stats",
);
const { data: ytStatus, refresh: refreshStatus } =
  await useFetch<YouTubeStatus>("/api/youtube/status");

const SYNC_COOLDOWN_MINUTES = 2;
const SYNC_QUOTA_COST = 5;

const syncLoading = ref(false);
const syncWarning = ref<{ minutesAgo: number; minutesLeft: number } | null>(
  null,
);

// Polling for sync status
let pollInterval: any = null;
const isMounted = ref(false);

function startPolling() {
  if (pollInterval) return;
  syncLoading.value = true;
  pollInterval = setInterval(async () => {
    await refreshStatus();
    if (ytStatus.value?.lastSync?.status !== "running") {
      stopPolling();
      await refresh();
    }
  }, 3000);
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  syncLoading.value = false;
}

onMounted(() => {
  isMounted.value = true;
  if (ytStatus.value?.lastSync?.status === "running") {
    startPolling();
  }
});

onUnmounted(() => {
  stopPolling();
});

async function triggerSync(force = false) {
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
  syncLoading.value = true;
  try {
    await $fetch("/api/youtube/sync", {
      method: "POST",
      headers: useCsrfHeaders(),
    });
    toast.add({ title: t("settings.sync_started"), color: "blue" });
    startPolling();
  } catch (e) {
    toast.add({ title: t("settings.sync_failed"), color: "red" });
    syncLoading.value = false;
  }
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("time.just_now");
  if (mins < 60) return t("time.minutes_ago", { m: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("time.hours_ago", { h: hrs });
  return t("time.days_ago", { d: Math.floor(hrs / 24) });
}

const statusColor = (s: string) =>
  s === "published"
    ? "green"
    : s === "suggested"
      ? "blue"
      : s === "dismissed"
        ? "gray"
        : "yellow";

const { failedThumbnails, getCleanThumbnailUrl, handleThumbnailError } = useYouTubeThumbnail();

const statCards = computed(() => [
  {
    label: t("dashboard.pending_review"),
    value: stats.value?.comments.suggested ?? 0,
    icon: "i-heroicons-sparkles",
    color: "indigo",
    bg: "bg-indigo-500/10",
    text: "text-indigo-400",
    glow: "from-indigo-400 to-violet-400",
  },
  {
    label: t("dashboard.awaiting_ai"),
    value: stats.value?.comments.pending ?? 0,
    icon: "i-heroicons-clock",
    color: "amber",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    glow: "from-amber-400 to-orange-400",
  },
  {
    label: t("dashboard.published_today"),
    value: stats.value?.comments.publishedToday ?? 0,
    icon: "i-heroicons-check-circle",
    color: "emerald",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    glow: "from-emerald-400 to-teal-400",
  },
  {
    label: t("dashboard.total_published"),
    value: stats.value?.comments.totalPublished ?? 0,
    icon: "i-heroicons-paper-airplane",
    color: "slate",
    bg: "bg-white/[0.06]",
    text: "text-slate-300",
    glow: "from-slate-300 to-slate-400",
  },
]);
</script>

<template>
  <div>
    <div class="mb-6 sm:mb-8">
      <div class="flex flex-row items-center justify-between gap-4">
        <div>
          <div
            class="flex items-center gap-2 text-[10px] font-bold text-indigo-400 uppercase tracking-[0.3em] mb-1"
          >
            <UIcon
              name="i-heroicons-presentation-chart-line"
              class="w-3.5 h-3.5"
            />
            {{ $t("dashboard.analytics_label") }}
          </div>
          <h1
            class="text-2xl sm:text-3xl font-black text-white tracking-tighter"
          >
            {{ $t("dashboard.title") }}
          </h1>
        </div>

        <button
          class="flex items-center gap-2 px-6 py-3 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-sm font-bold transition-all duration-300 cursor-pointer disabled:opacity-50 group shrink-0"
          :disabled="syncLoading"
          @click="triggerSync()"
        >
          <UIcon
            name="i-heroicons-arrow-path"
            class="w-4 h-4 transition-transform duration-500"
            :class="syncLoading ? 'animate-spin' : 'group-hover:rotate-180'"
          />
          <span class="hidden sm:inline">{{
            syncLoading
              ? $t("dashboard.synchronizing")
              : $t("dashboard.force_sync")
          }}</span>
          <span v-if="syncLoading" class="sm:hidden">{{
            $t("dashboard.synchronizing")
          }}</span>
        </button>
      </div>

      <Transition
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 -translate-y-2 scale-95"
        enter-to-class="opacity-100 translate-y-0 scale-100"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-100 translate-y-0 scale-100"
        leave-to-class="opacity-0 -translate-y-2 scale-95"
      >
        <div
          v-if="syncWarning"
          class="mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs animate-in fade-in slide-in-from-top-2"
        >
          <UIcon
            name="i-heroicons-exclamation-triangle"
            class="w-5 h-5 text-amber-400 shrink-0"
          />
          <div class="flex-1">
            <p class="text-amber-300 font-bold">
              {{
                $t("dashboard.sync_warning_title", {
                  m: syncWarning.minutesAgo,
                })
              }}
            </p>
            <p class="text-amber-500/80">
              {{
                $t("dashboard.sync_warning_cost", {
                  cost: SYNC_QUOTA_COST,
                  m: syncWarning.minutesLeft,
                })
              }}
            </p>
          </div>
          <UButton
            color="amber"
            variant="soft"
            size="xs"
            class="font-black uppercase tracking-widest px-4"
            @click="triggerSync(true)"
          >
            {{ $t("dashboard.force") }}
          </UButton>
        </div>
      </Transition>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-8 sm:mb-12">
      <div
        v-for="(card, idx) in statCards"
        :key="card.label"
        class="glass-card p-4 sm:p-6 animate-slide-up"
        :class="`stagger-${idx + 1}`"
      >
        <div class="flex items-start justify-between mb-2 sm:mb-4">
          <div
            class="w-8 h-8 sm:w-12 sm:h-12 rounded-lg sm:rounded-2xl flex items-center justify-center border border-white/5 shadow-inner"
            :class="card.bg"
          >
            <UIcon :name="card.icon" class="w-4 h-4 sm:w-6 sm:h-6" :class="card.text" />
          </div>
        </div>
        <div
          class="text-2xl sm:text-4xl font-black bg-gradient-to-br bg-clip-text text-transparent tracking-tighter"
          :class="card.glow"
        >
          {{ card.value }}
        </div>
        <div
          class="text-[8px] sm:text-[10px] font-bold text-slate-500 mt-1 sm:mt-2 uppercase tracking-[0.1em] sm:tracking-[0.2em] line-clamp-1"
        >
          {{ card.label }}
        </div>
      </div>
    </div>

    <!-- Latest Videos -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-2">
        <div
          class="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
        ></div>
        <h2
          class="font-black text-lg text-white tracking-tight uppercase tracking-widest"
        >
          {{ $t("dashboard.latest_videos") }}
        </h2>
      </div>
      <NuxtLink
        to="/analytics"
        class="flex items-center gap-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-all group"
      >
        {{ $t("dashboard.view_all_videos") }}
        <UIcon
          name="i-heroicons-arrow-right"
          class="w-4 h-4 group-hover:translate-x-1 transition-transform"
        />
      </NuxtLink>
    </div>

    <div
      v-if="!stats?.recentVideos?.length"
      class="bg-white/[0.02] border border-white/[0.08] border-dashed rounded-3xl py-12 text-center mb-12"
    >
      <p class="text-slate-400 font-bold uppercase tracking-widest text-xs">
        {{ $t("dashboard.no_videos") }}
      </p>
    </div>

    <div
      v-else
      class="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-12"
    >
      <NuxtLink
        v-for="(video, idx) in stats.recentVideos"
        :key="video.id"
        :to="`/comments?videoId=${video.id}`"
        class="glass-card overflow-hidden flex flex-col group animate-slide-up"
        :class="`stagger-${(idx % 4) + 1}`"
      >
        <div class="relative aspect-video bg-slate-900 overflow-hidden">
          <img
            v-if="video.thumbnailUrl && !failedThumbnails[video.id]"
            :src="getCleanThumbnailUrl(video.id, video.thumbnailUrl)"
            :alt="video.title"
            class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
            loading="lazy"
            referrerpolicy="no-referrer"
            @error="handleThumbnailError(video.id, video.id, $event)"
          />
          <div v-else class="w-full h-full flex items-center justify-center bg-slate-900">
            <UIcon name="i-heroicons-video-camera" class="w-8 h-8 text-slate-800" />
          </div>
          <div
            class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"
          />
          
          <!-- Overlay Stats (Views/Likes) -->
          <div
            class="absolute bottom-2 left-2 right-2 flex items-center justify-between"
          >
            <div class="flex gap-1.5">
              <div
                class="px-2 py-1 rounded-lg bg-black/80 text-[10px] font-black text-white backdrop-blur-md border border-white/10 flex items-center gap-1.5 shadow-xl"
              >
                <UIcon
                  name="i-heroicons-eye"
                  class="w-3 h-3 text-slate-400"
                />
                {{ video.viewCount?.toLocaleString() || 0 }}
              </div>
              <div
                v-if="video.likeCount"
                class="px-2 py-1 rounded-lg bg-black/80 text-[10px] font-black text-white backdrop-blur-md border border-white/10 flex items-center gap-1.5 shadow-xl"
              >
                <UIcon
                  name="i-heroicons-hand-thumb-up"
                  class="w-3 h-3 text-indigo-400"
                />
                {{ video.likeCount?.toLocaleString() }}
              </div>
            </div>
            <div
              class="px-2 py-1 rounded-lg bg-indigo-600 text-[10px] font-black text-white backdrop-blur-md border border-white/20 shadow-[0_4px_12px_rgba(79,70,229,0.4)]"
            >
              {{ video.commentCount?.toLocaleString() || 0 }}
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="p-3 flex flex-col flex-1 bg-white/[0.02]">
          <p
            class="text-[11px] font-black text-slate-200 line-clamp-2 group-hover:text-indigo-400 transition-colors mb-2 leading-tight h-8"
          >
            {{ video.title }}
          </p>

          <div class="mt-auto flex items-center justify-between border-t border-white/5 pt-2">
            <span class="text-[9px] font-black text-indigo-500/50 uppercase tracking-widest">
              {{ $t('nav.comments') }}
            </span>
            <span class="text-[9px] font-bold text-slate-600">
              {{ isMounted ? timeAgo(video.publishedAt) : '...' }}
            </span>
          </div>
        </div>
      </NuxtLink>
    </div>

    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-2">
        <div
          class="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
        ></div>
        <h2
          class="font-black text-lg text-white tracking-tight uppercase tracking-widest"
        >
          {{ $t("dashboard.live_feed") }}
        </h2>
      </div>
      <NuxtLink
        to="/comments"
        class="flex items-center gap-2 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-all group"
      >
        {{ $t("dashboard.access_all") }}
        <UIcon
          name="i-heroicons-arrow-right"
          class="w-4 h-4 group-hover:translate-x-1 transition-transform"
        />
      </NuxtLink>
    </div>

    <div
      v-if="!stats?.recentComments?.length"
      class="bg-white/[0.02] border border-white/[0.08] border-dashed rounded-3xl py-24 text-center"
    >
      <div
        class="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-white/10"
      >
        <UIcon name="i-heroicons-inbox" class="w-8 h-8 text-slate-700" />
      </div>
      <p class="text-slate-400 font-bold uppercase tracking-widest text-sm">
        {{ $t("dashboard.no_comments") }}
      </p>
      <p class="text-slate-600 text-xs mt-2">
        {{ $t("dashboard.init_sync") }}
      </p>
    </div>

    <div
      v-else
      class="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-6 dashboard-single-row"
    >
      <NuxtLink
        v-for="(comment, idx) in stats.recentComments"
        :key="comment.id"
        :to="`/comments/${comment.id}`"
        class="glass-card overflow-hidden flex flex-col group animate-slide-up"
        :class="`stagger-${(idx % 4) + 1}`"
      >
        <!-- Video Preview -->
        <div class="relative aspect-video bg-slate-900 overflow-hidden">
          <img
            v-if="comment.videoThumbnail && !failedThumbnails[comment.id]"
            :src="getCleanThumbnailUrl(comment.videoId, comment.videoThumbnail)"
            :alt="comment.videoTitle ?? ''"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            loading="lazy"
            referrerpolicy="no-referrer"
            @error="handleThumbnailError(comment.id, comment.videoId, $event)"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <UIcon
              name="i-heroicons-video-camera"
              class="text-slate-800 w-12 h-12"
            />
          </div>
          <div
            class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60"
          />

          <div class="absolute top-2 left-2 sm:top-3 sm:left-3 flex gap-2">
            <UBadge
              :color="statusColor(comment.status)"
              variant="solid"
              size="xs"
              class="font-black tracking-tighter rounded-md text-[8px] sm:text-[10px] px-1 sm:px-1.5"
            >
              {{ $t("status." + comment.status).toUpperCase() }}
            </UBadge>
          </div>

          <div class="absolute bottom-3 left-3 right-3">
            <p
              class="text-[10px] font-bold text-slate-300 line-clamp-1 uppercase tracking-wider mb-1"
            >
              {{ comment.videoTitle }}
            </p>
          </div>
        </div>

        <!-- Content -->
        <div class="p-3 sm:p-5 flex flex-col flex-1 gap-2 sm:gap-4">
          <a
            v-if="comment.authorChannelId"
            rel="noreferrer"
            class="flex items-center gap-2 sm:gap-3 group/author"
            @click.stop
          >
            <UAvatar
              :src="
                comment.authorProfileImageUrl ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.authorName || 'User')}&background=6366f1&color=fff`
              "
              size="sm"
              class="ring-1 ring-white/10 group-hover/author:ring-indigo-500/50 transition-all"
              :alt="comment.authorName"
              :img-attributes="{
                referrerpolicy: 'no-referrer',
                crossorigin: 'anonymous',
              }"
            />
            <div class="flex flex-col min-w-0">
              <span
                class="font-bold text-[10px] sm:text-sm text-white truncate"
                >{{ comment.authorName }}</span
              >
              <span
                class="mt-0.5 text-[8px] sm:text-[12px] text-slate-500 font-medium"
                >{{ isMounted ? timeAgo(comment.publishedAt) : '...' }}</span
              >
            </div>
          </a>
          <div v-else class="flex items-center gap-2 sm:gap-3">
            <UAvatar
              :src="
                comment.authorProfileImageUrl ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.authorName || 'User')}&background=6366f1&color=fff`
              "
              size="sm"
              class="ring-1 ring-white/10"
              :alt="comment.authorName"
              :img-attributes="{
                referrerpolicy: 'no-referrer',
                crossorigin: 'anonymous',
              }"
            />
            <div class="flex flex-col min-w-0">
              <span
                class="font-bold text-[10px] sm:text-sm text-white truncate"
                >{{ comment.authorName }}</span
              >
              <span
                class="mt-0.5 text-[8px] sm:text-[12px] text-slate-500 font-medium"
                >{{ isMounted ? timeAgo(comment.publishedAt) : '...' }}</span
              >
            </div>
          </div>

          <div
            class="bg-white/5 border border-white/5 rounded-lg sm:rounded-xl p-2 sm:p-4 flex-1"
          >
            <p
              class="text-[10px] sm:text-sm text-slate-300 leading-relaxed line-clamp-2 italic"
            >
              "{{ comment.text }}"
            </p>
          </div>

          <div class="flex items-center justify-between pt-1 sm:pt-2">
            <div class="flex items-center gap-2 sm:gap-3">
              <span
                class="text-[8px] sm:text-[10px] font-bold text-slate-500 flex items-center gap-1"
              >
                <UIcon
                  name="i-heroicons-hand-thumb-up"
                  class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-500"
                />
                {{ comment.likeCount }}
              </span>
            </div>
            <div
              class="flex items-center gap-1 text-[10px] font-bold text-indigo-400 group-hover:translate-x-1 transition-transform"
            >
              <span class="hidden sm:inline">{{ $t("comments.review") }}</span>
              <UIcon name="i-heroicons-arrow-right" class="w-3 h-3" />
            </div>
          </div>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
/* Show all 4 items on mobile (stacked) */
.dashboard-single-row > *:nth-child(n + 5) {
  display: none;
}
@media (min-width: 768px) {
  /* On tablets, keep 2 items to maintain a nice look if they are wide */
  .dashboard-single-row > *:nth-child(n + 3) {
    display: none;
  }
}
@media (min-width: 1024px) {
  /* On desktop, show 3 items */
  .dashboard-single-row > *:nth-child(n + 3) {
    display: flex;
  }
  .dashboard-single-row > *:nth-child(n + 4) {
    display: none;
  }
}
@media (min-width: 1536px) {
  /* On large screens, show all 4 */
  .dashboard-single-row > *:nth-child(n + 4) {
    display: flex;
  }
  .dashboard-single-row > *:nth-child(n + 5) {
    display: none;
  }
}
</style>
