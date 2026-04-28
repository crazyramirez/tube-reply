<script setup lang="ts">
const props = defineProps<{
  id: string;
  title: string;
  thumbnailUrl?: string | null;
  viewCount?: number | null;
  likeCount?: number | null;
  commentCount?: number | null;
  duration?: string | null;
  publishedAt?: string | null;
  pendingCount?: number | null;
  negativeCount?: number | null;
  questionCount?: number | null;
  manageLink?: string | null;
}>();

const { t } = useI18n();
const { failedThumbnails, getCleanThumbnailUrl, handleThumbnailError } =
  useYouTubeThumbnail();

function isShort(duration: string | null | undefined): boolean {
  if (!duration) return false;
  if (duration.includes("H")) return false;
  const match = duration.match(/PT(\d+)M/);
  if (match) {
    const minutes = parseInt(match[1]);
    if (minutes >= 1) return false;
  }
  return true;
}

const formatNumber = (n: number | null | undefined) => {
  if (n === undefined || n === null) return "0";
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toLocaleString();
};
</script>

<template>
  <div
    class="glass-card group/card relative flex flex-col overflow-hidden h-full animate-slide-up hover:border-indigo-500/30 transition-all duration-500"
  >
    <!-- Thumbnail Container -->
    <a
      :href="`https://youtube.com/watch?v=${id}`"
      target="_blank"
      class="group/thumb relative aspect-video overflow-hidden block bg-slate-900"
    >
      <img
        v-if="thumbnailUrl && !failedThumbnails[id]"
        :src="getCleanThumbnailUrl(id, thumbnailUrl)"
        :alt="title"
        class="w-full h-full object-cover group-hover/thumb:scale-110 transition-transform duration-700"
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="handleThumbnailError(id, id, $event)"
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <UIcon name="i-heroicons-film" class="w-8 h-8 text-slate-700" />
      </div>

      <!-- YouTube Play Overlay -->
      <div
        class="absolute inset-0 bg-black/60 opacity-0 [@media(hover:hover)]:group-hover/thumb:opacity-100 active:opacity-100 transition-all duration-500 flex items-center justify-center z-30 backdrop-blur-[2px]"
      >
        <div
          class="flex items-center gap-2.5 sm:px-6 sm:py-3 sm:rounded-2xl sm:bg-white/10 sm:backdrop-blur-md sm:border sm:border-white/20 text-white sm:shadow-[0_0_40px_rgba(0,0,0,0.5)] transform translate-y-4 group-hover/thumb:translate-y-0 transition-all duration-500 scale-90 group-hover/thumb:scale-100"
        >
          <div class="relative flex items-center justify-center">
            <div
              class="absolute inset-0 bg-red-500/20 blur-lg rounded-full animate-pulse"
            ></div>
            <UIcon
              name="i-heroicons-play-circle-solid"
              class="w-7 h-7 text-red-500 relative z-10"
            />
          </div>
          <span
            class="hidden sm:inline text-[10px] font-black uppercase tracking-[0.2em] drop-shadow-md"
          >
            {{ $t("video_card.watch_on_youtube") }}
          </span>
        </div>
      </div>

      <!-- Shorts Badge -->
      <div
        v-if="isShort(duration)"
        class="absolute top-2 right-2 sm:top-3 sm:right-3 z-20"
      >
        <UBadge
          color="rose"
          variant="solid"
          size="xs"
          class="font-black tracking-tighter rounded-lg px-2 py-0.5 uppercase flex items-center gap-1 shadow-lg"
        >
          <UIcon name="i-heroicons-bolt" class="w-3 h-3" />
          Short
        </UBadge>
      </div>

      <!-- Total Comments Badge (Top Left) -->
      <div
        class="absolute top-2 left-2 px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-indigo-600 text-[11px] sm:text-[13px] font-black text-white backdrop-blur-md border border-white/20 shadow-xl flex items-center gap-1.5 sm:gap-2 z-10"
        title="Total Comments"
      >
        <UIcon
          name="i-heroicons-chat-bubble-left-right"
          class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-200"
        />
        {{ formatNumber(commentCount) }}
      </div>

      <!-- Overlay Stats (Views/Likes) -->
      <div class="absolute bottom-2 left-2 right-2 flex items-center">
        <div class="flex gap-1.5 sm:gap-2">
          <div
            class="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-black/80 text-[11px] sm:text-[13px] font-black text-white backdrop-blur-md border border-white/10 flex items-center gap-1.5 sm:gap-2 shadow-xl"
          >
            <UIcon
              name="i-heroicons-eye"
              class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400"
            />
            {{ formatNumber(viewCount) }}
          </div>
          <div
            v-if="likeCount"
            class="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-black/80 text-[11px] sm:text-[13px] font-black text-white backdrop-blur-md border border-white/10 flex items-center gap-1.5 sm:gap-2 shadow-xl"
          >
            <UIcon
              name="i-heroicons-hand-thumb-up"
              class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400"
            />
            {{ formatNumber(likeCount) }}
          </div>
        </div>
      </div>
    </a>

    <!-- Content Section -->
    <div class="p-3 flex flex-col flex-1">
      <p
        class="text-xs font-black text-slate-200 line-clamp-3 group-hover/card:text-indigo-300 transition-colors mb-3 leading-snug h-12"
      >
        {{ title }}
      </p>

      <div class="mt-auto flex flex-col gap-3">
        <!-- Optional Metadata -->
        <div v-if="publishedAt" class="flex flex-col mb-1">
          <span
            class="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest"
          >
            {{ publishedAt }}
          </span>
        </div>

        <!-- Intent Indicators -->
        <div
          class="flex flex-wrap gap-1.5"
          v-if="
            (pendingCount || 0) > 0 ||
            (negativeCount || 0) > 0 ||
            (questionCount || 0) > 0
          "
        >
          <NuxtLink
            v-if="(pendingCount || 0) > 0"
            :to="`/comments?videoId=${id}&status=pending`"
            class="px-2 py-1 rounded-md bg-amber-400/10 text-[8px] md:text-[10px] font-black text-amber-400 border border-amber-400/20 hover:bg-amber-400/20 transition-colors"
          >
            {{ pendingCount }} {{ $t("analytics.pending_label") }}
          </NuxtLink>
          <NuxtLink
            v-if="(negativeCount || 0) > 0"
            :to="`/comments?videoId=${id}&intent=complaint`"
            class="px-2 py-1 rounded-md bg-red-400/10 text-[8px] md:text-[10px] font-black text-red-400 border border-red-400/20 hover:bg-red-400/20 transition-colors"
          >
            {{ negativeCount }} {{ $t("analytics.complaints_label") }}
          </NuxtLink>
          <NuxtLink
            v-if="(questionCount || 0) > 0"
            :to="`/comments?videoId=${id}&intent=question`"
            class="px-2 py-1 rounded-md bg-blue-400/10 text-[8px] md:text-[10px] font-black text-blue-400 border border-blue-400/20 hover:bg-blue-400/20 transition-colors"
          >
            {{ questionCount }} {{ $t("analytics.questions_label") }}
          </NuxtLink>
        </div>

        <!-- Manage Button -->
        <NuxtLink
          v-if="manageLink"
          :to="manageLink"
          class="w-full py-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-[9px] md:text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center hover:bg-white/[0.06] hover:text-indigo-400 hover:border-indigo-500/20 transition-all flex items-center justify-center gap-2"
        >
          <UIcon
            name="i-heroicons-chat-bubble-left-right"
            class="w-3.5 h-3.5"
          />
          {{ $t("analytics.manage_comments") }}
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
