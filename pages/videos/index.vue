<script setup lang="ts">
import type { Video, PaginatedResponse } from "~/shared/types";

definePageMeta({ middleware: "auth", keepalive: true });

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

const { data: brand } = await useFetch<{
  logoUrl: string;
  name: string | null;
}>("/api/public/brand");

const lastType = useCookie<string>("video-last-type", {
  default: () => "all",
});

const searchInput = ref((route.query.search as string) || "");
const search = ref(searchInput.value);
const type = ref((route.query.type as string) || lastType.value);
const page = ref(Number(route.query.page || 1));
const mobileColumns = useCookie<number>("video-mobile-columns", {
  default: () => 2,
});

watch(type, (newVal) => {
  lastType.value = newVal;
});

function setPage(p: number) {
  page.value = p;
  router.replace({ query: { ...route.query, page: p } });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Debounce search
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchInput, (val) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    search.value = val.trim();
    router.replace({
      query: { ...route.query, search: val.trim() || undefined },
    });
  }, 350);
});

function setType(t: string) {
  type.value = t;
  router.replace({
    query: { ...route.query, type: t === "all" ? undefined : t },
  });
}

function clearSearch() {
  searchInput.value = "";
  search.value = "";
  router.replace({ query: { ...route.query, search: undefined } });
}

const { data, pending, refresh } = useFetch<PaginatedResponse<Video>>(
  "/api/videos",
  {
    query: computed(() => ({
      search: search.value || undefined,
      type: type.value,
      page: page.value,
      limit: 12,
    })),
  },
);

