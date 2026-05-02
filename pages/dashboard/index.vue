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

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const statusColor = (s: string) =>
  s === "published"
    ? "green"
    : s === "suggested"
      ? "blue"
      : s === "dismissed"
        ? "gray"
        : "yellow";

const { failedThumbnails, getCleanThumbnailUrl, handleThumbnailError } =
  useYouTubeThumbnail();

const statCards = computed(() => [
  {
    label: t("dashboard.pending_review"),
    value: stats.value?.comments.suggested ?? 0,
    icon: "i-heroicons-sparkles",
    color: "indigo",
    bg: "bg-indigo-500/10",
    text: "text-indigo-400",
    glow: "from-indigo-400 to-violet-400",
    accent: "bg-indigo-500 shadow-indigo-500/50",
  },
  {
    label: t("dashboard.awaiting_ai"),
    value: stats.value?.comments.pending ?? 0,
    icon: "i-heroicons-clock",
    color: "amber",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    glow: "from-amber-400 to-orange-400",
    accent: "bg-amber-500 shadow-amber-500/50",
  },
  {
    label: t("dashboard.published_today"),
    value: stats.value?.comments.publishedToday ?? 0,
    icon: "i-heroicons-check-circle",
    color: "emerald",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    glow: "from-emerald-400 to-teal-400",
    accent: "bg-emerald-500 shadow-emerald-500/50",
  },
  {
    label: t("dashboard.total_published"),
    value: stats.value?.comments.totalPublished ?? 0,
    icon: "i-heroicons-paper-airplane",
    color: "slate",
    bg: "bg-white/[0.06]",
    text: "text-slate-300",
    glow: "from-slate-300 to-slate-400",
    accent: "bg-slate-500 shadow-slate-500/50",
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

        <!-- Manual Sync Button -->
        <button
          class="flex items-center justify-center p-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all duration-300 cursor-pointer disabled:opacity-50 group shrink-0 shadow-lg"
          :disabled="syncLoading"
          @click="triggerSync()"
          title="Sincronizar"
        >
          <UIcon
            name="i-heroicons-arrow-path"
            class="w-5 h-5 transition-transform duration-500"
            :class="syncLoading ? 'animate-spin' : 'group-hover:rotate-180'"
          />
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
          class="mt-4 flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs animate-in fade-in slide-in-from-top-2 shadow-2xl"
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
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4 mb-8 sm:mb-12">
      <div
        v-for="(card, idx) in statCards"
        :key="card.label"
        class="group relative glass-card p-3 sm:p-6 rounded-xl overflow-hidden hover:-translate-y-1 transition-all duration-500 hover:shadow-2xl animate-slide-up"
        :class="`stagger-${idx + 1}`"
      >
        <div
          class="absolute top-0 left-0 right-0 h-1 transition-all duration-500 group-hover:h-1.5"
          :class="card.accent"
        ></div>

        <div class="flex items-start justify-between mb-2 sm:mb-4">
          <div
            class="w-8 h-8 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center border border-white/5 shadow-inner"
            :class="card.bg"
          >
            <UIcon
              :name="card.icon"
              class="w-4 h-4 sm:w-6 sm:h-6"
              :class="card.text"
            />
          </div>
        </div>
        <div
          class="text-2xl sm:text-4xl font-black bg-gradient-to-br bg-clip-text text-transparent tracking-tighter"
          :class="card.glow"
        >
          {{ card.value }}
        </div>
        <div
          class="text-[8px] sm:text-[10px] font-black text-slate-500 mt-1 sm:mt-2 uppercase tracking-[0.2em] line-clamp-1"
        >
          {{ card.label }}
        </div>
      </div>
    </div>

    <!-- Live Feed -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <div
          class="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)] animate-pulse"
        ></div>
        <h2
          class="font-black text-lg text-white tracking-tight uppercase tracking-widest"
        >
          {{ $t("dashboard.live_feed") }}
        </h2>
      </div>
      <NuxtLink
        to="/comments"
        class="flex items-center gap-2 text-xs font-black text-indigo-400 hover:text-indigo-300 transition-all group uppercase tracking-widest"
      >
        {{ $t("dashboard.access_all") }}
        <UIcon
          name="i-heroicons-arrow-right-solid"
          class="w-4 h-4 group-hover:translate-x-1 transition-transform"
        />
      </NuxtLink>
    </div>

    <div
      v-if="!stats?.recentComments?.length"
      class="relative overflow-hidden rounded-3xl bg-slate-900/40 border border-white/5 backdrop-blur-xl p-8 sm:p-14 text-center mb-12 transition-all duration-500 hover:shadow-[0_40px_80px_-15px_rgba(0,0,0,0.7),0_0_30px_rgba(16,185,129,0.06)] group animate-slide-up"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-teal-500/5 pointer-events-none"
      />
      <div
        class="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center"
      >
        <!-- Accent Glow Ring -->
        <div
          class="absolute inset-0 rounded-full bg-emerald-500/10 border border-emerald-500/20 animate-ping scale-110 pointer-events-none opacity-40"
        />
        <!-- Glowing Center Icon Glass Case -->
        <div
          class="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-white/10 flex items-center justify-center backdrop-blur-sm shadow-[0_0_20px_rgba(16,185,129,0.15)] group-hover:scale-110 transition-all duration-500"
        >
          <UIcon
            name="i-heroicons-inbox"
            class="w-8 h-8 text-emerald-400 group-hover:text-emerald-300 transition-colors"
          />
        </div>
      </div>
      <h3
        class="text-xl sm:text-2xl font-extrabold text-white mb-2 tracking-tight uppercase tracking-wider"
      >
        {{ $t("dashboard.no_comments") }}
      </h3>
      <p class="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed mb-6">
        {{ $t("dashboard.init_sync") }}
      </p>
    </div>

    <div
      v-else
      class="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-3 dashboard-single-row mb-12"
    >
      <div
        v-for="(c, idx) in stats.recentComments"
        :key="c.id"
        class="flex flex-col"
      >
        <NuxtLink
          :to="`/comments/${c.id}`"
          class="comment-card-premium group relative flex flex-col h-full rounded-xl overflow-hidden bg-slate-900/40 border border-white/5 backdrop-blur-xl transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8),0_0_20px_rgba(99,102,241,0.08)] animate-slide-up"
          :class="`stagger-${(idx % 4) + 1}`"
        >
          <!-- Premium Border Glow -->
          <div
            class="absolute inset-0 border border-white/10 rounded-xl group-hover:border-indigo-500/30 transition-colors duration-700 z-10 pointer-events-none"
          />

          <!-- Status Accent -->
          <div
            class="absolute top-0 left-0 right-0 h-1.5 transition-all duration-500 z-20"
            :class="{
              'bg-indigo-500 shadow-lg shadow-indigo-500/40':
                c.status === 'pending' || c.status === 'inbox',
              'bg-emerald-500 shadow-lg shadow-emerald-500/40':
                c.status === 'published',
              'bg-orange-500 shadow-lg shadow-orange-500/40':
                c.status === 'suggested',
              'bg-rose-500 shadow-lg shadow-rose-500/40':
                c.status === 'dismissed',
            }"
          />

          <!-- Video Preview -->
          <div class="relative aspect-[16/10] overflow-hidden bg-slate-950">
            <img
              v-if="c.videoThumbnail && !failedThumbnails[c.id]"
              :src="getCleanThumbnailUrl(c.videoId, c.videoThumbnail)"
              :alt="c.videoTitle ?? ''"
              class="w-full h-full object-cover group-hover:scale-105 transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] opacity-60 group-hover:opacity-80 will-change-transform"
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="handleThumbnailError(c.id, c.videoId, $event)"
            />
            <div
              class="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-slate-950 via-slate-900/40 to-transparent"
            />

            <div class="absolute top-3 left-3 sm:top-4 sm:left-4 z-20">
              <UBadge
                :color="statusColor(c.status)"
                variant="solid"
                class="font-black tracking-[0.1em] rounded-full px-1.5 py-0.5 text-[8px] sm:text-[9px] uppercase shadow-2xl"
              >
                {{ $t("status." + c.status) }}
              </UBadge>
            </div>

            <div
              class="absolute bottom-3 left-4 right-4 sm:bottom-4 sm:left-5 sm:right-5"
            >
              <p
                class="text-[10px] font-black text-slate-400 line-clamp-1 uppercase tracking-widest"
              >
                {{ c.videoTitle }}
              </p>
            </div>
          </div>

          <!-- Card Body -->
          <div class="p-3.5 sm:p-5 flex flex-col flex-1 gap-4">
            <div class="flex items-center gap-3">
              <UAvatar
                :src="
                  c.authorProfileImageUrl ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(c.authorName || 'User')}&background=6366f1&color=fff`
                "
                size="sm"
                class="ring-2 ring-slate-900 shrink-0 shadow-xl"
                :img-attributes="{
                  referrerpolicy: 'no-referrer',
                  crossorigin: 'anonymous',
                }"
              />
              <div class="flex flex-col min-w-0">
                <span
                  class="font-black text-sm text-white truncate leading-none"
                  >{{ c.authorName }}</span
                >
                <span
                  class="mt-1.5 text-[10px] text-slate-500 font-black uppercase tracking-widest"
                >
                  {{ isMounted ? timeAgo(c.publishedAt) : "..." }}
                </span>
              </div>
            </div>

            <div
              class="bg-white/5 border border-white/5 rounded-2xl p-4 flex-1 hover:bg-white/[0.08] transition-colors shadow-inner"
            >
              <p
                class="text-[13px] text-slate-300 leading-relaxed line-clamp-2 italic font-medium"
              >
                "<span
                  v-html="c.isLastAuthorOwner ? c.text : c.lastText || c.text"
                ></span
                >"
              </p>
            </div>

            <div class="flex items-center justify-between pt-1">
              <div class="flex items-center gap-2 group/video">
                <div
                  class="w-7 h-7 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center flex-shrink-0 shadow-lg"
                >
                  <UIcon
                    name="i-heroicons-film-solid"
                    class="w-3.5 h-3.5 text-indigo-400 opacity-90"
                  />
                </div>
                <p
                  class="text-[9px] font-black text-slate-500 line-clamp-2 uppercase tracking-widest group-hover/video:text-indigo-300 transition-colors"
                >
                  {{ c.videoTitle }}
                </p>
              </div>
              <div
                class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black text-indigo-400 uppercase tracking-widest group-hover:bg-indigo-500 group-hover:text-white transition-all"
              >
                <span>{{ $t("comments.review") }}</span>
                <UIcon
                  name="i-heroicons-chevron-right"
                  class="w-3 h-3 group-hover:translate-x-1 transition-transform"
                />
              </div>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- Latest Videos -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <div
          class="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.6)]"
        ></div>
        <h2
          class="font-black text-lg text-white tracking-tight uppercase tracking-widest"
        >
          {{ $t("dashboard.latest_videos") }}
        </h2>
      </div>
      <NuxtLink
        to="/videos"
        class="flex items-center gap-2 text-xs font-black text-indigo-400 hover:text-indigo-300 transition-all group uppercase tracking-widest"
      >
        {{ $t("dashboard.view_all_videos") }}
        <UIcon
          name="i-heroicons-arrow-right-solid"
          class="w-4 h-4 group-hover:translate-x-1 transition-transform"
        />
      </NuxtLink>
    </div>

    <div
      v-if="!stats?.recentVideos?.length"
      class="relative overflow-hidden rounded-3xl bg-slate-900/40 border border-white/5 backdrop-blur-xl p-8 sm:p-12 text-center transition-all duration-500 hover:shadow-[0_40px_80px_-15px_rgba(0,0,0,0.7),0_0_30px_rgba(99,102,241,0.06)] group animate-slide-up"
    >
      <div
        class="absolute inset-0 bg-gradient-to-br from-indigo-500/5 via-transparent to-rose-500/5 pointer-events-none"
      />
      <div
        class="relative w-16 h-16 mx-auto mb-4 flex items-center justify-center"
      >
        <div
          class="absolute inset-0 rounded-full bg-indigo-500/10 border border-indigo-500/20 animate-ping scale-110 pointer-events-none opacity-30"
        />
        <div
          class="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-white/10 flex items-center justify-center backdrop-blur-sm shadow-[0_0_20px_rgba(99,102,241,0.15)] group-hover:scale-110 transition-all duration-500"
        >
          <UIcon
            name="i-heroicons-film"
            class="w-6 h-6 text-indigo-400 group-hover:text-indigo-300 transition-colors"
          />
        </div>
      </div>
      <h3
        class="text-lg sm:text-xl font-extrabold text-white mb-1 tracking-tight"
      >
        {{ $t("dashboard.no_videos") }}
      </h3>
      <p class="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
        Comienza sincronizando tus videos de YouTube para verlos aquí.
      </p>
    </div>

    <div v-else class="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <VideoCard
        v-for="(video, idx) in stats.recentVideos"
        :key="video.id"
        :id="video.id"
        :title="video.title"
        :thumbnail-url="video.thumbnailUrl"
        :view-count="video.viewCount"
        :like-count="video.likeCount"
        :comment-count="video.commentCount"
        :published-at="formatDate(video.publishedAt)"
        :manage-link="`/comments?videoId=${video.id}`"
        :style="{ animationDelay: `${idx * 50}ms` }"
      />
    </div>
  </div>
</template>

<style scoped>
.animate-slide-up {
  opacity: 0;
  transform: translateY(20px);
  animation: slideUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

.stagger-1 {
  animation-delay: 0.1s;
}
.stagger-2 {
  animation-delay: 0.2s;
}
.stagger-3 {
  animation-delay: 0.3s;
}
.stagger-4 {
  animation-delay: 0.4s;
}

@keyframes slideUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Row Management */
.dashboard-single-row > *:nth-child(n + 5) {
  display: none;
}
@media (min-width: 768px) {
  .dashboard-single-row > *:nth-child(n + 3) {
    display: none;
  }
}
@media (min-width: 1024px) {
  .dashboard-single-row > *:nth-child(n + 3) {
    display: flex;
  }
  .dashboard-single-row > *:nth-child(n + 4) {
    display: none;
  }
}
@media (min-width: 1536px) {
  .dashboard-single-row > *:nth-child(n + 4) {
    display: flex;
  }
}
</style>
