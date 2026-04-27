<script setup lang="ts">
import type {
  SuggestedReply,
  CommentDetailResponse,
  CommenterHistory,
} from "~/shared/types";
import { renderCommentHtml } from "~/composables/useCommentHtml";

definePageMeta({ middleware: "auth" });

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;
const { t, locale } = useI18n();

function handleBack() {
  const backState = window.history.state?.back;
  // If we have history and it's not the login page, go back natively
  if (backState && !backState.includes('/login') && backState !== '/') {
    router.back();
  } else {
    // Default safe fallback
    router.push('/comments');
  }
}

useHead({
  meta: [{ name: "referrer", content: "no-referrer" }],
});

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

const userLangName = computed(() => languageNames[locale.value] || "Spanish");

const toast = useToast();
const generating = ref(false);
const showAiInstructions = ref(false);
const publishing = ref(false);
const showPublishModal = ref(false);
const editedText = ref("");
const isTranslating = ref(false);
let translateTimeout: NodeJS.Timeout | null = null;

// Auto-translate logic
watch(editedText, (newText) => {
  if (!newText || newText.length < 10 || !activeSuggestion.value) return;

  const targetLang = selectedLang.value || data.value?.comment?.detectedLang;
  if (targetLang === locale.value) return;

  if (translateTimeout) clearTimeout(translateTimeout);

  translateTimeout = setTimeout(async () => {
    // Don't translate if it's the same as what we already have
    if (
      newText.trim() ===
      (activeSuggestion.value?.editedText ||
        activeSuggestion.value?.responseText)
    )
      return;

    isTranslating.value = true;
    try {
      const { translation } = await $fetch<{ translation: string }>(
        "/api/utils/translate",
        {
          method: "POST",
          body: {
            text: newText,
            targetLang: userLangName.value,
          },
          headers: useCsrfHeaders(),
        },
      );
      if (activeSuggestion.value) {
        activeSuggestion.value.verificationTranslation = translation;
      }
    } catch (err) {
      console.error("Auto-translation failed:", err);
    } finally {
      isTranslating.value = false;
    }
  }, 1500);
});
const additionalContext = ref("");
const activeSuggestion = ref<SuggestedReply | null>(null);
const publishConfirmed = ref(false);
const selectedLang = ref<string>("");
const selectedStatus = ref<string>("");
const showDeleteModal = ref(false);
const showBanModal = ref(false);
const showUnbanModal = ref(false);
const deleting = ref(false);
const banning = ref(false);
const unbanning = ref(false);
const isEditing = ref(false);
const regenerating = ref(false);

const { data, refresh, error } = await useFetch<CommentDetailResponse>(
  `/api/comments/${id}`,
);

const { data: commenterHistory } = useFetch<CommenterHistory>(
  `/api/comments/${id}/commenter-history`,
  { lazy: true },
);

function parseOpportunityFlags(
  flags: string | string[] | null | undefined,
): string[] {
  if (!flags) return [];
  if (Array.isArray(flags)) return flags;
  try {
    return JSON.parse(flags as string);
  } catch {
    return [];
  }
}

async function continueConversation() {
  regenerating.value = true;
  try {
    // 1. Unlock the thread and create a manual placeholder suggestion
    const res = await $fetch<{ suggestionId: number }>(
      `/api/comments/${id}/manual-suggest`,
      {
        method: "POST",
        headers: useCsrfHeaders(),
      },
    );

    // 2. Update status locally
    if (data.value?.comment) data.value.comment.status = "pending";

    // 3. Clear local state to force the watcher to pick up the new manual suggestion
    activeSuggestion.value = null;
    if (data.value) data.value.publishedReply = null;

    // 4. Refresh to get the new manual suggestion
    await refresh();

    // 5. Set up for immediate editing
    editedText.value = "";
    isEditing.value = true;

    toast.add({
      title: t("comment_detail.conversation_reopened"),
      description: t("comment_detail.ready_for_manual_reply"),
      color: "indigo",
    });
  } catch (err) {
    toast.add({ title: t("comment_detail.load_error"), color: "red" });
  } finally {
    regenerating.value = false;
  }
}

async function continueWithAi() {
  await continueConversation();
  await generateSuggestion();
}

watch(
  () => data.value?.comment?.status,
  (status) => {
    if (status) selectedStatus.value = status;
  },
  { immediate: true },
);

watch(
  () => data.value?.comment?.detectedLang,
  (lang) => {
    if (lang && !selectedLang.value) selectedLang.value = lang;
  },
  { immediate: true },
);

const LANGUAGES = [
  { label: "🌐 Auto-detected", value: "" },
  { label: "🇪🇸 Spanish (es)", value: "es" },
  { label: "🇬🇧 English (en)", value: "en" },
  { label: "🇧🇷 Portuguese (pt)", value: "pt" },
  { label: "🇫🇷 French (fr)", value: "fr" },
  { label: "🇩🇪 German (de)", value: "de" },
  { label: "🇮🇹 Italian (it)", value: "it" },
  { label: "🇳🇱 Dutch (nl)", value: "nl" },
  { label: "🇵🇱 Polish (pl)", value: "pl" },
  { label: "🇷🇺 Russian (ru)", value: "ru" },
  { label: "🇯🇵 Japanese (ja)", value: "ja" },
  { label: "🇨🇳 Chinese (zh)", value: "zh" },
  { label: "🇸🇦 Arabic (ar)", value: "ar" },
  { label: "🇰🇷 Korean (ko)", value: "ko" },
  { label: "🇹🇷 Turkish (tr)", value: "tr" },
  { label: "🇸🇪 Swedish (sv)", value: "sv" },
  { label: "🇳🇴 Norwegian (no)", value: "no" },
  { label: "🇩🇰 Danish (da)", value: "da" },
  { label: "🇫🇮 Finnish (fi)", value: "fi" },
  { label: "🇨🇦 Catalan (ca)", value: "ca" },
  { label: "🇨🇿 Czech (cs)", value: "cs" },
];

const STATUS_OPTIONS = computed(() => [
  { label: "⏳ " + t("status.pending"), value: "pending" },
  { label: "✨ " + t("status.suggested"), value: "suggested" },
  { label: "❌ " + t("status.dismissed"), value: "dismissed" },
  { label: "✅ " + t("status.published"), value: "published" },
  { label: "⏭️ " + t("status.skipped"), value: "skipped" },
]);

watch(
  selectedLang,
  async (lang) => {
    await $fetch(`/api/comments/${id}`, {
      method: "PATCH",
      body: { detectedLang: lang || null },
      headers: useCsrfHeaders(),
    });
    if (data.value?.comment) data.value.comment.detectedLang = lang || null;
    toast.add({ title: t("comment_detail.language_saved"), color: "green" });
  },
  { immediate: false },
);

watch(
  selectedStatus,
  async (status) => {
    if (!status || status === data.value?.comment?.status) return;
    await $fetch(`/api/comments/${id}`, {
      method: "PATCH",
      body: { status },
      headers: useCsrfHeaders(),
    });
    if (data.value?.comment) data.value.comment.status = status as any;
    toast.add({
      title: t("comment_detail.status_updated", { status }),
      color: "green",
    });
  },
  { immediate: false },
);

