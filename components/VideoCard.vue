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
    class="video-card-premium group relative flex flex-col h-full rounded-xl overflow-hidden bg-slate-900/40 border border-white/5 backdrop-blur-xl transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8),0_0_20px_rgba(99,102,241,0.08)] animate-slide-up"
  >
    <!-- Premium Border Glow -->
    <div
      class="absolute inset-0 border border-white/10 rounded-xl group-hover:border-indigo-500/30 transition-colors duration-700 z-10 pointer-events-none"
    />

    <!-- Status Accent Glow (Dynamic for Video) -->
    <div
      class="absolute top-0 left-0 right-0 h-1.5 bg-indigo-500 shadow-[0_4px_15px_rgba(99,102,241,0.5)] transition-all duration-500 z-20"
    />

    <!-- Thumbnail Container -->
    <a
      v-if="manageLink"
      :href="`https://www.youtube.com/watch?v=${id}`"
      target="_blank"
      rel="noopener noreferrer"
      class="group/thumb relative aspect-[16/10] overflow-hidden block bg-slate-950"
    >
      <img
        v-if="thumbnailUrl && !failedThumbnails[id]"
        :src="getCleanThumbnailUrl(id, thumbnailUrl)"
        :alt="title"
        class="w-full h-full object-cover group-hover/thumb:scale-105 transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] opacity-70 group-hover/thumb:opacity-100 will-change-transform"
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="handleThumbnailError(id, id, $event)"
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <UIcon name="i-heroicons-film" class="w-10 h-10 text-slate-800" />
      </div>

      <!-- Play Button Overlay (Premium) -->
      <div class="absolute inset-0 flex items-center justify-center z-30">
        <div
          class="absolute inset-0 bg-indigo-950/0 backdrop-blur-0 group-hover/thumb:bg-indigo-950/40 group-hover/thumb:backdrop-blur-[4px] transition-all duration-700 ease-out will-change-[backdrop-filter]"
        ></div>
        <div
          class="relative w-16 h-16 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center transform scale-50 opacity-0 group-hover/thumb:scale-100 group-hover/thumb:opacity-100 transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] shadow-2xl"
        >
          <div
            class="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping opacity-50"
          ></div>
          <UIcon
            name="i-heroicons-play-solid"
            class="w-8 h-8 text-white ml-0.5"
          />
        </div>
      </div>

      <!-- Floating Badges -->
      <div
        class="absolute top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4 flex justify-between items-start z-20"
      >
        <div
          class="px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl flex items-center gap-1 sm:gap-1.5"
        >
          <UIcon
            name="i-heroicons-chat-bubble-bottom-center-text-solid"
            class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-400"
          />
          <span class="text-[9px] font-black text-white tracking-widest">{{
            formatNumber(commentCount)
          }}</span>
        </div>

        <div
          v-if="isShort(duration)"
          class="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-red-500 shadow-2xl border border-white/10 flex items-center justify-center"
          title="Short Video"
        >
          <UIcon
            name="i-heroicons-bolt-solid"
            class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white"
          />
        </div>
      </div>

      <!-- Gradient Overlay for Readability (Smaller) -->
      <div
        class="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-slate-950 via-slate-900/40 to-transparent"
      />

      <!-- Bottom Stats Overlay -->
      <div
        class="absolute bottom-3 left-4 right-4 sm:bottom-4 sm:left-5 sm:right-5 flex gap-2 sm:gap-3 z-20"
      >
        <div
          class="px-1.5 py-0.5 rounded-full bg-black/40 text-[8px] sm:text-[9px] font-black text-white backdrop-blur-md border border-white/5 flex items-center gap-1.5"
        >
          <UIcon name="i-heroicons-eye-solid" class="w-3 h-3 text-slate-400" />
          {{ formatNumber(viewCount) }}
        </div>
        <div
          v-if="likeCount"
          class="px-1.5 py-0.5 rounded-full bg-black/40 text-[8px] sm:text-[9px] font-black text-white backdrop-blur-md border border-white/5 flex items-center gap-1.5"
        >
          <UIcon
            name="i-heroicons-hand-thumb-up-solid"
            class="w-3 h-3 text-indigo-400"
          />
          {{ formatNumber(likeCount) }}
        </div>
      </div>
    </a>
    <div
      v-else
      class="group/thumb relative aspect-[16/10] overflow-hidden block bg-slate-950"
    >
      <!-- Duplicate content or use a slot/component if this was more complex -->
      <img
        v-if="thumbnailUrl && !failedThumbnails[id]"
        :src="getCleanThumbnailUrl(id, thumbnailUrl)"
        :alt="title"
        class="w-full h-full object-cover group-hover/thumb:scale-110 group-hover/thumb:rotate-1 transition-all duration-1000 ease-out opacity-70 group-hover/thumb:opacity-100"
        loading="lazy"
        referrerpolicy="no-referrer"
        @error="handleThumbnailError(id, id, $event)"
      />
      <div v-else class="w-full h-full flex items-center justify-center">
        <UIcon name="i-heroicons-film" class="w-10 h-10 text-slate-800" />
      </div>
    </div>

    <!-- Content Section -->
    <div
      class="p-4 sm:p-6 pb-0 flex flex-col flex-1 gap-4 group/content relative"
    >
      <!-- Full Area Link Overlay -->
      <NuxtLink
        v-if="manageLink"
        :to="manageLink"
        class="absolute inset-0 z-10"
        aria-hidden="true"
      />

      <div class="flex flex-col gap-4 relative z-20 pointer-events-none">
        <h3
          class="text-[12px] sm:text-[15px] font-black text-white line-clamp-3 sm:line-clamp-2 leading-tight group-hover/content:text-indigo-300 transition-colors tracking-tight"
          :title="title"
        >
          {{ title }}
        </h3>

        <!-- Date -->
        <div
          v-if="publishedAt"
          class="flex items-center gap-1.5 sm:gap-2.5 text-slate-500"
        >
          <UIcon
            name="i-heroicons-calendar-days-solid"
            class="w-3 h-3 sm:w-4 sm:h-4 opacity-40"
          />
          <span
            class="text-[8px] sm:text-[10px] font-black uppercase tracking-[0.2em]"
          >
            {{ publishedAt }}
          </span>
        </div>
      </div>

      <div class="mt-auto relative z-20">
        <!-- Intent Indicators -->
        <div
          class="flex flex-wrap gap-2 mb-2"
          v-if="
            (pendingCount || 0) > 0 ||
            (negativeCount || 0) > 0 ||
            (questionCount || 0) > 0
          "
        >
          <NuxtLink
            v-if="(pendingCount || 0) > 0"
            :to="`/comments?videoId=${id}&status=pending`"
            class="px-3 py-1.5 rounded-xl bg-amber-400/5 text-[10px] font-black text-amber-400 border border-amber-400/10 hover:bg-amber-400/10 transition-all uppercase tracking-wider"
          >
            {{ pendingCount }} {{ $t("analytics.pending_label") }}
          </NuxtLink>
          <NuxtLink
            v-if="(negativeCount || 0) > 0"
            :to="`/comments?videoId=${id}&intent=complaint`"
            class="px-3 py-1.5 rounded-xl bg-red-400/5 text-[10px] font-black text-red-400 border border-red-400/10 hover:bg-red-400/10 transition-all uppercase tracking-wider"
          >
            {{ negativeCount }} {{ $t("analytics.complaints_label") }}
          </NuxtLink>
          <NuxtLink
            v-if="(questionCount || 0) > 0"
            :to="`/comments?videoId=${id}&intent=question`"
            class="px-3 py-1.5 rounded-xl bg-blue-400/5 text-[10px] font-black text-blue-400 border border-blue-400/10 hover:bg-blue-400/10 transition-all uppercase tracking-wider"
          >
            {{ questionCount }} {{ $t("analytics.questions_label") }}
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Integrated Action Bar (Premium Footer) -->
    <NuxtLink
      v-if="manageLink"
      :to="manageLink"
      class="flex items-center justify-center gap-3 w-full py-3 bg-white/[0.01] border-t border-white/[0.05] text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] transition-all duration-300 hover:bg-indigo-500/10 hover:text-indigo-400 group/footer"
    >
      <UIcon
        name="i-heroicons-chat-bubble-bottom-center-text"
        class="w-3.5 h-3.5 opacity-30 group-hover/footer:opacity-100 transition-opacity"
      />
      {{ $t("analytics.manage_comments") }}
    </NuxtLink>
  </div>
</template>

<style scoped>
.animate-slide-up {
  opacity: 0;
  transform: translateY(20px);
  animation: slideUp 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes slideUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
