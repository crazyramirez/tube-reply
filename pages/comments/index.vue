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

const status = ref((route.query.status as string) || (route.query.videoId || route.query.intent ? "all" : lastStatus.value));
const page = ref(Number(route.query.page || 1));
const videoId = ref((route.query.videoId as string) || "");
const authorId = ref((route.query.authorId as string) || "");
const intent = ref((route.query.intent as string) || "");
const searchInput = ref((route.query.search as string) || "");
const search = ref(searchInput.value);

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
    router.replace({ query: { ...route.query, search: val.trim() || undefined, page: 1 } });
  }, 350);
});

function clearSearch() {
  searchInput.value = "";
  search.value = "";
  router.replace({ query: { ...route.query, search: undefined, page: 1 } });
}

useHead({
  meta: [
    { name: 'referrer', content: 'no-referrer' }
  ]
});


const { data, refresh, pending } = useFetch<
  PaginatedResponse<CommentListItem>
>("/api/comments", {
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
});



function setStatus(s: string) {
  status.value = s;
  page.value = 1;
  router.replace({ 
    query: { 
      ...route.query,
      status: s, 
      page: 1 
    } 
  });

}

function setPage(p: number) {
  page.value = p;
  router.replace({ query: { status: status.value, page: p } });
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
  try { return JSON.parse(flags); } catch { return []; }
}

const viewMode = useCookie<"grid" | "list">("comment-view-mode", {
  default: () => "grid",
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
  if (savedScrollPos.value > 0) {
    // Forzamos una altura mínima temporal para evitar que el navegador resetee el scroll a 0
    // si el contenido aún no se ha renderizado completamente o la página ha encogido.
    const originalMinHeight = document.documentElement.style.minHeight;
    document.documentElement.style.minHeight = '5000px'; 
    
    setTimeout(() => {
      window.scrollTo({ top: savedScrollPos.value, behavior: 'instant' });
      document.documentElement.style.minHeight = originalMinHeight;
    }, 100);
  }
});

const failedThumbnails = ref<Record<string, boolean>>({});

function handleThumbnailError(commentId: string, videoId: string, event: Event) {
  const img = event.target as HTMLImageElement;
  const max = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const mq = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  if (!img.src.includes('img.youtube.com/vi/')) {
    img.src = max;
  } else if (img.src === max) {
    img.src = mq;
  } else {
    failedThumbnails.value[commentId] = true;
  }
}

const { justAutoSuggestCompleted } = useSyncStatus();
watch(justAutoSuggestCompleted, (done) => {
  if (done) refresh();
});