watch([search, type], () => {
  page.value = 1;
  window.scrollTo({ top: 0, behavior: "smooth" });
});

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("time.just_now");
  if (mins < 60) return t("time.minutes_ago", { m: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("time.hours_ago", { h: hrs });
  return t("time.days_ago", { d: Math.floor(hrs / 24) });
}

const typeTabs = [
  { label: "videos.all", value: "all", icon: "i-heroicons-squares-2x2" },
  { label: "videos.video", value: "video", icon: "i-heroicons-video-camera" },
  { label: "videos.short", value: "short", icon: "i-heroicons-bolt" },
];

const formatNumber = (n: number) => {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
};

function isShort(duration: string | null): boolean {
  if (!duration) return false;
  if (duration.includes("H")) return false;
  const match = duration.match(/PT(\d+)M/);
  if (match) {
    const minutes = parseInt(match[1]);
    if (minutes >= 1) return false;
  }
  return true;
}

const { failedThumbnails, getCleanThumbnailUrl, handleThumbnailError } =
  useYouTubeThumbnail();

const savedScrollPos = ref(0);

onBeforeRouteLeave((to, from) => {
  savedScrollPos.value = window.scrollY;
});

onActivated(() => {
  refresh();
  if (savedScrollPos.value > 0) {
    // Forzamos una altura mínima temporal para evitar que el navegador resetee el scroll a 0
    const originalMinHeight = document.documentElement.style.minHeight;
    document.documentElement.style.minHeight = "5000px";

    setTimeout(() => {
      window.scrollTo({ top: savedScrollPos.value, behavior: "instant" });
      document.documentElement.style.minHeight = originalMinHeight;
    }, 100);
  }
});
</script>

<template>
  <div class="animate-fade-in">
    <!-- Header -->
    <div class="mb-8">
      <div
        class="flex items-center gap-2 text-[10px] font-bold text-indigo-400 uppercase tracking-[0.3em] mb-1"
      >
        <UIcon name="i-heroicons-video-camera" class="w-3.5 h-3.5" />
        {{ brand?.name || "Content Library" }}
      </div>
      <h1
        class="text-3xl sm:text-4xl font-black text-white tracking-tighter flex items-center gap-3"
      >
        {{ $t("videos.title") }}
        <UIcon
          v-if="pending"
          name="i-heroicons-arrow-path"
          class="w-6 h-6 text-indigo-500/50 animate-spin"
        />
      </h1>
      <p class="text-slate-500 text-sm mt-1 max-w-md">
        {{ $t("videos.subtitle") }}
      </p>
    </div>

    <!-- Toolbar: Search + Filters -->
    <div class="flex flex-col lg:flex-row lg:items-center gap-4 mb-10">
      <!-- Search Bar -->
      <div class="relative group flex-1">
        <div
          class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"
        >
          <UIcon
            name="i-heroicons-magnifying-glass"
            class="w-5 h-5 transition-colors"
            :class="searchInput ? 'text-indigo-400' : 'text-slate-600'"
          />
        </div>
        <input
          v-model="searchInput"
          type="search"
          :placeholder="$t('videos.search_placeholder')"
          class="w-full pl-12 pr-12 py-2.5 bg-white/[0.03] border border-white/[0.07] rounded-2xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] focus:ring-4 focus:ring-indigo-500/10 transition-all duration-300"
        />
        <button
          v-if="searchInput"
          @click="clearSearch"
          class="absolute inset-y-0 right-0 pr-4 flex items-center"
        >
          <div class="p-1.5 rounded-xl hover:bg-white/10 transition-colors">
            <UIcon name="i-heroicons-x-mark" class="w-4 h-4 text-slate-500" />
          </div>
        </button>
      </div>

      <!-- Filters -->
      <div
        class="flex items-center gap-0.5 p-1 bg-white/[0.03] border border-white/[0.07] rounded-2xl w-full lg:w-auto flex-shrink-0 overflow-hidden"
      >
        <button
          v-for="tab in typeTabs"
          :key="tab.value"
          @click="setType(tab.value)"
          class="flex-1 lg:flex-none flex items-center justify-center gap-1 px-1.5 sm:px-4 lg:px-6 py-1.5 sm:py-2.5 rounded-xl text-[10px] sm:text-xs font-bold transition-all duration-300 whitespace-nowrap"
          :class="
            type === tab.value
              ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
              : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
          "
        >
          <UIcon :name="tab.icon" class="hidden sm:inline-block w-4 h-4" />
          {{ $t(tab.label) }}
        </button>

        <!-- Mobile Column Switcher (Visible only on mobile) -->
        <div class="lg:hidden w-[1px] h-4 bg-white/10 mx-0.5" />
        <button
          class="lg:hidden flex items-center justify-center p-1.5 px-3 aspect-square rounded-lg transition-all duration-300"
          :class="
            mobileColumns === 1
              ? 'text-indigo-400 bg-white/5'
              : 'text-slate-500'
          "
          @click="mobileColumns = 1"
        >
          <UIcon name="i-heroicons-stop" class="w-4 h-4" />
        </button>
        <button
          class="lg:hidden flex items-center justify-center p-1.5 px-3 aspect-square rounded-lg transition-all duration-300"
          :class="
            mobileColumns === 2
              ? 'text-indigo-400 bg-white/5'
              : 'text-slate-500'
          "
          @click="mobileColumns = 2"
        >
          <UIcon name="i-heroicons-squares-2x2" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Grid Loading -->
    <div
      v-if="pending && !data?.items?.length"
      class="grid gap-4 sm:gap-6"
      :class="[
        mobileColumns === 1 ? 'grid-cols-1' : 'grid-cols-2',
        'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
      ]"
    >
      <div
        v-for="i in 8"
        :key="i"
        class="aspect-[16/10] rounded-3xl bg-white/[0.03] border border-white/[0.06] animate-pulse"
      />
    </div>

    <div
      v-else-if="!data?.items?.length"
      class="py-20 flex flex-col items-center justify-center text-center"
    >
      <div
        class="w-20 h-20 rounded-full bg-slate-900 flex items-center justify-center mb-4 border border-white/5"
      >
        <UIcon
          name="i-heroicons-video-camera-slash"
          class="w-10 h-10 text-slate-700"
        />
      </div>
      <p class="text-slate-500 text-lg font-medium">
        {{ $t("videos.no_videos") }}
      </p>
      <button
        @click="
          clearSearch();
          setType('all');
        "
        class="mt-4 text-indigo-400 font-bold text-sm hover:underline"
      >
        {{ $t("comments.search_clear") }}
      </button>
    </div>

    <div
      v-else
      class="grid gap-4 sm:gap-3"
      :class="[
        mobileColumns === 1 ? 'grid-cols-1' : 'grid-cols-2',
        'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
      ]"
    >
      <NuxtLink
        v-for="(video, idx) in data.items"
        :key="video.id"
        :to="`/comments?videoId=${video.id}${search ? '&search=' + encodeURIComponent(search) : ''}`"
        class="group glass-card overflow-hidden flex flex-col h-full animate-slide-up hover:border-indigo-500/30 transition-all duration-500"
        :style="{ animationDelay: `${idx * 50}ms` }"
      >
        <!-- Thumbnail -->
        <div class="relative aspect-video bg-slate-900 overflow-hidden">
          <img
            v-if="video.thumbnailUrl && !failedThumbnails[video.id]"
            :src="getCleanThumbnailUrl(video.id, video.thumbnailUrl)"
            :alt="video.title"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
            loading="lazy"
            referrerpolicy="no-referrer"
            @error="handleThumbnailError(video.id, video.id, $event)"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <UIcon
              name="i-heroicons-video-camera"
              class="text-slate-800 w-12 h-12"
            />
          </div>

          <!-- Badges -->
          <div class="absolute top-3 left-3 flex gap-2">
            <UBadge
              v-if="isShort(video.duration)"
              color="rose"
              variant="solid"
              size="xs"
              class="font-black tracking-tighter rounded-lg px-2 py-0.5 uppercase flex items-center gap-1 shadow-lg"
            >
              <UIcon name="i-heroicons-bolt" class="w-3 h-3" />
              Short
            </UBadge>
          </div>

          <!-- Overlay stats -->
          <div
            class="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4"
          >
            <div class="flex items-center gap-4 text-white text-xs font-bold">
              <span class="flex items-center gap-1.5">
                <UIcon name="i-heroicons-eye" class="w-4 h-4 text-indigo-400" />
                {{ formatNumber(video.viewCount || 0) }}
              </span>
              <span class="flex items-center gap-1.5">
                <UIcon
                  name="i-heroicons-chat-bubble-left-right"
                  class="w-4 h-4 text-emerald-400"
                />
                {{ formatNumber(video.commentCount || 0) }}
              </span>
            </div>
          </div>
        </div>

        <!-- Content -->
        <div class="p-5 flex flex-col flex-1">
          <h3
            class="text-white font-bold text-sm leading-snug line-clamp-2 group-hover:text-indigo-300 transition-colors mb-3"
          >
            {{ video.title }}
          </h3>

          <div
            class="mt-auto pt-4 border-t border-white/5 flex items-center justify-between"
          >
            <div class="flex flex-col">
              <span
                class="text-[10px] font-bold text-slate-500 uppercase tracking-widest"
                >{{ timeAgo(video.publishedAt) }}</span
              >
              <span class="text-[11px] text-slate-400 font-medium">
                {{
                  $t("videos.stats", {
                    views: formatNumber(video.viewCount || 0),
                    comments: formatNumber(video.commentCount || 0),
                  })
                }}
              </span>
            </div>

            <div
              class="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-all duration-300"
            >
              <UIcon name="i-heroicons-arrow-right" class="w-4 h-4" />
            </div>
          </div>
        </div>
      </NuxtLink>
    </div>

    <!-- Pagination -->
    <div
      v-if="data && data.pagination.pages > 1"
      class="flex justify-center mt-12 mb-4"
    >
      <UPagination
        :model-value="page"
        :total="data.pagination.total"
        :page-count="data.pagination.limit"
        size="lg"
        @update:model-value="setPage"
      />
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.6s ease-out forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.animate-slide-up {
  opacity: 0;
  transform: translateY(20px);
  animation: slideUp 0.5s ease-out forwards;
}

@keyframes slideUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