watch(
  () => [
    data.value?.suggestions,
    data.value?.publishedReply,
    data.value?.comment?.status,
  ],
  ([suggestions, published, status]) => {
    if (!suggestions?.length) {
      activeSuggestion.value = null;
      return;
    }

    // ONLY link to published suggestion if the comment is currently in published state
    if (status === "published" && (published as any)?.suggestionId) {
      const linked = (suggestions as SuggestedReply[]).find(
        (s) => s.id === (published as any).suggestionId,
      );
      if (linked) {
        activeSuggestion.value = linked;
        editedText.value = linked.editedText ?? linked.responseText;
        return;
      }
    }

    // Default to the LATEST suggestion (which will be the new one if we just generated/opened)
    // We update if there's no active suggestion OR if the latest suggestion is different from the current one
    // and we are in a non-published state (meaning we just moved to pending/suggested)
    const latest = suggestions[0] as SuggestedReply;
    if (status !== "published" || !activeSuggestion.value) {
      activeSuggestion.value = latest;
      editedText.value = latest.editedText ?? latest.responseText;
    }
  },
  { immediate: true },
);

async function generateSuggestion() {
  generating.value = true;
  try {
    await $fetch(`/api/comments/${id}/suggest`, {
      method: "POST",
      body: {
        additionalContext: additionalContext.value,
        targetLang: selectedLang.value,
        userLang: userLangName.value,
      },
      headers: useCsrfHeaders(),
    });

    // Refresh the data to get the new suggestion
    await refresh();

    // Force update the editor with the new response
    if (data.value?.suggestions?.length) {
      const latest = data.value.suggestions[0] as SuggestedReply;
      activeSuggestion.value = latest;
      // ALWAYS overwrite if we explicitly called generate
      editedText.value = latest.responseText;
      isEditing.value = true;

      toast.add({
        title: t("comment_detail.suggestion_generated"),
        icon: "i-heroicons-sparkles",
        color: "emerald",
      });
    }
  } catch (err) {
    toast.add({ title: t("comment_detail.generation_failed"), color: "red" });
  } finally {
    generating.value = false;
  }
}

async function saveEdit() {
  if (!activeSuggestion.value) return;
  const res = await $fetch<{
    ok: boolean;
    suggestion?: { verificationTranslation: string; videoLinksUsed: any[] };
  }>(`/api/suggestions/${activeSuggestion.value.id}`, {
    method: "PATCH",
    body: {
      editedText: editedText.value,
      userLang: userLangName.value,
    },
    headers: useCsrfHeaders(),
  });

  if (res.ok && res.suggestion) {
    activeSuggestion.value.verificationTranslation =
      res.suggestion.verificationTranslation;
    activeSuggestion.value.videoLinksUsed = res.suggestion.videoLinksUsed;
  }

  toast.add({ title: t("comment_detail.reply_saved"), color: "green" });
}

async function dismissComment() {
  await $fetch(`/api/comments/${id}/dismiss`, {
    method: "POST",
    headers: useCsrfHeaders(),
  });
  toast.add({ title: t("comment_detail.comment_dismissed") });
  if (window.history.length > 1) {
    router.back();
  } else {
    await navigateTo("/comments");
  }
}

async function undismissComment() {
  await $fetch(`/api/comments/${id}/undismiss`, {
    method: "POST",
    headers: useCsrfHeaders(),
  });
  toast.add({ title: t("comment_detail.comment_restored"), color: "green" });
  await refresh();
}

async function publishReply() {
  if (!activeSuggestion.value || !publishConfirmed.value) return;
  publishing.value = true;
  try {
    if (
      editedText.value !==
      (activeSuggestion.value.editedText ?? activeSuggestion.value.responseText)
    ) {
      await saveEdit();
    }
    await $fetch(`/api/comments/${id}/publish`, {
      method: "POST",
      body: { suggestionId: activeSuggestion.value.id },
      headers: useCsrfHeaders(),
    });
    toast.add({ title: t("comment_detail.reply_published"), color: "green" });
    showPublishModal.value = false;
    if (window.history.length > 1) {
      router.back();
    } else {
      await navigateTo("/comments");
    }
  } catch (err: any) {
    toast.add({
      title: err.data?.statusMessage ?? "Failed to publish",
      color: "red",
    });
  } finally {
    publishing.value = false;
  }
}

const failedThumbnails = ref<Record<string, boolean>>({});

function highResThumbnail(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const match = url.match(/\/vi\/([^\/\?]+)/);
  if (match) return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
  return url.replace("mqdefault.jpg", "maxresdefault.jpg");
}

function handleThumbnailError(key: string, videoId: string, event: Event) {
  const img = event.target as HTMLImageElement;
  const max = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
  const mq = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  if (!img.src.includes('img.youtube.com/vi/')) {
    img.src = max;
  } else if (img.src.includes('maxresdefault')) {
    img.src = mq;
  } else {
    failedThumbnails.value[key] = true;
  }
}

const finalText = computed(
  () =>
    editedText.value ||
    activeSuggestion.value?.editedText ||
    activeSuggestion.value?.responseText ||
    "",
);

const showTranslationVerification = computed(() => {
  if (!activeSuggestion.value?.verificationTranslation) return false;
  const replyLang = selectedLang.value || data.value?.comment?.detectedLang;
  return replyLang !== locale.value;
});

const confidence = computed(() => activeSuggestion.value?.confidenceScore ?? 0);
const confidenceLabel = computed(
  () => `${Math.round(confidence.value * 100)}%`,
);
const statusColor = (s: string) => {
  switch (s) {
    case "pending":
      return "yellow";
    case "suggested":
      return "orange";
    case "dismissed":
      return "red";
    case "published":
      return "green";
    case "skipped":
      return "blue";
    default:
      return "gray";
  }
};

const confidenceColor = computed(() => {
  return statusColor(selectedStatus.value);
});
const confidenceBarClass = computed(() =>
  confidence.value >= 0.7
    ? "bg-emerald-500"
    : confidence.value >= 0.4
      ? "bg-amber-500"
      : "bg-red-500",
);
const confidenceTextClass = computed(() =>
  confidence.value >= 0.7
    ? "text-emerald-400"
    : confidence.value >= 0.4
      ? "text-amber-400"
      : "text-red-400",
);

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t("time.just_now");
  if (mins < 60) return t("time.minutes_ago", { m: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t("time.hours_ago", { h: hrs });
  return t("time.days_ago", { d: Math.floor(hrs / 24) });
}

const effectiveVideoLinks = computed(() => {
  if (!activeSuggestion.value) return [];

  const text = editedText.value || "";
  const urlRegex =
    /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/g;
  const matches = [...text.matchAll(urlRegex)];
  const detectedIds = [...new Set(matches.map((m) => m[1]))];

  // Use metadata from current suggestion if available
  const metaMap = new Map(
    (activeSuggestion.value.videoLinksUsed || []).map((v) => [v.video_id, v]),
  );

  return detectedIds.map((id) => {
    if (metaMap.has(id)) return metaMap.get(id)!;
    return {
      video_id: id,
      video_title: `ID: ${id}`,
      url: `https://youtu.be/${id}`,
      thumbnail_url: `https://img.youtube.com/vi/${id}/mqdefault.jpg`,
    };
  });
});

const highlightedTextParts = computed(() => {
  const text = editedText.value || "";
  const urlRegex = /(https?:\/\/[^\s,]+|www\.[^\s,]+)/g;
  const parts = [];
  let lastIdx = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push({ text: text.substring(lastIdx, match.index), isUrl: false });
    }
    const url = match[0];
    parts.push({
      text: url,
      isUrl: true,
      href: url.startsWith("www.") ? "https://" + url : url,
    });
    lastIdx = match.index + match[0].length;
  }

  if (lastIdx < text.length) {
    parts.push({ text: text.substring(lastIdx), isUrl: false });
  }

  return parts;
});

