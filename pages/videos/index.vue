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
  setTimeout(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 100);
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
  setTimeout(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 100);
});

function formatDate(iso: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

const typeTabs = [
  { label: "videos.all", value: "all", icon: "i-heroicons-squares-2x2" },
  { label: "videos.video", value: "video", icon: "i-heroicons-video-camera" },
  { label: "videos.short", value: "short", icon: "i-heroicons-bolt" },
];

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
    <div class="mb-10">
      <div
        class="flex items-center gap-2 text-[10px] font-black text-indigo-400 uppercase tracking-[0.4em] mb-1.5"
      >
        <UIcon name="i-heroicons-video-camera-solid" class="w-4 h-4" />
        {{ brand?.name || "Content Library" }}
      </div>
      <h1
        class="text-3xl sm:text-5xl font-black text-white tracking-tighter flex items-center gap-4"
      >
        {{ $t("videos.title") }}
        <UIcon
          v-if="pending"
          name="i-heroicons-arrow-path"
          class="w-7 h-7 text-indigo-500/50 animate-spin"
        />
      </h1>
      <p
        class="text-slate-500 text-sm sm:text-base mt-2 max-w-xl font-medium leading-relaxed italic"
      >
        {{ $t("videos.subtitle") }}
      </p>
    </div>

    <!-- Toolbar: Search + Filters -->
    <div class="flex flex-col lg:flex-row lg:items-center gap-6 mb-6">
      <!-- Search Bar -->
      <div class="relative group flex-1">
        <div
          class="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none"
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
          class="w-full pl-12 pr-12 py-4 bg-white/[0.03] border border-white/[0.08] rounded-xl text-md text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] focus:ring-4 focus:ring-indigo-500/10 transition-all duration-500 shadow-inner"
        />
        <button
          v-if="searchInput"
          @click="clearSearch"
          class="absolute inset-y-0 right-0 pr-5 flex items-center"
        >
          <div
            class="p-2 rounded-xl hover:bg-white/10 transition-colors group/clear"
          >
            <UIcon
              name="i-heroicons-x-mark"
              class="w-4 h-4 text-slate-500 group-hover/clear:text-white transition-colors"
            />
          </div>
        </button>
      </div>

      <!-- Filters -->
      <div
        class="flex items-center gap-1.5 p-1.5 bg-white/[0.03] border border-white/[0.08] rounded-xl w-full lg:w-auto flex-shrink-0 overflow-hidden shadow-inner backdrop-blur-xl"
      >
        <button
          v-for="tab in typeTabs"
          :key="tab.value"
          @click="setType(tab.value)"
          class="flex-1 lg:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-[10px] sm:text-[11px] font-black transition-all duration-500 whitespace-nowrap uppercase tracking-widest"
          :class="
            type === tab.value
              ? 'bg-indigo-500 text-white shadow-[0_10px_20px_rgba(99,102,241,0.4)] border border-indigo-400'
              : 'text-slate-500 hover:text-slate-200 hover:bg-white/5 border border-transparent'
          "
        >
          <UIcon :name="tab.icon" class="w-4 h-4" />
          {{ $t(tab.label) }}
        </button>

        <!-- Mobile Column Switcher -->
        <div class="lg:hidden w-px h-5 bg-white/10 mx-1" />
        <div class="lg:hidden flex items-center gap-1 px-1">
          <button
            class="flex items-center justify-center p-2.5 rounded-lg transition-all duration-300"
            :class="
              mobileColumns === 1
                ? 'text-indigo-400 bg-white/5 shadow-inner'
                : 'text-slate-600'
            "
            @click="mobileColumns = 1"
          >
            <UIcon name="i-heroicons-stop-solid" class="w-5 h-5" />
          </button>
          <button
            class="flex items-center justify-center p-2.5 rounded-lg transition-all duration-300"
            :class="
              mobileColumns === 2
                ? 'text-indigo-400 bg-white/5 shadow-inner'
                : 'text-slate-600'
            "
            @click="mobileColumns = 2"
          >
            <UIcon name="i-heroicons-squares-2x2-solid" class="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Grid Loading -->
    <div
      v-if="pending && !data?.items?.length"
      class="grid gap-6"
      :class="[
        mobileColumns === 1 ? 'grid-cols-1' : 'grid-cols-2',
        'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
      ]"
    >
      <div
        v-for="i in 8"
        :key="i"
        class="aspect-[16/10] rounded-xl bg-white/[0.03] border border-white/[0.06] animate-pulse"
      />
    </div>

    <div
      v-else-if="!data?.items?.length"
      class="py-32 flex flex-col items-center justify-center text-center bg-white/[0.02] border border-white/[0.08] border-dashed rounded-2xl shadow-inner"
    >
      <div
        class="w-24 h-24 rounded-full bg-white/5 flex items-center justify-center mb-6 border border-white/10 shadow-2xl"
      >
        <UIcon
          name="i-heroicons-video-camera-slash-solid"
          class="w-12 h-12 text-slate-800"
        />
      </div>
      <p class="text-slate-400 text-xl font-black uppercase tracking-widest">
        {{ $t("videos.no_videos") }}
      </p>
      <button
        @click="
          clearSearch();
          setType('all');
        "
        class="mt-6 px-8 py-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-black text-xs uppercase tracking-widest hover:bg-indigo-500 hover:text-white hover:border-indigo-400 transition-all shadow-xl"
      >
        {{ $t("comments.search_clear") }}
      </button>
    </div>

    <div
      v-if="!pending && data?.items?.length"
      class="grid gap-3 sm:gap-4"
      :class="[
        mobileColumns === 1 ? 'grid-cols-1' : 'grid-cols-2',
        'sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
      ]"
    >
      <VideoCard
        v-for="(video, idx) in data.items"
        :key="video.id"
        :id="video.id"
        :title="video.title"
        :thumbnail-url="video.thumbnailUrl"
        :view-count="video.viewCount"
        :like-count="video.likeCount"
        :comment-count="video.commentCount"
        :duration="video.duration"
        :published-at="formatDate(video.publishedAt)"
        :manage-link="`/comments?videoId=${video.id}${search ? '&search=' + encodeURIComponent(search) : ''}`"
        :style="{ animationDelay: `${idx * 50}ms` }"
      />
    </div>

    <!-- Pagination -->
    <div
      v-if="data && data.pagination.pages > 1"
      class="flex justify-center mt-8 mb-8"
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
  animation: fadeIn 0.8s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
