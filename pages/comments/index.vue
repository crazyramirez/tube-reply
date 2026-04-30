<script setup lang="ts">
import type { PaginatedResponse, CommentListItem } from "~/shared/types";
import { renderCommentHtml } from "~/composables/useCommentHtml";

definePageMeta({ middleware: "auth", keepalive: true });

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { t } = useI18n();

const lastStatus = useCookie<string>("comment-last-status", {
  default: () => "inbox",
});

const status = ref(
  (route.query.status as string) ||
    (route.query.videoId || route.query.intent ? "all" : lastStatus.value),
);
const page = ref(Number(route.query.page || 1));
const videoId = ref((route.query.videoId as string) || "");
const authorId = ref((route.query.authorId as string) || "");
const intent = ref((route.query.intent as string) || "");
const searchInput = ref((route.query.search as string) || "");
const search = ref(searchInput.value);

// Sync query params back to refs (important for keepalive)
watch(
  () => route.query,
  (newQuery) => {
    videoId.value = (newQuery.videoId as string) || "";
    authorId.value = (newQuery.authorId as string) || "";
    intent.value = (newQuery.intent as string) || "";
    if (newQuery.search !== undefined && newQuery.search !== search.value) {
      searchInput.value = (newQuery.search as string) || "";
      search.value = searchInput.value;
    } else if (newQuery.search === undefined) {
      searchInput.value = "";
      search.value = "";
    }
    page.value = Number(newQuery.page || 1);
    if (newQuery.status) {
      status.value = newQuery.status as string;
    } else if (newQuery.videoId || newQuery.intent) {
      status.value = "all";
    }
  },
  { deep: true },
);

watch(status, (newVal) => {
  lastStatus.value = newVal;
});

// Debounce the search so we only fire the API after the user stops typing
let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
watch(searchInput, (val) => {
  if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    search.value = val.trim();
    page.value = 1;
    router.replace({
      query: { ...route.query, search: val.trim() || undefined, page: 1 },
    });
  }, 350);
});

function clearSearch() {
  searchInput.value = "";
  search.value = "";
  router.replace({ query: { ...route.query, search: undefined, page: 1 } });
}

useHead({
  meta: [{ name: "referrer", content: "no-referrer" }],
});

const { data, refresh, pending } = useFetch<PaginatedResponse<CommentListItem>>(
  "/api/comments",
  {
    lazy: true,
    query: computed(() => ({
      status: status.value,
      page: page.value,
      limit: 12,
      videoId: videoId.value,
      authorId: authorId.value,
      intent: intent.value,
      search: search.value || undefined,
    })),
  },
);

function setStatus(s: string) {
  status.value = s;
  page.value = 1;
  router.replace({
    query: {
      ...route.query,
      status: s,
      page: 1,
    },
  });
}

function setPage(p: number) {
  page.value = p;
  router.replace({ query: { ...route.query, page: p } });
  setTimeout(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 100);
}

async function undismiss(commentId: string) {
  await $fetch(`/api/comments/${commentId}/undismiss`, {
    method: "POST",
    headers: useCsrfHeaders(),
  });
  toast.add({ title: t("comments.restored"), color: "green" });
  await refresh();
}

const langFlag: Record<string, string> = {
  es: "🇪🇸",
  en: "🇬🇧",
  pt: "🇧🇷",
  fr: "🇫🇷",
  de: "🇩🇪",
  it: "🇮🇹",
  ja: "🇯🇵",
  zh: "🇨🇳",
  ar: "🇸🇦",
  ko: "🇰🇷",
  ru: "🇷🇺",
  nl: "🇳🇱",
  pl: "🇵🇱",
  tr: "🇹🇷",
  sv: "🇸🇪",
  no: "🇳🇴",
  da: "🇩🇰",
  fi: "🇫🇮",
  ca: "🇨🇦",
  cs: "🇨🇿",
};

const languageNames: Record<string, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
  it: "Italian",
  nl: "Dutch",
  pl: "Polish",
  ru: "Russian",
  ja: "Japanese",
  zh: "Chinese",
  ar: "Arabic",
  ko: "Korean",
  tr: "Turkish",
  sv: "Swedish",
  no: "Norwegian",
  da: "Danish",
  fi: "Finnish",
  ca: "Catalan",
  cs: "Czech",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("time.just_now");
  if (mins < 60) return t("time.minutes_ago", { m: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("time.hours_ago", { h: hrs });
  return t("time.days_ago", { d: Math.floor(hrs / 24) });
}

const statusColor = (s: string) => {
  switch (s) {
    case "published":
      return "green";
    case "suggested":
      return "orange";
    case "dismissed":
      return "red";
    case "skipped":
      return "blue";
    case "pending":
    default:
      return "yellow";
  }
};

function parseOpportunityFlags(flags: string | string[] | null): string[] {
  if (!flags) return [];
  if (Array.isArray(flags)) return flags;
  try {
    return JSON.parse(flags);
  } catch {
    return [];
  }
}

const viewMode = useCookie<"grid" | "list">("comment-view-mode", {
  default: () => "grid",
});

const mobileColumns = useCookie<number>("comment-mobile-columns", {
  default: () => 2,
});

const statusTabs = computed(() => [
  { label: t("status.all"), value: "all", icon: "i-heroicons-list-bullet" },
  { label: t("status.inbox"), value: "inbox", icon: "i-heroicons-inbox" },

  {
    label: t("status.published"),
    value: "published",
    icon: "i-heroicons-check-circle",
  },
  {
    label: t("status.dismissed"),
    value: "dismissed",
    icon: "i-heroicons-trash",
  },
]);

// --- Bulk Actions ---
const selectedIds = ref<string[]>([]);

const isAllSelected = computed(() => {
  if (!data.value?.items?.length) return false;
  return data.value.items.every((item) => selectedIds.value.includes(item.id));
});

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedIds.value = [];
  } else {
    selectedIds.value = data.value?.items?.map((item) => item.id) || [];
  }
}