function startEditing() {
  if (data.value?.comment?.status === "published") return;
  isEditing.value = true;
  nextTick(() => {
    const textarea = document.querySelector(
      ".premium-textarea",
    ) as HTMLTextAreaElement;
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
  });
}

async function confirmDelete() {
  deleting.value = true;
  try {
    await $fetch(`/api/comments/${id}`, {
      method: "DELETE",
      headers: useCsrfHeaders(),
    });
    toast.add({ title: t("comment_detail.comment_deleted"), color: "green" });
    showDeleteModal.value = false;
    await navigateTo("/comments");
  } catch (err: any) {
    toast.add({
      title: err.data?.statusMessage ?? "Failed to delete",
      color: "red",
    });
  } finally {
    deleting.value = false;
  }
}

async function confirmBan() {
  banning.value = true;
  try {
    await $fetch(`/api/comments/${id}/ban`, {
      method: "POST",
      headers: useCsrfHeaders(),
    });
    toast.add({ title: t("comment_detail.user_banned"), color: "green" });
    showBanModal.value = false;
    await refresh();
  } catch (err: any) {
    toast.add({
      title: err.data?.statusMessage ?? "Failed to ban user",
      color: "red",
    });
  } finally {
    banning.value = false;
  }
}

async function confirmUnban() {
  unbanning.value = true;
  try {
    const res = await $fetch<{ message: string }>(`/api/comments/${id}/unban`, {
      method: "POST",
      headers: useCsrfHeaders(),
    });
    toast.add({ title: t("comment_detail.user_unbanned"), color: "green" });
    if (res.message) {
      toast.add({ title: res.message, color: "blue", timeout: 10000 });
    }
    showUnbanModal.value = false;
    await refresh();
  } catch (err: any) {
    toast.add({
      title: err.data?.statusMessage ?? "Failed to unban user",
      color: "red",
    });
  } finally {
    unbanning.value = false;
  }
}
</script>

<style scoped>
.glass-card {
  @apply bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-3xl transition-all duration-300;
  box-shadow:
    0 4px 24px -1px rgba(0, 0, 0, 0.2),
    inset 0 1px 1px 0 rgba(255, 255, 255, 0.05);
}

.glass-card:hover {
  @apply border-white/[0.12] bg-white/[0.04];
  box-shadow:
    0 12px 40px -4px rgba(0, 0, 0, 0.3),
    inset 0 1px 1px 0 rgba(255, 255, 255, 0.08);
}

.premium-btn-primary {
  @apply relative overflow-hidden px-6 py-3 rounded-2xl font-bold text-sm transition-all duration-300 cursor-pointer;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  box-shadow: 0 8px 20px -4px rgba(79, 70, 229, 0.4);
}