// Solo hacer scroll al principio si cambian REALMENTE los filtros o página
watch([status, page], (newVals, oldVals) => {
  const [newS, newP] = newVals;
  const [oldS, oldP] = oldVals;
  
  if (oldS !== undefined && (newS !== oldS || newP !== oldP)) {
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        <h1 class="text-2xl sm:text-3xl font-black text-white tracking-tighter flex items-center gap-3">
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
        <button
          class="flex p-2 rounded-lg transition-all duration-200 cursor-pointer"
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
        <button
          class="flex p-2 rounded-lg transition-all duration-200 cursor-pointer"
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
      </div>
    </div>


    <!-- Active Filters -->
    <div v-if="videoId || authorId" class="mb-6 animate-fade-in flex flex-wrap gap-3">
      <!-- Video Filter -->
      <div v-if="videoId" class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 shadow-lg shadow-indigo-500/5">
        <UIcon name="i-heroicons-funnel" class="w-4 h-4 text-indigo-400" />
        <span class="text-xs font-bold text-indigo-300">
          Filtered by: <span class="text-white">{{ data?.items?.[0]?.videoTitle || videoId }}</span>
        </span>
        <button 
          @click="videoId = ''; router.replace({ query: { ...route.query, videoId: undefined } })"
          class="ml-2 p-1 hover:bg-white/10 rounded-lg transition-colors group"
          title="Clear filter"
        >
          <UIcon name="i-heroicons-x-mark" class="w-4 h-4 text-indigo-400 group-hover:text-white" />
        </button>
      </div>

      <!-- Author Filter -->
      <div v-if="authorId" class="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-violet-500/10 border border-violet-500/20 shadow-lg shadow-violet-500/5">
        <UIcon name="i-heroicons-user" class="w-4 h-4 text-violet-400" />
        <span class="text-xs font-bold text-violet-300">
          Author: <span class="text-white">{{ data?.items?.[0]?.authorName || authorId }}</span>
        </span>
        <button 
          @click="authorId = ''; router.replace({ query: { ...route.query, authorId: undefined } })"
          class="ml-2 p-1 hover:bg-white/10 rounded-lg transition-colors group"
          title="Clear filter"
        >
          <UIcon name="i-heroicons-x-mark" class="w-4 h-4 text-violet-400 group-hover:text-white" />
        </button>
      </div>
    </div>


    <!-- Search Bar -->
    <div class="mb-6">
      <div class="relative group">
        <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
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
          class="w-full pl-10 pr-10 py-3 bg-white/[0.03] border border-white/[0.07] rounded-2xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 focus:bg-white/[0.05] focus:ring-1 focus:ring-indigo-500/20 transition-all duration-200"
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
              <UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5 text-slate-500 group-hover/clear:text-white transition-colors" />
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
        <div v-if="search && !pending && data?.pagination" class="mt-2 flex items-center gap-2">
          <span class="text-xs text-slate-500">
            <span class="font-bold text-indigo-400">{{ $t('comments.search_results', { n: data.pagination.total }) }}</span>
            {{ $t('comments.search_clear') && '' }}
            <span class="text-slate-600">· "{{ search }}"</span>
          </span>
          <button
            @click="clearSearch"
            class="text-[10px] font-bold text-indigo-500 hover:text-indigo-300 uppercase tracking-widest transition-colors"
          >{{ $t('comments.search_clear') }}</button>
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

    <!-- Loading - Only show skeletons if we have no data and it's pending -->
    <div v-if="pending && !data?.items?.length">
      <!-- Grid Loading -->
      <div v-if="viewMode === 'grid'" class="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3">
        <div
          v-for="i in 8"
          :key="i"
          class="aspect-[4/5] rounded-3xl bg-white/[0.03] border border-white/[0.06] animate-pulse"
        />
      </div>
      <!-- List Loading -->
      <div v-else class="space-y-3">
        <div
          v-for="i in 6"
          :key="i"
          class="h-24 rounded-2xl bg-white/[0.03] border border-white/[0.06] animate-pulse"
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
        {{ $t('comments.search_no_results', { q: search }) }}
      </p>
      <button
        @click="clearSearch"
        class="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors px-3 py-1.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl"
      >
        <UIcon name="i-heroicons-x-mark" class="w-3.5 h-3.5" />
        {{ $t('comments.search_clear') }}
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
      class="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2 sm:gap-3"
    >
      <div v-for="(c, idx) in data.items" :key="c.id" class="flex flex-col">
        <NuxtLink
          :to="`/comments/${c.id}`"
          class="glass-card overflow-hidden flex flex-col h-full group animate-slide-up"
          :class="`stagger-${(idx % 5) + 1}`"
        >
          <!-- Video Preview -->
          <div class="relative aspect-video bg-slate-900 overflow-hidden">
            <img
              v-if="c.videoThumbnail && !failedThumbnails[c.id]"
              :src="c.videoThumbnail ?? undefined"
              :alt="c.videoTitle ?? ''"
              class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="handleThumbnailError(c.id, c.videoId, $event)"
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

            <div
              v-if="status !== 'published'"
              class="absolute top-2 right-2 sm:top-3 sm:right-3 z-10"
              @click.stop.prevent="toggleSelection(c.id)"
            >
              <div
                class="w-6 h-6 sm:w-8 sm:h-8 rounded-lg border-2 flex items-center justify-center transition-all duration-200"
                :class="
                  selectedIds.includes(c.id)
                    ? 'bg-indigo-500 border-indigo-400 text-white scale-110 shadow-lg shadow-indigo-500/50'
                    : 'bg-black/30 border-white/20 hover:border-white/40'
                "
              >
                <UIcon
                  v-if="selectedIds.includes(c.id)"
                  name="i-heroicons-check"
                  class="w-3 h-3 sm:w-4 sm:h-4"
                />
              </div>
            </div>

            <div
              class="absolute top-2 left-2 sm:top-3 sm:left-3 flex gap-1 sm:gap-2 flex-wrap"
            >
              <UBadge
                :color="statusColor(c.status)"
                variant="solid"
                size="xs"
                class="font-black tracking-tighter rounded-md text-[8px] sm:text-[10px] px-1 sm:px-1.5"
              >
                {{ $t('status.' + c.status).toUpperCase() }}
              </UBadge>
              <!-- Opportunity flag -->
              <span
                v-if="parseOpportunityFlags(c.opportunityFlags).length > 0"
                class="flex items-center gap-0.5 px-1 sm:px-1.5 py-0.5 rounded border text-[8px] sm:text-[9px] font-black uppercase backdrop-blur-md text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
              >
                <UIcon name="i-heroicons-star" class="w-2.5 h-2.5" />
                {{ parseOpportunityFlags(c.opportunityFlags)[0] }}
              </span>
              <!-- Language badge -->
              <span
                v-if="c.detectedLang"
                class="flex items-center gap-1 bg-black/60 backdrop-blur-md px-1.5 sm:px-2 py-0.5 rounded border border-white/10 text-[8px] sm:text-[10px] font-black uppercase text-white shadow-lg"
              >
                <span>{{ langFlag[c.detectedLang] || '🌐' }}</span>
                <span class="hidden sm:inline">{{ languageNames[c.detectedLang] || c.detectedLang }}</span>
                <span class="sm:hidden">{{ c.detectedLang }}</span>
              </span>
            </div>

            <div class="absolute bottom-3 left-3 right-3">
              <p
                class="text-[10px] font-bold text-slate-300 line-clamp-1 uppercase tracking-wider mb-1"
              >
                {{ c.videoTitle }}
              </p>
            </div>
          </div>

          <div class="p-3 sm:p-5 flex flex-col flex-1 gap-2 sm:gap-4">
            <div class="flex items-center gap-2 sm:gap-3 group/author">
              <UAvatar
                :src="c.authorProfileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.authorName || '')}&background=6366f1&color=fff`"
                size="sm"
                class="ring-1 ring-white/10 shrink-0 shadow-sm"
                :img-attributes="{
                  referrerpolicy: 'no-referrer',
                  crossorigin: 'anonymous',
                }"
              />

              <div class="flex flex-col min-w-0">
                <span
                  class="font-bold text-[10px] sm:text-sm text-white truncate transition-colors"
                  >{{ c.authorName }}</span
                >
                <span
                  class="mt-0.5 text-[8px] sm:text-[12px] text-slate-500 font-medium"
                  >{{ timeAgo(c.publishedAt) }}</span
                >
              </div>
            </div>


            <div
              class="bg-white/5 border border-white/5 rounded-lg sm:rounded-xl p-2 sm:p-4 flex-1"
            >
              <p
                class="text-[10px] sm:text-sm text-slate-300 leading-relaxed line-clamp-2 sm:line-clamp-3 italic"
              >"<span v-html="renderCommentHtml(c.lastText || c.text)"></span>"</p>
            </div>

            <!-- Published reply preview -->
            <div
              v-if="c.replyText"
              class="mt-1 pl-2 sm:pl-4 border-l-2 border-emerald-500/30"
            >
              <div class="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                <UIcon
                  name="i-heroicons-chat-bubble-left-right"
                  class="w-2.5 h-2.5 sm:w-3 sm:h-3 text-emerald-400"
                />
                <span
                  class="text-[8px] sm:text-[10px] font-bold text-emerald-400 uppercase tracking-wider truncate"
                  >{{ $t("comments.your_response") }}</span
                >
              </div>
              <p
                class="text-[9px] sm:text-xs text-slate-400 line-clamp-1 sm:line-clamp-2 italic"
              >
                {{ c.replyText }}
              </p>
            </div>
            <!-- AI suggestion preview (inbox) -->
            <div
              v-else-if="c.suggestedReplyText"
              class="mt-1 pl-2 sm:pl-4 border-l-2 border-indigo-500/30"
            >
              <div class="flex items-center gap-1 sm:gap-1.5 mb-0.5 sm:mb-1">
                <UIcon
                  name="i-heroicons-sparkles"
                  class="w-2.5 h-2.5 sm:w-3 sm:h-3 text-indigo-400"
                />
                <span
                  class="text-[8px] sm:text-[10px] font-bold text-indigo-400 uppercase tracking-wider truncate"
                  >{{ $t("comments.ai_suggestion") }}</span
                >
              </div>
              <p
                class="text-[9px] sm:text-xs text-slate-400 line-clamp-1 sm:line-clamp-2 italic"
              >
                {{ c.suggestedReplyText }}
              </p>
            </div>
            <!-- Pending — no suggestion yet -->
            <div
              v-else-if="status === 'inbox'"
              class="mt-1 pl-2 sm:pl-4 border-l-2 border-white/10"
            >
              <span
                class="text-[8px] sm:text-[10px] font-bold text-slate-700 uppercase tracking-wider truncate"
                >{{ $t("comments.awaiting_ai") }}</span
              >
            </div>

            <div class="flex items-center justify-between pt-1 sm:pt-2">
              <div class="flex items-center gap-2 sm:gap-3">
                <span
                  v-if="c.likeCount"
                  class="text-[8px] sm:text-[10px] font-bold text-slate-500 flex items-center gap-1"
                >
                  <UIcon
                    name="i-heroicons-hand-thumb-up"
                    class="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-500"
                  />
                  {{ c.likeCount }}
                </span>
              </div>
              <div
                class="flex items-center gap-1 text-[10px] font-bold text-indigo-400 group-hover:translate-x-1 transition-transform"
              >
                <span class="hidden sm:inline">{{
                  $t("comments.review")
                }}</span>
                <UIcon name="i-heroicons-arrow-right" class="w-3 h-3" />
              </div>
            </div>
          </div>
        </NuxtLink>
        <div v-if="status === 'dismissed'" class="mt-2 flex justify-center">
          <button
            class="flex items-center gap-1.5 text-[10px] font-bold text-emerald-500 uppercase tracking-widest hover:text-emerald-400 transition-colors cursor-pointer px-3 py-1 bg-emerald-500/5 border border-emerald-500/10 rounded-lg"
            @click.prevent="undismiss(c.id)"
          >
            <UIcon name="i-heroicons-arrow-uturn-left" class="w-3.5 h-3.5" />
            {{ $t("comments.restore") }}
          </button>
        </div>
      </div>
    </div>

    <!-- List View -->
    <div v-else class="space-y-3">
      <div
        v-for="(c, idx) in data.items"
        :key="c.id"
        class="animate-slide-up"
        :class="`stagger-${(idx % 5) + 1}`"
      >
        <NuxtLink
          :to="`/comments/${c.id}`"
          class="glass-card p-3 sm:p-4 flex items-stretch gap-3 sm:gap-5 group"
        >
          <div
            class="flex flex-shrink-0 w-32 sm:w-56 aspect-video rounded-xl overflow-hidden border border-white/10 relative bg-slate-900"
          >
            <img
              v-if="c.videoThumbnail && !failedThumbnails[c.id]"
              :src="c.videoThumbnail ?? undefined"
              :alt="c.videoTitle ?? ''"
              class="w-full h-full object-contain group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="handleThumbnailError(c.id, c.videoId, $event)"
            />
            <div
              v-else
              class="w-full h-full bg-slate-900 flex items-center justify-center"
            >
              <UIcon
                name="i-heroicons-video-camera"
                class="text-slate-800 w-6 h-6"
              />
            </div>
            <div
              class="absolute inset-0 bg-indigo-900/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              <UIcon name="i-heroicons-play" class="w-6 h-6 text-white" />
            </div>

            <!-- Selection Checkbox (Always over thumbnail) -->
            <div
              v-if="status !== 'published'"
              class="absolute top-2 left-2 z-20"
              @click.stop.prevent="toggleSelection(c.id)"
            >
              <div
                class="w-6 h-6 sm:w-8 sm:h-8 rounded-lg border-2 flex items-center justify-center transition-all duration-200 bg-black/40 backdrop-blur-md"
                :class="
                  selectedIds.includes(c.id)
                    ? 'bg-indigo-500 border-indigo-400 text-white scale-110 shadow-lg shadow-indigo-500/50'
                    : 'border-white/20 hover:border-white/40'
                "
              >
                <UIcon
                  v-if="selectedIds.includes(c.id)"
                  name="i-heroicons-check"
                  class="w-3.5 h-3.5 sm:w-4 sm:h-4"
                />
              </div>
            </div>
          </div>

          <!-- Content -->
          <div class="flex-1 min-w-0 flex flex-col">
            <div class="mb-1.5 order-2 sm:order-1 flex items-center gap-2 group/author">
              <UAvatar
                :src="c.authorProfileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(c.authorName || '')}&background=6366f1&color=fff`"
                size="xs"
                class="ring-1 ring-white/10 shrink-0 shadow-sm"
                :img-attributes="{
                  referrerpolicy: 'no-referrer',
                  crossorigin: 'anonymous',
                }"
              />
              <span class="font-bold text-white text-sm truncate block transition-colors">{{
                c.authorName
              }}</span>
            </div>


            <div
              class="flex items-center justify-between gap-4 mb-2 order-1 sm:order-2"
            >
              <div class="flex items-center gap-1.5 min-w-0 flex-wrap">
                <UBadge
                  :color="statusColor(c.status)"
                  variant="soft"
                  size="xs"
                  class="rounded-md font-bold text-[9px] px-1.5 py-0"
                >
                  {{ $t('status.' + c.status).toUpperCase() }}
                </UBadge>
                <!-- Language badge -->
                <span
                  v-if="c.detectedLang"
                  class="flex items-center gap-1 bg-white/[0.05] border border-white/[0.1] px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-black uppercase text-slate-300"
                >
                  <span>{{ langFlag[c.detectedLang] || '🌐' }}</span>
                  <span>{{ languageNames[c.detectedLang] || c.detectedLang }}</span>
                </span>
                <!-- Opportunity -->
                <span
                  v-if="parseOpportunityFlags(c.opportunityFlags).length > 0"
                  class="flex items-center gap-0.5 px-1 py-0 rounded border text-[8px] font-black uppercase text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                >
                  <UIcon name="i-heroicons-star" class="w-2.5 h-2.5" />
                  {{ parseOpportunityFlags(c.opportunityFlags)[0] }}
                </span>
                <!-- Return commenter -->
                <span
                  v-if="c.isReturnCommenter"
                  class="flex items-center gap-0.5 px-1 py-0 rounded border text-[8px] font-black uppercase text-violet-400 bg-violet-500/10 border-violet-500/20"
                >
                  <UIcon name="i-heroicons-user-circle" class="w-2.5 h-2.5" />
                  FAN
                </span>
                <span
                  v-if="c.detectedLang"
                  class="text-[10px] font-bold text-slate-600"
                  >{{ c.detectedLang.toUpperCase() }}</span
                >
              </div>
              <div
                class="flex items-center gap-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest flex-shrink-0"
              >
                <span v-if="c.likeCount" class="flex items-center gap-1"
                  ><UIcon
                    name="i-heroicons-hand-thumb-up"
                    class="w-3.5 h-3.5"
                  />{{ c.likeCount }}</span
                >
                <span>{{ timeAgo(c.lastActivityAt || c.publishedAt) }}</span>
              </div>
            </div>
            <p
              class="text-xs sm:text-sm text-slate-400 line-clamp-2 italic order-3"
            >"<span v-html="renderCommentHtml(c.lastText || c.text)"></span>"</p>
            <div
              v-if="c.replyText"
              class="mt-1 pl-3 border-l-2 border-emerald-500/30 order-4"
            >
              <p class="text-[11px] text-slate-500 line-clamp-1 italic">
                <span class="font-bold text-emerald-500/70 mr-1"
                  >{{ $t("comments.your_response") }}:</span
                >
                {{ c.replyText }}
              </p>
            </div>
            <div
              v-else-if="c.suggestedReplyText"
              class="mt-1 pl-3 border-l-2 border-indigo-500/30 order-4"
            >
              <p class="text-[11px] text-slate-500 line-clamp-1 italic">
                <span
                  class="font-bold text-indigo-400/70 mr-1 inline-flex items-center gap-1"
                >
                  <UIcon name="i-heroicons-sparkles" class="w-2.5 h-2.5" />{{
                    $t("comments.ai_suggestion")
                  }}:
                </span>
                {{ c.suggestedReplyText }}
              </p>
            </div>
            <div class="mt-1 flex items-center gap-1.5 order-5">
              <UIcon name="i-heroicons-film" class="w-3 h-3 text-slate-700" />
              <span class="text-[10px] text-slate-600 font-medium truncate">{{
                c.videoTitle
              }}</span>
            </div>
          </div>

          <!-- Action -->
          <div class="flex-shrink-0 flex items-center gap-4">
            <button
              v-if="status === 'dismissed'"
              class="w-10 h-10 flex items-center justify-center rounded-xl bg-emerald-500/5 border border-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10 transition-colors"
              @click.prevent="undismiss(c.id)"
              :title="$t('comments.restore')"
            >
              <UIcon name="i-heroicons-arrow-uturn-left" class="w-5 h-5" />
            </button>
            <div
              class="w-6 h-6 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl bg-transparent sm:bg-white/5 border-none sm:border sm:border-white/5 text-slate-600 group-hover:text-indigo-400 group-hover:border-indigo-500/20 transition-all"
            >
              <UIcon
                name="i-heroicons-chevron-right"
                class="w-3 h-3 sm:w-5 sm:h-5 group-hover:translate-x-0.5 transition-transform"
              />
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

            <div class="flex items-center gap-1 sm:gap-1.5">
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