function toggleSelection(id: string) {
  const idx = selectedIds.value.indexOf(id);
  if (idx === -1) {
    selectedIds.value.push(id);
  } else {
    selectedIds.value.splice(idx, 1);
  }
}

watch([status, page, search, authorId, videoId], () => {
  selectedIds.value = [];
});

async function bulkStatusUpdate(newStatus: string) {
  if (!selectedIds.value.length) return;

  try {
    await $fetch("/api/comments/bulk-status", {
      method: "POST",
      body: { ids: selectedIds.value, status: newStatus },
      headers: useCsrfHeaders(),
    });

    toast.add({
      title: t("comments.bulk_success"),
      description: t("comments.bulk_moved", {
        n: selectedIds.value.length,
        status: newStatus,
      }),
      color: "green",
    });

    selectedIds.value = [];
    await refresh();
  } catch (err) {
    toast.add({
      title: t("comments.bulk_failed"),
      description: (err as any).message,
      color: "red",
    });
  }
}

const savedScrollPos = ref(0);

onBeforeRouteLeave((to, from) => {
  savedScrollPos.value = window.scrollY;
});

onActivated(() => {
  refresh();
  if (window.innerWidth < 1024 && viewMode.value === "list") {
    viewMode.value = "grid";
  }
  if (savedScrollPos.value > 0) {
    // Forzamos una altura mínima temporal para evitar que el navegador resetee el scroll a 0
    // si el contenido aún no se ha renderizado completamente o la página ha encogido.
    const originalMinHeight = document.documentElement.style.minHeight;
    document.documentElement.style.minHeight = "5000px";

    setTimeout(() => {
      window.scrollTo({ top: savedScrollPos.value, behavior: "instant" });
      document.documentElement.style.minHeight = originalMinHeight;
    }, 100);
  }
});

const { failedThumbnails, getCleanThumbnailUrl, handleThumbnailError } =
  useYouTubeThumbnail();

const { justAutoSuggestCompleted } = useSyncStatus();
watch(justAutoSuggestCompleted, (done) => {
  if (done) refresh();
});

// Solo hacer scroll al principio si cambian REALMENTE los filtros
watch([status, search, videoId, authorId, intent], (newVals, oldVals) => {
  const hasOldValues = oldVals.some((v) => v !== undefined);
  const hasChanged = newVals.some((v, i) => v !== oldVals[i]);

  if (hasOldValues && hasChanged) {
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }, 100);
  }
});
</script>