.premium-btn-primary:hover {
  @apply -translate-y-0.5;
  box-shadow: 0 12px 28px -4px rgba(79, 70, 229, 0.5);
  background: linear-gradient(135deg, #818cf8 0%, #6366f1 100%);
}

.premium-btn-primary:active {
  @apply translate-y-0 scale-[0.98];
}

.premium-btn-success {
  @apply relative overflow-hidden px-6 py-4 rounded-2xl font-bold text-sm transition-all duration-300 cursor-pointer;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  box-shadow: 0 8px 20px -4px rgba(16, 185, 129, 0.4);
}

.premium-btn-success:hover {
  @apply -translate-y-0.5;
  box-shadow: 0 12px 28px -4px rgba(16, 185, 129, 0.5);
  background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
}

.animate-fade-in {
  animation: fadeIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.animate-slide-up {
  opacity: 0;
  transform: translateY(20px);
  animation: slideUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes slideUp {
  to {
    opacity: 1;
    transform: translateY(0);
  }
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

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}

.premium-textarea-container {
  @apply relative min-h-[140px] rounded-2xl bg-white/[0.02] border border-white/[0.06] transition-all duration-500 overflow-hidden;
}

.premium-textarea-container:hover {
  @apply border-white/[0.1] bg-white/[0.04];
}

.premium-textarea-container.is-editing {
  @apply ring-2 ring-indigo-500/20 border-indigo-500/40 bg-white/[0.05];
}

.reply-viewer,
.premium-textarea {
  @apply w-full p-6 text-base leading-relaxed font-medium whitespace-pre-wrap break-words;
}

.premium-textarea {
  @apply bg-transparent text-slate-200 focus:outline-none resize-none;
}

.reply-viewer {
  @apply text-slate-300 cursor-text;
}

.inline-url-badge {
  @apply inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 font-bold hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all duration-300 cursor-pointer shadow-sm mx-0.5;
}
</style>

<template>
  <div>
    <div class="flex items-center justify-between mb-6 sm:mb-8 animate-fade-in">
      <div class="flex items-center gap-3 sm:gap-4">
        <button
          @click="handleBack"
          class="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-300 group cursor-pointer shrink-0"
        >
          <UIcon
            name="i-heroicons-chevron-left"
            class="w-4 h-4 sm:w-5 sm:h-5 group-hover:-translate-x-0.5 transition-transform"
          />
        </button>
        <div class="flex flex-col min-w-0">
          <div
            class="flex items-center gap-2 text-[12px] font-bold text-indigo-400 uppercase tracking-[0.3em]"
          >
            <UIcon name="i-heroicons-shield-check" class="w-3 h-3 shrink-0" />
            <span class="truncate">{{
              $t("comment_detail.terminal_label")
            }}</span>
          </div>
          <h1
            class="text-xl sm:text-2xl font-black text-white tracking-tighter truncate"
          >
            {{ $t("comment_detail.title") }}
          </h1>
        </div>
      </div>
    </div>

    <div
      v-if="error"
      class="flex flex-col items-center justify-center py-20 text-center animate-fade-in"
    >
      <div
        class="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20"
      >
        <UIcon
          name="i-heroicons-exclamation-circle"
          class="w-10 h-10 text-red-500"
        />
      </div>
      <h2 class="text-xl font-black text-white mb-2 tracking-tight">
        {{
          error.statusCode === 404
            ? $t("comment_detail.not_found")
            : $t("comment_detail.load_error")
        }}
      </h2>
      <p class="text-slate-500 text-sm max-w-xs mx-auto mb-8">
        {{
          error.statusCode === 404
            ? $t("comment_detail.not_found_desc")
            : $t("comment_detail.load_error_desc")
        }}
      </p>
      <UButton
        color="white"
        variant="solid"
        size="md"
        class="rounded-xl font-bold px-8"
        @click="navigateTo('/comments')"
      >
        {{ $t("comment_detail.go_back") }}
      </UButton>
    </div>

    <div v-else-if="!data" class="flex items-center justify-center py-20">
      <div class="text-center">
        <div
          class="w-8 h-8 border-2 border-indigo-500/40 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3"
        />
        <p class="text-slate-500 text-sm">{{ $t("comment_detail.loading") }}</p>
      </div>
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      <!-- Left: Comment info (5/12) -->
      <div class="lg:col-span-5 space-y-6">
        <!-- Unified Conversation Hub -->
        <div
          class="glass-card animate-slide-up stagger-1 flex flex-col md:min-h-[600px]"
        >
          <div
            class="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.01]"
          >
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-chat-bubble-left-right"
                class="w-4 h-4 text-indigo-400"
              />
              <span class="font-bold text-sm text-slate-200 tracking-tight">{{
                $t("comment_detail.conversation_flow", {
                  n: data.replies?.length + 1,
                })
              }}</span>
              <span class="text-[8px] text-slate-600 ml-2">({{ userLangName }})</span>
            </div>
            <UBadge
              :color="confidenceColor"
              variant="subtle"
              size="xs"
              class="rounded-full px-3 py-1 font-bold uppercase"
            >
              {{ $t("status." + selectedStatus) }}
            </UBadge>
          </div>

          <div
            class="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-black/20"
          >
            <!-- Source Video (Compact) -->
            <div v-if="data.video" class="mb-8">
              <a
                :href="`https://www.youtube.com/watch?v=${data.video.id}`"
                target="_blank"
                class="group/video flex items-center gap-4 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] transition-all"
              >
                <div
                  class="relative w-24 aspect-video rounded-lg overflow-hidden flex-shrink-0"
                >
                  <img
                    v-if="!failedThumbnails['video-' + data.video.id]"
                    :src="highResThumbnail(data.video.thumbnailUrl)"
                    class="w-full h-full object-cover opacity-60 group-hover/video:opacity-100 transition-opacity"
                    referrerpolicy="no-referrer"
                    crossorigin="anonymous"
                    @error="handleThumbnailError('video-' + data.video.id, data.video.id, $event)"
                  />
                  <div
                    class="absolute inset-0 flex items-center justify-center"
                  >
                    <UIcon
                      name="i-heroicons-play-solid"
                      class="w-6 h-6 text-white/50 group-hover/video:text-white transition-colors"
                    />
                  </div>
                </div>
                <div class="min-w-0">
                  <p
                    class="text-[12px] font-black text-indigo-400 uppercase tracking-widest mb-1"
                  >
                    {{ $t("comment_detail.source_video") }}
                  </p>
                  <h4
                    class="text-xs font-bold text-slate-300 truncate group-hover/video:text-indigo-300 transition-colors"
                  >
                    {{ data.video.title }}
                  </h4>
                </div>
              </a>
            </div>

            <!-- Original Comment (The Start) -->
            <div class="flex flex-col gap-2 items-start">
              <div class="flex items-center gap-2 ml-1 flex-wrap">
                <a
                  v-if="data.comment.authorChannelId"
                  :href="`https://www.youtube.com/channel/${data.comment.authorChannelId}`"
                  target="_blank"
                  rel="noreferrer"
                  class="flex items-center gap-2 group/author"
                >
                  <UAvatar
                    :src="
                      data.comment.authorProfileImageUrl ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(data.comment.authorName)}&background=6366f1&color=fff`
                    "
                    size="sm"
                    class="ring-1 ring-white/10 group-hover/author:ring-indigo-500/50 transition-all"
                    :img-attributes="{
                      referrerpolicy: 'no-referrer',
                      crossorigin: 'anonymous',
                    }"
                  />
                  <span
                    class="text-[12px] font-bold text-slate-400 group-hover/author:text-indigo-400 transition-colors"
                    >{{ data.comment.authorName }}</span
                  >
                </a>
                <template v-else>
                  <UAvatar
                    :src="
                      data.comment.authorProfileImageUrl ||
                      `https://ui-avatars.com/api/?name=${encodeURIComponent(data.comment.authorName)}&background=6366f1&color=fff`
                    "
                    size="sm"
                    class="ring-1 ring-white/10"
                    :img-attributes="{ referrerpolicy: 'no-referrer' }"
                  />
                  <span class="text-[12px] font-bold text-slate-400">{{
                    data.comment.authorName
                  }}</span>
                </template>
                <span class="text-[9px] text-slate-600 uppercase">{{
                  timeAgo(data.comment.publishedAt)
                }}</span>
                <!-- Language badge -->
                <span
                  v-if="selectedLang"
                  class="flex items-center gap-1.5 px-1.5 py-0.5 rounded border text-[8px] font-black uppercase text-indigo-300 bg-indigo-500/10 border-white/10"
                >
                  <span>{{ langFlag[selectedLang] || '🌐' }}</span>
                  <span>{{ languageNames[selectedLang] || selectedLang }}</span>
                </span>
                <!-- Return commenter badge -->
                <span
                  v-if="data.comment.isReturnCommenter"
                  class="flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[8px] font-black uppercase text-violet-400 bg-violet-500/10 border-violet-500/20"
                >
                  <UIcon name="i-heroicons-user-circle" class="w-2.5 h-2.5" />
                  FAN
                </span>
                <!-- Opportunity flags -->
                <span
                  v-for="flag in parseOpportunityFlags(
                    data.comment.opportunityFlags,
                  )"
                  :key="flag"
                  class="flex items-center gap-0.5 px-1.5 py-0.5 rounded border text-[8px] font-black uppercase text-yellow-400 bg-yellow-500/10 border-yellow-500/20"
                >
                  <UIcon name="i-heroicons-star" class="w-2.5 h-2.5" />
                  {{ flag }}
                </span>
              </div>
              <div
                class="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl rounded-tl-none p-4 text-sm text-slate-200 leading-relaxed shadow-sm max-w-[85%]"
              >
                <div v-html="renderCommentHtml(data.comment.text)"></div>
                
                <!-- Translation -->
                <div v-if="data.comment.translatedText && data.comment.translatedText !== data.comment.text" class="mt-3 pt-3 border-t border-white/5 opacity-80">
                  <div class="flex items-center gap-1.5 mb-1.5">
                    <UIcon name="i-heroicons-language" class="w-3 h-3 text-indigo-400" />
                    <span class="text-[9px] font-black uppercase tracking-widest text-indigo-400">TRADUCCIÓN</span>
                  </div>
                  <p class="text-xs italic text-slate-300 leading-relaxed">
                    {{ data.comment.translatedText }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Replies (The Thread) -->
            <template v-for="reply in data.replies" :key="reply.id">
              <div
                class="flex flex-col gap-2"
                :class="reply.isOwner ? 'items-end' : 'items-start'"
              >
                <div
                  class="flex items-center gap-2 mx-1"
                  :class="reply.isOwner ? 'flex-row-reverse' : 'flex-row'"
                >
                  <a
                    v-if="
                      reply.isOwner
                        ? data.ownerChannelId
                        : reply.authorChannelId
                    "
                    :href="`https://www.youtube.com/channel/${reply.isOwner ? data.ownerChannelId : reply.authorChannelId}`"
                    target="_blank"
                    rel="noreferrer"
                    class="flex items-center gap-2 group/reply-author"
                  >
                    <UAvatar
                      :src="
                        reply.isOwner
                          ? data.ownerThumbnail || '/img/placeholder-avatar.png'
                          : reply.authorProfileImageUrl ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(reply.authorName)}&background=475569&color=fff`
                      "
                      size="sm"
                      :ui="{ rounded: 'rounded-full' }"
                      class="ring-1 ring-white/10 group-hover/reply-author:ring-indigo-500/50 transition-all shadow-lg"
                      :alt="reply.isOwner ? 'You' : reply.authorName"
                      :img-attributes="{
                        referrerpolicy: 'no-referrer',
                        crossorigin: 'anonymous',
                      }"
                    />
                    <span
                      class="text-[12px] font-bold group-hover/reply-author:text-indigo-400 transition-colors"
                      :class="
                        reply.isOwner ? 'text-emerald-400' : 'text-slate-400'
                      "
                    >
                      {{
                        reply.isOwner
                          ? $t("comment_detail.you")
                          : reply.authorName
                      }}
                    </span>
                  </a>

                  <template v-else>
                    <UAvatar
                      :src="
                        reply.isOwner
                          ? data.ownerThumbnail || '/img/placeholder-avatar.png'
                          : reply.authorProfileImageUrl ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(reply.authorName)}&background=475569&color=fff`
                      "
                      size="sm"
                      :ui="{ rounded: 'rounded-lg' }"
                      class="ring-1 ring-white/10"
                      :alt="reply.isOwner ? 'You' : reply.authorName"
                      :img-attributes="{
                        referrerpolicy: 'no-referrer',
                        crossorigin: 'anonymous',
                      }"
                    />
                    <span
                      class="text-[12px] font-bold"
                      :class="
                        reply.isOwner ? 'text-emerald-400' : 'text-slate-400'
                      "
                    >
                      {{
                        reply.isOwner
                          ? $t("comment_detail.you")
                          : reply.authorName
                      }}
                    </span>
                  </template>
                  <span class="text-[9px] text-slate-600 uppercase ml-1">{{
                    timeAgo(reply.publishedAt)
                  }}</span>
                  <!-- Reply Language badge -->
                  <span
                    v-if="reply.detectedLang && !reply.isOwner"
                    class="flex items-center gap-1 px-1 py-0.5 rounded bg-white/[0.03] border border-white/5 text-[7px] font-black uppercase text-slate-500"
                  >
                    <span>{{ langFlag[reply.detectedLang] || '🌐' }}</span>
                    <span>{{ reply.detectedLang }}</span>
                  </span>
                </div>
                <div
                  class="p-4 text-sm leading-relaxed shadow-sm max-w-[85%]"
                  :class="
                    reply.isOwner
                      ? 'bg-emerald-500/10 border border-emerald-500/20 rounded-2xl rounded-tr-none text-emerald-50'
                      : 'bg-white/[0.04] border border-white/[0.08] rounded-2xl rounded-tl-none text-slate-200'
                  "
                >
                  <div v-html="renderCommentHtml(reply.text)"></div>
                  
                  <!-- Translation for replies -->
                  <div v-if="reply.translatedText && reply.translatedText !== reply.text" class="mt-3 pt-3 border-t border-white/5 opacity-80">
                    <div class="flex items-center gap-1.5 mb-1.5">
                      <UIcon name="i-heroicons-language" class="w-3 h-3 text-indigo-400" />
                      <span class="text-[9px] font-black uppercase tracking-widest text-indigo-400">TRADUCCIÓN</span>
                    </div>
                    <p class="text-xs italic text-slate-300 leading-relaxed">
                      {{ reply.translatedText }}
                    </p>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Bottom Footer (Actions) -->
          <div class="p-4 border-t border-white/[0.06] bg-white/[0.01]">
            <button
              v-if="data.comment.status === 'published'"
              class="w-full group flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 hover:border-indigo-500/30 transition-all duration-300"
              @click="continueConversation"
            >
              <UIcon
                name="i-heroicons-chat-bubble-left-right"
                class="w-5 h-5 group-hover:scale-110 transition-transform"
              />
              <span class="text-xs font-black uppercase tracking-[0.2em]">{{
                $t("comment_detail.continue_thread")
              }}</span>
            </button>
            <div v-else class="text-center py-2">
              <span
                class="text-[12px] font-black text-slate-600 uppercase tracking-[0.3em]"
                >{{ $t("comment_detail.active_session") }}</span
              >
            </div>
          </div>
        </div>

        <!-- Danger actions -->
        <div class="flex gap-2 !mt-4">
          <button
            class="px-4 flex items-center justify-center text-center w-1/2 py-4 rounded-xl border border-red-500/10 bg-red-500/5 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 text-xs font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 cursor-pointer"
            @click="showDeleteModal = true"
          >
            <UIcon name="i-heroicons-trash" class="w-3.5 h-3.5" />
            {{ $t("comment_detail.delete_youtube") }}
          </button>
          <button
            v-if="!data.comment.isBanned"
            class="px-4 flex items-center justify-center text-center w-1/2 py-4 rounded-xl border border-red-500/10 bg-red-500/5 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 text-xs font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 cursor-pointer"
            @click="showBanModal = true"
          >
            <UIcon name="i-heroicons-no-symbol" class="w-3.5 h-3.5" />
            {{ $t("comment_detail.ban_user") }}
          </button>
          <button
            v-else
            class="px-4 py-2 rounded-xl border border-emerald-500/10 bg-emerald-500/5 text-emerald-500/60 hover:text-emerald-500 hover:bg-emerald-500/10 text-[12px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 cursor-pointer"
            @click="showUnbanModal = true"
          >
            <UIcon name="i-heroicons-check-circle" class="w-3.5 h-3.5" />
            {{ $t("comment_detail.unban_user") }}
          </button>
        </div>

        <div class="flex">
          <button
            v-if="data.comment?.status === 'dismissed'"
            class="px-5 py-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 text-sm font-bold transition-all duration-300 flex items-center gap-2 cursor-pointer"
            @click="undismissComment"
          >
            <UIcon name="i-heroicons-arrow-uturn-left" class="w-4 h-4" />
            {{ $t("comment_detail.restore") }}
          </button>
          <button
            v-if="
              data.comment?.status !== 'dismissed' &&
              data.comment?.status !== 'published'
            "
            class="px-5 mb-6 py-3 rounded-2xl border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 text-sm font-bold transition-all duration-300 flex items-center gap-2 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
            @click="dismissComment"
          >
            <UIcon name="i-heroicons-archive-box" class="w-4 h-4" />
            {{ $t("comment_detail.dismiss") }}
          </button>
        </div>

        <!-- Commenter History Panel -->
        <div
          v-if="commenterHistory && commenterHistory.total > 1"
          class="glass-card p-5 animate-fade-in"
        >
          <div
            class="flex flex-col md:flex-row items-baseline justify-between mb-4"
          >
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-user-circle"
                class="w-4 h-4 text-violet-400"
              />
              <span
                class="text-[12px] font-black text-violet-400 uppercase tracking-[0.2em]"
              >
                {{ $t("comment_detail.commenter_history") }}
              </span>
            </div>
            <div
              class="flex items-center gap-3 text-[12px] font-bold text-slate-500"
            >
              <span class="flex items-center gap-1">
                <UIcon name="i-heroicons-chat-bubble-left" class="w-3 h-3" />
                {{ commenterHistory.total }}
                {{ $t("comment_detail.comments_total") }}
              </span>
              <span
                v-if="commenterHistory.totalLikes > 0"
                class="flex items-center gap-1"
              >
                <UIcon name="i-heroicons-hand-thumb-up" class="w-3 h-3" />
                {{ commenterHistory.totalLikes }}
              </span>
            </div>
          </div>
          <div class="space-y-2">
            <NuxtLink
              v-for="item in commenterHistory.items"
              :key="item.id"
              :to="`/comments/${item.id}`"
              class="flex items-start gap-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.09] transition-all group"
            >
              <UBadge
                :color="statusColor(item.status)"
                variant="soft"
                size="xs"
                class="rounded mt-0.5 shrink-0 text-[8px] font-black"
              >
                {{ item.status.toUpperCase() }}
              </UBadge>
              <div class="min-w-0 flex-1">
                <p class="text-[11px] text-slate-400 line-clamp-2 italic">
                  "<span v-html="renderCommentHtml(item.text)"></span>"
                </p>
                <p class="text-[9px] text-slate-600 mt-0.5 truncate">
                  {{ item.videoTitle }}
                </p>
              </div>
              <UIcon
                name="i-heroicons-arrow-right"
                class="w-3 h-3 text-slate-700 group-hover:text-indigo-400 shrink-0 mt-1 transition-colors"
              />
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Right: Command Center (7/12) -->
      <div class="lg:col-span-7 space-y-6">
        <!-- 1. Meta Control Panel (Status & Language) -->
        <div class="glass-card p-6 animate-fade-in stagger-1">
          <div class="grid grid-cols-2 gap-6">
            <div class="space-y-2">
              <label
                class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1"
                >{{ $t("comment_detail.current_state") }}</label
              >
              <USelect
                v-model="selectedStatus"
                :options="STATUS_OPTIONS"
                value-attribute="value"
                option-attribute="label"
                size="sm"
                variant="none"
                class="w-full bg-white/[0.03] border border-white/10 rounded-xl hover:border-indigo-500/50 transition-colors"
              />
            </div>
            <div class="space-y-2">
              <label
                class="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] ml-1"
                >{{ $t("comment_detail.reply_language") }}</label
              >
              <USelect
                v-model="selectedLang"
                :options="LANGUAGES"
                value-attribute="value"
                option-attribute="label"
                size="sm"
                variant="none"
                class="w-full bg-white/[0.03] border border-white/10 rounded-xl hover:border-indigo-500/50 transition-colors"
              />
            </div>
          </div>
        </div>

        <!-- 2. Active Intelligence Workspace (Prioritized) -->
        <div
          v-if="
            isEditing ||
            (data.comment?.status !== 'published' &&
              data.comment?.status !== 'dismissed')
          "
          class="space-y-6 animate-fade-in"
        >
          <!-- Main Work Card -->
          <div
            class="glass-card overflow-hidden border-indigo-500/10 shadow-[0_0_50px_rgba(79,70,229,0.08)]"
          >
            <div
              class="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-indigo-500/[0.02]"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  name="i-heroicons-pencil-square"
                  class="w-4 h-4 text-indigo-400"
                />
                <span
                  class="font-black text-sm text-white tracking-tighter uppercase"
                  >{{ $t("comments.your_response") }}</span
                >
              </div>
              <div class="flex items-center gap-3">
                <div
                  v-if="activeSuggestion"
                  class="flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20"
                >
                  <div
                    class="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"
                  ></div>
                  <span
                    class="text-[9px] font-black text-indigo-400 uppercase tracking-widest"
                    >AI ACTIVE</span
                  >
                </div>
              </div>
            </div>

            <div class="p-6">
              <div class="premium-textarea-container group mb-6">
                <textarea
                  v-model="editedText"
                  rows="5"
                  class="premium-textarea min-h-[200px] text-lg leading-relaxed"
                  :placeholder="$t('comment_detail.refine_placeholder')"
                ></textarea>

                <div
                  class="absolute bottom-4 left-6 flex items-center gap-4 text-[12px] font-bold text-slate-600 uppercase tracking-widest"
                >
                  {{ editedText?.length || 0 }}
                  {{ $t("comment_detail.characters") }}
                </div>
              </div>

              <!-- Translation Preview (Directly under textarea) -->
              <div
                v-if="showTranslationVerification"
                class="mb-6 p-5 rounded-2xl bg-white/[0.02] border border-white/5 animate-fade-in"
              >
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <UIcon
                      name="i-heroicons-language"
                      class="w-3.5 h-3.5 text-slate-500"
                    />
                    <span
                      class="text-[9px] font-black text-slate-500 uppercase tracking-widest"
                      >{{ $t("comment_detail.verification_translation") }}</span
                    >
                  </div>
                  <div v-if="isTranslating" class="flex items-center gap-1.5">
                    <div
                      class="w-1 h-1 rounded-full bg-indigo-500 animate-ping"
                    ></div>
                    <span
                      class="text-[8px] font-bold text-indigo-400 uppercase tracking-widest"
                      >Sincronizando...</span
                    >
                  </div>
                </div>
                <p class="text-sm text-slate-400 italic leading-relaxed">
                  "{{ activeSuggestion.verificationTranslation }}"
                </p>
              </div>

              <!-- AI Control Center -->
              <div
                class="pt-6 border-t border-white/[0.06] bg-indigo-500/[0.01] -mx-6 px-6 -mb-6 pb-6"
              >
                <div class="flex flex-col gap-4">
                  <div class="flex items-center justify-between">
                    <div class="flex items-center gap-2">
                      <UIcon
                        name="i-heroicons-sparkles"
                        class="w-4 h-4 text-indigo-400"
                      />
                      <span
                        class="font-black text-[12px] text-slate-500 uppercase tracking-widest"
                        >{{ $t("comment_detail.ai_assistance") }}</span
                      >
                    </div>
                    <button
                      v-if="!showAiInstructions"
                      class="group flex items-center gap-1 text-[12px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors uppercase tracking-widest"
                      @click="showAiInstructions = true"
                    >
                      <UIcon
                        name="i-heroicons-plus-circle"
                        class="w-3.5 h-3.5 group-hover:rotate-90 transition-transform"
                      />
                      {{ $t("comment_detail.add_instructions") }}
                    </button>
                  </div>

                  <div
                    v-if="showAiInstructions"
                    class="space-y-4 animate-slide-up"
                  >
                    <textarea
                      v-model="additionalContext"
                      rows="3"
                      class="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-all resize-none shadow-inner"
                      :placeholder="$t('comment_detail.context_placeholder')"
                    ></textarea>
                    <div class="flex justify-end gap-3">
                      <button
                        class="px-4 py-2 text-[12px] font-bold text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-widest"
                        @click="showAiInstructions = false"
                      >
                        {{ $t("comment_detail.cancel") }}
                      </button>
                      <UButton
                        color="indigo"
                        variant="soft"
                        size="sm"
                        class="font-black tracking-widest uppercase px-6"
                        :loading="generating"
                        icon="i-heroicons-sparkles"
                        @click="generateSuggestion"
                      >
                        {{ $t("comment_detail.generate_draft") }}
                      </UButton>
                    </div>
                  </div>

                  <div v-else class="flex justify-center pt-2">
                    <UButton
                      color="indigo"
                      variant="ghost"
                      size="sm"
                      block
                      class="opacity-40 hover:opacity-100 transition-opacity font-black uppercase tracking-[0.3em] text-[12px] py-4"
                      :loading="generating"
                      icon="i-heroicons-sparkles"
                      @click="generateSuggestion"
                    >
                      {{ $t("comment_detail.quick_ai_draft") }}
                    </UButton>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Final High-Impact Action -->
          <div class="pt-4">
            <button
              class="premium-btn-success w-full flex items-center justify-center gap-4 py-7 shadow-[0_0_60px_rgba(16,185,129,0.2)] group relative overflow-hidden"
              :disabled="!editedText || publishing"
              @click="showPublishModal = true"
            >
              <div
                class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"
              ></div>
              <UIcon
                name="i-heroicons-rocket-launch"
                class="w-8 h-8 group-hover:scale-110 group-hover:-translate-y-1 transition-all duration-500 text-white"
              />
              <span
                class="font-black uppercase tracking-[0.4em] text-sm text-white"
                >{{ $t("comment_detail.deploy_to_youtube") }}</span
              >
            </button>
          </div>

          <!-- Contextual Intelligence Bits (References) -->
          <div
            v-if="activeSuggestion && effectiveVideoLinks.length"
            class="space-y-4 pt-6 animate-fade-in stagger-3"
          >
            <div class="flex items-center gap-2 ml-1">
              <UIcon name="i-heroicons-link" class="w-4 h-4 text-indigo-500" />
              <span
                class="text-[9px] text-slate-500 font-black uppercase tracking-widest"
                >{{ $t("comment_detail.referenced_intel") }}</span
              >
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                v-for="link in effectiveVideoLinks"
                :key="link.video_id"
                class="glass-card p-3 flex items-center gap-3 hover:border-indigo-500/30 transition-colors"
              >
                <img
                  v-if="!failedThumbnails['link-' + link.video_id]"
                  :src="highResThumbnail(link.thumbnail_url)"
                  class="w-16 aspect-video object-cover rounded shadow-lg"
                  referrerpolicy="no-referrer"
                  @error="handleThumbnailError('link-' + link.video_id, link.video_id, $event)"
                />
                <div v-else class="w-16 aspect-video rounded bg-slate-800 flex items-center justify-center">
                  <UIcon name="i-heroicons-video-camera" class="w-4 h-4 text-slate-600" />
                </div>
                <a
                  :href="link.url"
                  target="_blank"
                  class="text-[12px] font-bold text-slate-300 hover:text-indigo-400 line-clamp-1 transition-colors"
                  >{{ link.video_title }}</a
                >
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Intel Deployed Viewer (Success State) -->
        <div
          v-else-if="data.comment?.status === 'published' && !regenerating"
          class="space-y-6 animate-fade-in"
        >
          <div
            class="glass-card overflow-hidden border-emerald-500/20 bg-emerald-500/[0.01] shadow-[0_0_50px_rgba(16,185,129,0.05)]"
          >
            <div
              class="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-emerald-500/[0.02]"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  name="i-heroicons-check-badge"
                  class="w-4 h-4 text-emerald-400"
                />
                <span
                  class="font-black text-sm text-emerald-400 tracking-tighter uppercase"
                  >{{ $t("comment_detail.intel_deployed") }}</span
                >
              </div>
              <div class="flex items-center gap-2">
                <div
                  class="px-2 py-0.5 rounded text-[8px] font-black bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 uppercase tracking-widest"
                >
                  LIVE ON YOUTUBE
                </div>
              </div>
            </div>

            <div class="p-6">
              <div
                class="bg-black/40 border border-white/10 rounded-2xl p-6 text-left relative overflow-hidden shadow-inner"
              >
                <UIcon
                  name="i-heroicons-chat-bubble-left-right"
                  class="absolute -bottom-4 -right-4 w-24 h-24 text-emerald-500/[0.03]"
                />
                <p
                  class="text-md md:text-lg text-emerald-50/90 italic leading-relaxed relative z-10"
                >
                  "{{
                    data.replies.filter((r) => r.isOwner).at(-1)?.text ||
                    data.comment.text
                  }}"
                </p>
              </div>

              <!-- Success Translation Preview -->
              <div
                v-if="showTranslationVerification"
                class="mt-6 p-5 rounded-2xl bg-emerald-500/[0.03] border border-emerald-500/10 text-left animate-fade-in"
              >
                <div class="flex items-center gap-2 mb-3 opacity-50">
                  <UIcon
                    name="i-heroicons-language"
                    class="w-3.5 h-3.5 text-emerald-500"
                  />
                  <span
                    class="text-[9px] font-black text-emerald-500 uppercase tracking-widest"
                    >{{ $t("comment_detail.verification_translation") }}</span
                  >
                </div>
                <p class="text-sm text-emerald-100/60 italic leading-relaxed">
                  "{{ activeSuggestion?.verificationTranslation }}"
                </p>
              </div>
            </div>
          </div>

          <!-- Contextual Intelligence Bits (References) - Show even when published -->
          <div
            v-if="activeSuggestion && effectiveVideoLinks.length"
            class="space-y-4 pt-4 animate-fade-in"
          >
            <div class="flex items-center gap-2 ml-1">
              <UIcon name="i-heroicons-link" class="w-4 h-4 text-emerald-500" />
              <span
                class="text-[9px] text-slate-500 font-black uppercase tracking-widest"
                >{{ $t("comment_detail.referenced_intel") }}</span
              >
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div
                v-for="link in effectiveVideoLinks"
                :key="link.video_id"
                class="glass-card p-3 flex items-center gap-3 border-emerald-500/10 bg-emerald-500/[0.01] hover:border-emerald-500/30 transition-colors"
              >
                <img
                  v-if="!failedThumbnails['link-' + link.video_id]"
                  :src="highResThumbnail(link.thumbnail_url)"
                  class="w-16 aspect-video object-cover rounded shadow-lg"
                  referrerpolicy="no-referrer"
                  @error="handleThumbnailError('link-' + link.video_id, link.video_id, $event)"
                />
                <div v-else class="w-16 aspect-video rounded bg-slate-800 flex items-center justify-center">
                  <UIcon name="i-heroicons-video-camera" class="w-4 h-4 text-slate-600" />
                </div>
                <a
                  :href="link.url"
                  target="_blank"
                  class="text-[12px] font-bold text-slate-300 hover:text-emerald-400 line-clamp-1 transition-colors"
                  >{{ link.video_title }}</a
                >
              </div>
            </div>
          </div>
        </div>

        <!-- 4. Dismissed State -->
        <div
          v-else-if="data.comment?.status === 'dismissed'"
          class="glass-card py-24 text-center animate-fade-in grayscale"
        >
          <UIcon
            name="i-heroicons-archive-box"
            class="w-20 h-20 mx-auto text-slate-700 mb-6"
          />
          <h3
            class="text-xl font-black text-slate-500 uppercase tracking-widest"
          >
            {{ $t("comment_detail.comment_dismissed") }}
          </h3>
        </div>
      </div>
    </div>

    <!-- Publish modal -->
    <UModal
      v-model="showPublishModal"
      :ui="{
        width: 'sm:max-w-xl',
        container: 'items-center',
        background: 'bg-transparent',
        shadow: 'none',
      }"
    >
      <div
        class="glass-card overflow-hidden border-indigo-500/20 shadow-[0_0_50px_rgba(79,70,229,0.15)]"
      >
        <div
          class="px-8 py-6 border-b border-white/[0.06] flex items-center gap-3 bg-white/[0.01]"
        >
          <div
            class="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20"
          >
            <UIcon
              name="i-heroicons-paper-airplane"
              class="w-5 h-5 text-emerald-400"
            />
          </div>
          <div class="flex flex-col">
            <span
              class="text-[12px] font-bold text-emerald-500 uppercase tracking-widest"
              >{{ $t("comment_detail.final_confirmation") }}</span
            >
            <h2 class="font-black text-xl text-white tracking-tight">
              {{ $t("comment_detail.deploy_intelligence") }}
            </h2>
          </div>
        </div>

        <div class="p-8 space-y-6">
          <div
            class="flex items-start gap-4 text-amber-200 text-sm bg-amber-500/10 border border-amber-500/20 rounded-2xl px-6 py-4"
          >
            <UIcon
              name="i-heroicons-exclamation-triangle"
              class="w-6 h-6 flex-shrink-0 text-amber-500"
            />
            <p class="leading-relaxed font-medium">
              {{ $t("comment_detail.deploy_warning") }}
            </p>
          </div>

          <div
            class="bg-white/5 border border-white/10 rounded-2xl p-6 relative"
          >
            <UIcon
              name="i-heroicons-chat-bubble-bottom-center-text"
              class="absolute top-4 right-4 w-12 h-12 text-white/[0.03] pointer-events-none"
            />
            <p
              class="text-base text-slate-200 leading-relaxed font-medium italic"
            >
              "{{ finalText }}"
            </p>
          </div>

          <!-- Translation Verification in Modal -->
          <div
            v-if="activeSuggestion?.verificationTranslation && activeSuggestion.verificationTranslation !== activeSuggestion.responseText"
            class="mt-6 p-5 rounded-2xl bg-white/[0.02] border border-white/5 animate-fade-in"
          >
            <div class="flex items-center gap-2 mb-3 opacity-50">
              <UIcon
                name="i-heroicons-language"
                class="w-3.5 h-3.5 text-slate-500"
              />
              <span
                class="text-[9px] font-black text-slate-500 uppercase tracking-widest"
                >{{ $t("comment_detail.verification_translation") }}</span
              >
            </div>
            <p class="text-sm text-slate-400 italic leading-relaxed">
              "{{ activeSuggestion.verificationTranslation }}"
            </p>
          </div>

          <label class="flex items-center gap-4 cursor-pointer group p-2">
            <div class="relative flex items-center justify-center">
              <input
                v-model="publishConfirmed"
                type="checkbox"
                class="peer appearance-none w-6 h-6 rounded-lg border-2 border-white/10 bg-white/5 checked:bg-emerald-500 checked:border-emerald-500 transition-all cursor-pointer"
              />
              <UIcon
                name="i-heroicons-check"
                class="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity"
              />
            </div>
            <span
              class="text-sm font-bold text-slate-400 group-hover:text-slate-200 transition-colors"
            >
              {{ $t("comment_detail.audit_confirm") }}
            </span>
          </label>
        </div>

        <div
          class="px-8 py-6 border-t border-white/[0.06] bg-white/[0.01] flex gap-3 justify-end"
        >
          <button
            class="px-6 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-300 cursor-pointer"
            @click="showPublishModal = false"
          >
            {{ $t("comment_detail.cancel") }}
          </button>
          <button
            class="premium-btn-success flex items-center gap-2 py-3 px-8"
            :disabled="!publishConfirmed || publishing"
            @click="publishReply"
          >
            <UIcon
              v-if="publishing"
              name="i-heroicons-arrow-path"
              class="w-4 h-4 animate-spin"
            />
            <UIcon v-else name="i-heroicons-rocket-launch" class="w-4 h-4" />
            {{
              publishing
                ? $t("comment_detail.deploying")
                : $t("comment_detail.deploy_now")
            }}
          </button>
        </div>
      </div>
    </UModal>

    <!-- Delete Modal -->
    <UiConfirmModal
      v-model="showDeleteModal"
      :title="$t('comment_detail.delete_modal_title')"
      :description="$t('comment_detail.delete_modal_desc')"
      :confirm-text="$t('comment_detail.delete_now')"
      :cancel-text="$t('comment_detail.cancel')"
      :loading="deleting"
      type="danger"
      @confirm="confirmDelete"
    />

    <!-- Ban Modal -->
    <UiConfirmModal
      v-model="showBanModal"
      :title="$t('comment_detail.ban_modal_title')"
      :description="$t('comment_detail.ban_modal_desc')"
      :confirm-text="$t('comment_detail.ban_now')"
      :cancel-text="$t('comment_detail.cancel')"
      :loading="banning"
      type="danger"
      @confirm="confirmBan"
    />

    <UiConfirmModal
      v-model="showUnbanModal"
      :title="$t('comment_detail.unban_modal_title')"
      :description="$t('comment_detail.unban_modal_desc')"
      :confirm-text="$t('comment_detail.unban_now')"
      :cancel-text="$t('comment_detail.cancel')"
      :loading="unbanning"
      type="success"
      @confirm="confirmUnban"
    />
  </div>
</template>