<template>
  <div>
    <div
      class="flex items-start sm:items-end justify-between mb-6 sm:mb-8 gap-4"
    >
      <div>
        <div
          class="flex items-center gap-2 text-[10px] font-bold text-indigo-400 uppercase tracking-[0.3em] mb-1"
        >
          <UIcon
            name="i-heroicons-chat-bubble-bottom-center-text"
            class="w-3.5 h-3.5"
          />
          {{ $t("comments.hub_label") }}
        </div>
        <h1
          class="text-2xl sm:text-3xl font-black text-white tracking-tighter flex items-center gap-3"
        >
          {{ $t("comments.title") }}
          <UIcon
            v-if="pending && data?.items?.length"
            name="i-heroicons-arrow-path"
            class="w-5 h-5 text-indigo-500/50 animate-spin"
          />
        </h1>
      </div>

      <!-- View switcher -->
      <div
        class="flex items-center gap-1 p-1 bg-white/[0.03] border border-white/[0.07] rounded-xl"
      >
        <!-- Desktop: List view -->
        <button
          class="hidden lg:flex p-2 rounded-lg transition-all duration-200 cursor-pointer"
          :class="
            viewMode === 'list'
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          "
          @click="viewMode = 'list'"
          :title="$t('comments.list_view')"
        >
          <UIcon name="i-heroicons-bars-3" class="w-5 h-5" />
        </button>
        <!-- Desktop: Grid view -->
        <button
          class="hidden lg:flex p-2 rounded-lg transition-all duration-200 cursor-pointer"
          :class="
            viewMode === 'grid'
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          "
          @click="viewMode = 'grid'"
          :title="$t('comments.grid_view')"
        >
          <UIcon name="i-heroicons-squares-2x2" class="w-5 h-5" />
        </button>

        <!-- Mobile: Column switcher -->
        <button
          class="lg:hidden flex p-2 rounded-lg transition-all duration-200 cursor-pointer"
          :class="
            mobileColumns === 1
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          "
          @click="
            mobileColumns = 1;
            viewMode = 'grid';
          "
        >
          <UIcon name="i-heroicons-stop" class="w-5 h-5" />
        </button>
        <button
          class="lg:hidden flex p-2 rounded-lg transition-all duration-200 cursor-pointer"
          :class="
            mobileColumns === 2
              ? 'bg-white/10 text-white shadow-sm'
              : 'text-slate-500 hover:text-slate-300'
          "
          @click="
            mobileColumns = 2;
            viewMode = 'grid';
          "
        >
          <UIcon name="i-heroicons-squares-2x2" class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Active Filters -->
    <div
      v-if="videoId || authorId"
      class="mb-6 animate-fade-in flex flex-wrap gap-3"
    >
      <!-- Video Filter -->
      <div
        v-if="videoId"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 shadow-lg shadow-indigo-500/5"
      >
        <UIcon name="i-heroicons-funnel" class="w-4 h-4 text-indigo-400" />
        <span class="text-xs font-bold text-indigo-300">
          Filtered by:
          <span class="text-white">{{
            data?.items?.[0]?.videoTitle || videoId
          }}</span>
        </span>
        <button
          @click="
            videoId = '';
            router.replace({ query: { ...route.query, videoId: undefined } });
          "
          class="ml-2 p-1 hover:bg-white/10 rounded-lg transition-colors group"
          title="Clear filter"
        >
          <UIcon
            name="i-heroicons-x-mark"
            class="w-4 h-4 text-indigo-400 group-hover:text-white"
          />
        </button>
      </div>

      <!-- Author Filter -->
      <div
        v-if="authorId"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-violet-500/10 border border-violet-500/20 shadow-lg shadow-violet-500/5"
      >
        <UIcon name="i-heroicons-user" class="w-4 h-4 text-violet-400" />
        <span class="text-xs font-bold text-violet-300">
          Author:
          <span class="text-white">{{
            data?.items?.[0]?.authorName || authorId
          }}</span>
        </span>
        <button
          @click="
            authorId = '';
            router.replace({ query: { ...route.query, authorId: undefined } });
          "
          class="ml-2 p-1 hover:bg-white/10 rounded-lg transition-colors group"
          title="Clear filter"
        >
          <UIcon
            name="i-heroicons-x-mark"
            class="w-4 h-4 text-violet-400 group-hover:text-white"
          />
        </button>
      </div>
    </div>

    <!-- Search Bar -->
    <div class="mb-6">
      <div class="relative group">
        <div
          class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"
        >
          <UIcon
            name="i-heroicons-magnifying-glass"
            class="w-4 h-4 transition-colors"
            :class="searchInput ? 'text-indigo-400' : 'text-slate-600'"
          />
        </div>
        <input
          v-model="searchInput"
          type="search"
          :placeholder="$t('comments.search_placeholder')"
          class="w-full pl-10 pr-10 py-3 bg-white/[0.03] border border-white/[0.07] rounded-2xl text-md text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] focus:ring-1 focus:ring-indigo-500/20 transition-all duration-200"
        />
        <!-- Clear button -->
        <Transition
          enter-active-class="transition duration-150 ease-out"
          enter-from-class="opacity-0 scale-75"
          enter-to-class="opacity-100 scale-100"
          leave-active-class="transition duration-100 ease-in"
          leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-75"
        >
          <button
            v-if="searchInput"
            @click="clearSearch"
            class="absolute inset-y-0 right-0 pr-4 flex items-center group/clear"
            :title="$t('comments.search_clear')"
          >
            <div class="p-1 rounded-lg hover:bg-white/10 transition-colors">
              <UIcon
                name="i-heroicons-x-mark"
                class="w-3.5 h-3.5 text-slate-500 group-hover/clear:text-white transition-colors"
              />
            </div>
          </button>
        </Transition>
      </div>
      <!-- Results count when searching -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-150 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="search && !pending && data?.pagination"
          class="mt-2 flex items-center gap-2"
        >
          <span class="text-xs text-slate-500">
            <span class="font-bold text-indigo-400">{{
              $t("comments.search_results", { n: data.pagination.total })
            }}</span>
            {{ $t("comments.search_clear") && "" }}
            <span class="text-slate-600">· "{{ search }}"</span>
          </span>
          <button
            @click="clearSearch"
            class="text-[10px] font-bold text-indigo-500 hover:text-indigo-300 uppercase tracking-widest transition-colors"
          >
            {{ $t("comments.search_clear") }}
          </button>
        </div>
      </Transition>
    </div>
    <div class="flex items-center justify-between mb-8 gap-4">
      <div
        class="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1"
      >
        <button
          v-for="tab in statusTabs"
          :key="tab.value"
          class="flex items-center gap-2 px-8 py-2 rounded-2xl text-sm font-bold transition-all duration-300 cursor-pointer whitespace-nowrap border"
          :class="
            status === tab.value
              ? 'bg-blue-1000 border-purple-500 text-white shadow-lg shadow-purple-900/40'
              : 'bg-white/5 border-white/5 text-slate-500 hover:text-slate-200 hover:bg-white/10 hover:border-white/10'
          "
          @click="setStatus(tab.value)"
        >
          <UIcon :name="tab.icon" class="w-4 h-4" />
          {{ tab.label }}
        </button>
      </div>

      <div
        v-if="data?.items?.length && status !== 'published'"
        class="flex-shrink-0"
      >
        <UButton
          color="white"
          variant="ghost"
          size="sm"
          :icon="
            isAllSelected ? 'i-heroicons-check-circle' : 'i-heroicons-stop'
          "
          class="font-bold text-[10px] tracking-widest uppercase"
          @click="toggleSelectAll"
        >
          <span class="hidden sm:inline">
            {{
              isAllSelected
                ? $t("comments.deselect_all")
                : $t("comments.select_all")
            }}
          </span>
        </UButton>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="pending && !data?.items?.length">
      <div
        v-if="viewMode === 'grid'"
        class="grid gap-3 sm:gap-4"
        :class="[
          mobileColumns === 1 ? 'grid-cols-1' : 'grid-cols-2',
          'sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
        ]"
      >
        <div
          v-for="i in 8"
          :key="i"
          class="aspect-[4/5] rounded-3xl bg-white/[0.03] border border-white/[0.06] animate-pulse"
        />
      </div>
      <div v-else class="space-y-4">
        <div
          v-for="i in 6"
          :key="i"
          class="h-32 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse"
        />
      </div>
    </div>

    <!-- Empty (search) -->
    <div
      v-else-if="!pending && !data?.items?.length && search"
      class="bg-white/[0.02] border border-white/[0.06] border-dashed rounded-2xl py-20 text-center"
    >
      <UIcon
        name="i-heroicons-magnifying-glass"
        class="w-12 h-12 mx-auto mb-3 text-slate-700"
      />
      <p class="text-slate-500 text-sm mb-3">
        {{ $t("comments.search_no_results", { q: search }) }}
      </p>
      <button
        @click="clearSearch"
        class="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl"
      >
        <UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
        {{ $t("comments.search_clear") }}
      </button>
    </div>

    <!-- Empty -->
    <div
      v-else-if="!pending && !data?.items?.length"
      class="bg-white/[0.02] border border-white/[0.06] border-dashed rounded-2xl py-20 text-center"
    >
      <UIcon
        name="i-heroicons-check-circle"
        class="w-12 h-12 mx-auto mb-3 text-emerald-700"
      />
      <p class="text-slate-500 text-sm">
        {{
          $t(`comments.no_comments_${status === "inbox" ? "inbox" : status}`)
        }}
      </p>
    </div>

    <!-- Grid View -->
    <div
      v-else-if="viewMode === 'grid'"
      class="grid gap-3 sm:gap-4"
      :class="[
        mobileColumns === 1 ? 'grid-cols-1' : 'grid-cols-2',
        'sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4',
      ]"
    >
      <div v-for="(c, idx) in data?.items" :key="c.id" class="flex flex-col">
        <NuxtLink
          :to="`/comments/${c.id}`"
          class="comment-card-premium group relative flex flex-col h-full rounded-xl overflow-hidden bg-slate-900/40 border border-white/5 backdrop-blur-xl transition-all duration-500 hover:-translate-y-1.5 hover:shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8),0_0_20px_rgba(99,102,241,0.08)] animate-slide-up"
          :class="`stagger-${(idx % 5) + 1}`"
        >
          <!-- Premium Border Glow -->
          <div
            class="absolute inset-0 border border-white/10 rounded-xl group-hover:border-indigo-500/30 transition-colors duration-700 z-10 pointer-events-none"
          />

          <!-- Status Accent Glow (Dynamic) -->
          <div
            class="absolute top-0 left-0 right-0 h-1.5 transition-all duration-500 z-20"
            :class="{
              'bg-indigo-500 shadow-[0_4px_15px_rgba(99,102,241,0.5)]':
                c.status === 'pending' || c.status === 'inbox',
              'bg-emerald-500 shadow-[0_4px_15px_rgba(16,185,129,0.5)]':
                c.status === 'published',
              'bg-orange-500 shadow-[0_4px_15px_rgba(245,158,11,0.5)]':
                c.status === 'suggested',
              'bg-rose-500 shadow-[0_4px_15px_rgba(244,63,94,0.5)]':
                c.status === 'dismissed',
              'bg-blue-500 shadow-[0_4px_15px_rgba(59,130,246,0.5)]':
                c.status === 'skipped',
            }"
          />

          <!-- Thumbnail / Video Header -->
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

            <!-- Custom Selection Checkbox -->
            <div
              v-if="status !== 'published'"
              class="absolute top-3 right-3 sm:top-4 sm:right-4 z-30"
              @click.stop.prevent="toggleSelection(c.id)"
            >
              <div
                class="w-8 h-8 rounded-2xl border flex items-center justify-center transition-all duration-500"
                :class="
                  selectedIds.includes(c.id)
                    ? 'bg-indigo-500 border-indigo-400 text-white scale-110 rotate-6 shadow-[0_0_25px_rgba(99,102,241,0.7)]'
                    : 'bg-black/50 border-white/10 hover:border-white/30 backdrop-blur-xl'
                "
              >
                <UIcon
                  v-if="selectedIds.includes(c.id)"
                  name="i-heroicons-check-badge-solid"
                  class="w-5 h-5"
                />
                <div v-else class="w-2.5 h-2.5 rounded-full bg-white/20"></div>
              </div>
            </div>

            <!-- Floating Badges -->
            <div
              class="absolute top-3 left-3 sm:top-4 sm:left-4 flex flex-wrap gap-1.5 sm:gap-2 z-20"
            >
              <div
                class="flex items-center gap-1 sm:gap-1.5 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl"
              >
                <div
                  class="w-1.5 h-1.5 rounded-full animate-pulse"
                  :class="{
                    'bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]':
                      c.status === 'pending' || c.status === 'inbox',
                    'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]':
                      c.status === 'published',
                    'bg-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]':
                      c.status === 'suggested',
                    'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]':
                      c.status === 'dismissed',
                    'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]':
                      c.status === 'skipped',
                  }"
                ></div>
                <span
                  class="text-[9px] font-black uppercase tracking-[0.2em] text-white/90"
                >
                  {{ $t("status." + c.status) }}
                </span>
              </div>

              <!-- Language / Country -->
              <div
                v-if="c.detectedLang"
                class="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/5 backdrop-blur-xl border border-white/10 text-xs shadow-xl"
                :title="languageNames[c.detectedLang] || c.detectedLang"
              >
                {{ langFlag[c.detectedLang] || "🌐" }}
              </div>
            </div>

            <!-- Video Context -->
            <div
              class="absolute bottom-3 left-4 right-4 sm:bottom-4 sm:left-5 sm:right-5"
            >
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
                  class="text-[10px] font-black text-slate-300 line-clamp-2 uppercase tracking-widest opacity-80 group-hover/video:opacity-100 transition-opacity"
                >
                  {{ c.videoTitle }}
                </p>
              </div>
            </div>
          </div>

          <!-- Main Content Area -->
          <div class="p-4 sm:p-6 flex flex-col flex-1 gap-5">
            <!-- Author Header -->
            <div class="flex items-center gap-4">
              <div class="relative group/avatar">
                <div
                  class="absolute -inset-1 bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-600 rounded-full opacity-0 group-hover/avatar:opacity-100 transition-all duration-700 blur-md scale-110"
                ></div>
                <UAvatar
                  :src="
                    c.authorProfileImageUrl ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(c.authorName || '')}&background=6366f1&color=fff`
                  "
                  size="md"
                  class="relative ring-4 ring-slate-900 shrink-0 shadow-2xl"
                  :img-attributes="{
                    referrerpolicy: 'no-referrer',
                    crossorigin: 'anonymous',
                  }"
                />
                <div
                  v-if="c.isLastAuthorOwner"
                  class="absolute -bottom-1 -right-1 bg-indigo-500 rounded-full p-0.5 border-2 border-slate-900 shadow-lg"
                >
                  <UIcon
                    name="i-heroicons-check-badge-solid"
                    class="w-3 h-3 text-white"
                  />
                </div>
              </div>

              <div class="flex flex-col min-w-0">
                <span
                  class="font-black text-base text-white truncate tracking-tight leading-none text-xs sm:text-lg"
                >
                  {{ c.authorName }}
                </span>
                <div class="flex items-center gap-2 mt-1.5">
                  <span
                    class="text-[10px] text-slate-500 font-black uppercase tracking-widest"
                  >
                    {{ timeAgo(c.publishedAt) }}
                  </span>
                  <div class="w-1 h-1 rounded-full bg-slate-700"></div>
                  <div class="flex items-center gap-1">
                    <UIcon
                      name="i-heroicons-hand-thumb-up-solid"
                      class="w-3 h-3 text-indigo-500/60"
                    />
                    <span class="text-[10px] font-black text-slate-500">{{
                      c.likeCount || 0
                    }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Comment Bubble -->
            <div
              class="relative bg-white/[0.03] rounded-xl p-4 sm:p-5 flex-1 border border-white/[0.05] group-hover:bg-white/[0.05] group-hover:border-white/[0.08] transition-all duration-500 shadow-inner"
            >
              <UIcon
                name="i-heroicons-chat-bubble-left-right-solid"
                class="absolute -top-3 -left-3 w-8 h-8 text-indigo-500/10 group-hover:text-indigo-500/20 transition-colors"
              />

              <div
                class="text-[11px] sm:text-[14px] text-slate-200 leading-relaxed italic font-medium line-clamp-3"
              >
                "<span
                  v-html="
                    renderCommentHtml(
                      c.isLastAuthorOwner ? c.text : c.lastText || c.text,
                    )
                  "
                ></span
                >"
              </div>

              <!-- Opportunity Tag -->
              <div
                v-if="parseOpportunityFlags(c.opportunityFlags).length > 0"
                class="absolute -bottom-3 -right-2 px-4 py-1.5 rounded-full bg-indigo-500 text-[10px] font-black text-white shadow-[0_10px_20px_rgba(99,102,241,0.4)] flex items-center gap-2 border border-indigo-400 group-hover:scale-105 transition-transform"
              >
                <UIcon
                  name="i-heroicons-sparkles-solid"
                  class="w-3.5 h-3.5 animate-pulse"
                />
                {{ parseOpportunityFlags(c.opportunityFlags)[0].toUpperCase() }}
              </div>
            </div>

            <!-- Footer / Interaction -->
            <div class="mt-auto">
              <!-- Reply Indicator / Preview -->
              <div
                v-if="
                  c.replyText ||
                  (c.isLastAuthorOwner && c.lastText) ||
                  c.suggestedReplyText
                "
                class="group/reply relative pl-4 sm:pl-5 py-2"
              >
                <div
                  class="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-indigo-500/40 via-purple-500/40 to-transparent rounded-full"
                ></div>

                <div class="flex items-center gap-2 mb-1.5">
                  <UIcon
                    :name="
                      c.replyText || (c.isLastAuthorOwner && c.lastText)
                        ? 'i-heroicons-arrow-uturn-left-solid'
                        : 'i-heroicons-sparkles-solid'
                    "
                    class="w-3.5 h-3.5"
                    :class="
                      c.replyText || (c.isLastAuthorOwner && c.lastText)
                        ? 'text-emerald-400'
                        : 'text-indigo-400'
                    "
                  />
                  <span
                    class="text-[10px] font-black uppercase tracking-[0.15em]"
                    :class="
                      c.replyText || (c.isLastAuthorOwner && c.lastText)
                        ? 'text-emerald-400'
                        : 'text-indigo-400'
                    "
                  >
                    {{
                      c.replyText || (c.isLastAuthorOwner && c.lastText)
                        ? $t("comments.your_response")
                        : $t("comments.ai_suggestion")
                    }}
                  </span>
                </div>

                <p
                  class="text-xs text-slate-400 line-clamp-1 opacity-70 italic font-medium"
                >
                  {{
                    c.replyText ||
                    (c.isLastAuthorOwner ? c.text : c.lastText) ||
                    c.suggestedReplyText
                  }}
                </p>
              </div>
            </div>
          </div>

          <!-- Integrated Action Bar (Premium Footer) -->
          <div
            class="mt-auto flex items-center justify-center gap-2 w-full py-3 bg-white/[0.01] border-t border-white/[0.05] text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] transition-all duration-300 group-hover:bg-indigo-500/10 group-hover:text-indigo-400"
          >
            <UIcon
              name="i-heroicons-chat-bubble-left-right-solid"
              class="w-3.5 h-3.5 opacity-30 group-hover:opacity-100 transition-opacity"
            />
            <span>{{ $t("comments.review") }}</span>
          </div>
        </NuxtLink>

        <!-- Undismiss Action (Outside Link) -->
        <div v-if="status === 'dismissed'" class="mt-4 flex justify-center">
          <button
            class="flex items-center gap-2 px-6 py-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest hover:text-emerald-400 transition-all cursor-pointer bg-emerald-500/5 border border-emerald-500/10 rounded-xl hover:bg-emerald-500/10"
            @click.prevent="undismiss(c.id)"
          >
            <UIcon name="i-heroicons-arrow-uturn-left" class="w-4 h-4" />
            {{ $t("comments.restore") }}
          </button>
        </div>
      </div>
    </div>

    <!-- List View -->
    <div v-else class="space-y-4">
      <div
        v-for="(c, idx) in data?.items"
        :key="c.id"
        class="animate-slide-up"
        :class="`stagger-${(idx % 5) + 1}`"
      >
        <NuxtLink
          :to="`/comments/${c.id}`"
          class="group relative flex items-stretch gap-4 sm:gap-6 bg-slate-900/40 border border-white/5 backdrop-blur-xl rounded-xl p-2.5 sm:p-4 hover:bg-white/[0.05] hover:border-white/10 hover:-translate-y-1 transition-all duration-500 overflow-hidden"
        >
          <!-- Vertical Status Accent -->
          <div
            class="absolute left-0 top-0 bottom-0 w-1.5 transition-all duration-500"
            :class="{
              'bg-indigo-500 shadow-[2px_0_15px_rgba(99,102,241,0.5)]':
                c.status === 'pending' || c.status === 'inbox',
              'bg-emerald-500 shadow-[2px_0_15px_rgba(16,185,129,0.5)]':
                c.status === 'published',
              'bg-orange-500 shadow-[2px_0_15px_rgba(245,158,11,0.5)]':
                c.status === 'suggested',
              'bg-rose-500 shadow-[2px_0_15px_rgba(244,63,94,0.5)]':
                c.status === 'dismissed',
              'bg-blue-500 shadow-[2px_0_15px_rgba(59,130,246,0.5)]':
                c.status === 'skipped',
            }"
          />

          <!-- Thumbnail Section -->
          <div
            class="flex flex-shrink-0 w-32 sm:w-64 aspect-video rounded-2xl overflow-hidden border border-white/10 relative bg-slate-950"
          >
            <img
              v-if="c.videoThumbnail && !failedThumbnails[c.id]"
              :src="getCleanThumbnailUrl(c.videoId, c.videoThumbnail)"
              :alt="c.videoTitle ?? ''"
              class="w-full h-full object-cover group-hover:scale-105 transition-all duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] opacity-70 group-hover:opacity-90 will-change-transform"
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="handleThumbnailError(c.id, c.videoId, $event)"
            />
            <div
              class="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent"
            />

            <!-- Selection Checkbox -->
            <div
              v-if="status !== 'published'"
              class="absolute top-2 left-2 z-20"
              @click.stop.prevent="toggleSelection(c.id)"
            >
              <div
                class="w-7 h-7 rounded-xl border flex items-center justify-center transition-all duration-300"
                :class="
                  selectedIds.includes(c.id)
                    ? 'bg-indigo-500 border-indigo-400 text-white scale-110 rotate-3 shadow-lg'
                    : 'bg-black/60 border-white/20 hover:border-white/40 backdrop-blur-md'
                "
              >
                <UIcon
                  v-if="selectedIds.includes(c.id)"
                  name="i-heroicons-check-circle-solid"
                  class="w-4.5 h-4.5"
                />
                <div v-else class="w-2 h-2 rounded-full bg-white/20"></div>
              </div>
            </div>

            <!-- Language Overlay -->
            <div
              v-if="c.detectedLang"
              class="absolute bottom-2 right-2 flex items-center justify-center w-7 h-7 rounded-lg bg-black/60 backdrop-blur-md border border-white/10 text-xs"
            >
              {{ langFlag[c.detectedLang] || "🌐" }}
            </div>
          </div>

          <!-- Content Section -->
          <div class="flex-1 min-w-0 flex flex-col justify-center py-1">
            <!-- Author & Meta -->
            <div
              class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3"
            >
              <div class="flex items-center gap-3">
                <UAvatar
                  :src="
                    c.authorProfileImageUrl ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(c.authorName || '')}&background=6366f1&color=fff`
                  "
                  size="xs"
                  class="ring-2 ring-slate-800 shrink-0 shadow-lg"
                  :img-attributes="{
                    referrerpolicy: 'no-referrer',
                    crossorigin: 'anonymous',
                  }"
                />
                <div class="flex flex-col min-w-0">
                  <span
                    class="font-black text-white text-sm truncate tracking-tight"
                    >{{ c.authorName }}</span
                  >
                  <div class="flex items-center gap-2">
                    <span
                      class="text-[10px] text-slate-500 font-bold uppercase tracking-widest"
                      >{{ timeAgo(c.publishedAt) }}</span
                    >
                    <div
                      v-if="c.isReturnCommenter"
                      class="px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-[8px] font-black text-violet-400 uppercase tracking-widest"
                    >
                      FAN
                    </div>
                  </div>
                </div>
              </div>

              <div class="flex items-center gap-3 flex-wrap sm:flex-nowrap">
                <div
                  class="flex items-center gap-3 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm"
                >
                  <div class="flex items-center gap-1">
                    <UIcon
                      name="i-heroicons-hand-thumb-up-solid"
                      class="w-3.5 h-3.5 text-indigo-500"
                    />
                    <span class="text-[11px] font-black text-slate-400">{{
                      c.likeCount || 0
                    }}</span>
                  </div>
                  <div class="w-px h-3 bg-white/10"></div>
                  <span
                    class="text-[9px] font-black text-indigo-400 uppercase tracking-widest"
                    >{{ $t("status." + c.status) }}</span
                  >
                </div>
              </div>
            </div>

            <!-- Comment Content -->
            <div class="relative group/content">
              <p
                class="text-sm sm:text-base text-slate-200 line-clamp-1 group-hover/content:line-clamp-none transition-all duration-300 italic font-medium"
              >
                "<span v-html="renderCommentHtml(c.lastText || c.text)"></span>"
              </p>
            </div>

            <!-- Thread Context -->
            <div class="mt-3 flex items-center gap-3 overflow-hidden">
              <div class="flex items-center gap-2 flex-shrink-0 group/video">
                <div
                  class="w-7 h-7 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center flex-shrink-0 shadow-lg"
                >
                  <UIcon
                    name="i-heroicons-film-solid"
                    class="w-3.5 h-3.5 text-indigo-400 opacity-90"
                  />
                </div>
                <span
                  class="text-[10px] font-black text-slate-500 uppercase tracking-widest line-clamp-2 max-w-[150px] sm:max-w-[350px] group-hover/video:text-indigo-300 transition-colors"
                >
                  {{ c.videoTitle }}
                </span>
              </div>

              <!-- Reply Indicator -->
              <div
                v-if="c.replyText || c.suggestedReplyText"
                class="flex items-center gap-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest"
              >
                <div class="w-1 h-1 rounded-full bg-slate-700"></div>
                <UIcon
                  :name="
                    c.replyText
                      ? 'i-heroicons-arrow-uturn-left-solid'
                      : 'i-heroicons-sparkles-solid'
                  "
                  class="w-3.5 h-3.5"
                  :class="c.replyText ? 'text-emerald-400' : 'text-indigo-400'"
                />
                <span
                  :class="c.replyText ? 'text-emerald-400' : 'text-indigo-400'"
                >
                  {{
                    c.replyText
                      ? $t("comments.your_response")
                      : $t("comments.ai_suggestion")
                  }}
                </span>
              </div>
            </div>
          </div>
        </NuxtLink>
      </div>
    </div>

    <!-- Pagination -->
    <div
      v-if="data && data.pagination.pages > 1"
      class="flex justify-center mt-8 mb-4"
    >
      <UPagination
        :model-value="page"
        :total="data.pagination.total"
        :page-count="data.pagination.limit"
        size="lg"
        @update:model-value="setPage"
      />
    </div>

    <!-- Bulk Action Toolbar -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="transform translate-y-20 opacity-0"
      enter-to-class="transform translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="transform translate-y-0 opacity-100"
      leave-to-class="transform translate-y-20 opacity-0"
    >
      <div
        v-if="selectedIds.length > 0"
        class="fixed bottom-6 sm:bottom-8 left-1/2 -translate-x-1/2 z-50 px-3 w-full sm:w-auto"
      >
        <div
          class="bg-slate-900/80 backdrop-blur-2xl border border-white/10 px-4 sm:px-6 py-2 sm:py-3 rounded-2xl sm:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-between sm:justify-start gap-3 sm:gap-6 w-full"
        >
          <div class="flex items-center gap-3 sm:gap-6">
            <div class="flex items-center gap-1 sm:gap-2">
              <span
                class="text-sm sm:text-lg font-black text-white leading-none"
                >{{ selectedIds.length }}</span
              >
              <span
                class="hidden sm:inline text-[10px] font-bold text-indigo-400 uppercase tracking-widest"
                >{{ $t("comments.selected_items_short") }}</span
              >
            </div>

            <div class="h-8 w-px bg-white/10 shrink-0" />

            <div class="flex items-center gap-1.5">
              <UButton
                v-if="status !== 'pending' && status !== 'inbox'"
                color="yellow"
                variant="soft"
                size="sm"
                icon="i-heroicons-clock"
                class="rounded-xl px-1.5 sm:px-3"
                @click="bulkStatusUpdate('pending')"
              >
                <span class="text-[8px] sm:text-xs">{{
                  $t("status.pending")
                }}</span>
              </UButton>
              <UButton
                v-if="status !== 'published'"
                color="green"
                variant="soft"
                size="sm"
                icon="i-heroicons-check-circle"
                class="rounded-xl px-1.5 sm:px-3"
                @click="bulkStatusUpdate('published')"
              >
                <span class="text-[8px] sm:text-xs">{{
                  $t("status.published")
                }}</span>
              </UButton>
              <UButton
                v-if="status !== 'dismissed'"
                color="red"
                variant="soft"
                size="sm"
                icon="i-heroicons-trash"
                class="rounded-xl px-1.5 sm:px-3"
                @click="bulkStatusUpdate('dismissed')"
              >
                <span class="text-[8px] sm:text-xs">{{
                  $t("status.dismissed")
                }}</span>
              </UButton>
              <UButton
                v-if="status !== 'skipped'"
                color="blue"
                variant="soft"
                size="sm"
                icon="i-heroicons-forward"
                class="rounded-xl px-1.5 sm:px-3"
                @click="bulkStatusUpdate('skipped')"
              >
                <span class="text-[8px] sm:text-xs">{{
                  $t("status.skipped")
                }}</span>
              </UButton>
            </div>
          </div>

          <div class="h-8 w-px bg-white/10 shrink-0 hidden sm:block" />

          <UButton
            color="white"
            variant="ghost"
            size="sm"
            icon="i-heroicons-x-mark"
            class="shrink-0 rounded-xl px-1.5 sm:px-3"
            @click="selectedIds = []"
          >
            <span class="hidden sm:inline text-xs">{{
              $t("comments.cancel")
            }}</span>
          </UButton>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.comment-card-premium {
  isolation: isolate;
}

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
.stagger-5 {
  animation-delay: 0.5s;
}

@keyframes slideUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Custom scrollbar for tabs if needed */
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
