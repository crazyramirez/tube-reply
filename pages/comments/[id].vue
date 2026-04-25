<script setup lang="ts">
import type { SuggestedReply, CommentDetailResponse } from "~/shared/types";

definePageMeta({ middleware: "auth" });

const route = useRoute();
const router = useRouter();
const id = route.params.id as string;
const { t } = useI18n();

const { data, refresh, error } = await useFetch<CommentDetailResponse>(
  `/api/comments/${id}`,
);

const generating = ref(false);
const publishing = ref(false);
const showPublishModal = ref(false);
const editedText = ref("");
const additionalContext = ref("");
const activeSuggestion = ref<SuggestedReply | null>(null);
const publishConfirmed = ref(false);
const toast = useToast();

const selectedLang = ref<string>("");
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
];

const STATUS_OPTIONS = computed(() => [
  { label: "⏳ " + t("status.pending"), value: "pending" },
  { label: "✨ " + t("status.suggested"), value: "suggested" },
  { label: "❌ " + t("status.dismissed"), value: "dismissed" },
  { label: "✅ " + t("status.published"), value: "published" },
  { label: "⏭️ " + t("status.skipped"), value: "skipped" },
]);

const selectedStatus = ref<string>("");
watch(
  () => data.value?.comment?.status,
  (status) => {
    if (status) selectedStatus.value = status;
  },
  { immediate: true },
);

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
  () => data.value?.suggestions,
  (suggestions) => {
    if (suggestions?.length && !activeSuggestion.value) {
      activeSuggestion.value = suggestions[0] as SuggestedReply;
      editedText.value =
        suggestions[0].editedText ?? suggestions[0].responseText;
    }
  },
  { immediate: true },
);

async function generateSuggestion() {
  generating.value = true;
  try {
    await $fetch(`/api/comments/${id}/suggest`, {
      method: "POST",
      headers: useCsrfHeaders(),
      body: {
        langOverride: selectedLang.value || null,
        additionalContext: additionalContext.value || null,
      },
    });
    await refresh();
    activeSuggestion.value =
      (data.value?.suggestions?.[0] as SuggestedReply) ?? null;
    if (activeSuggestion.value) {
      editedText.value =
        activeSuggestion.value.editedText ??
        activeSuggestion.value.responseText;
    }
    toast.add({
      title: t("comment_detail.suggestion_generated"),
      color: "green",
    });
  } catch (err: unknown) {
    const e = err as { data?: { statusMessage?: string } };
    toast.add({
      title: e.data?.statusMessage ?? t("comment_detail.generation_failed"),
      color: "red",
    });
  } finally {
    generating.value = false;
  }
}

async function saveEdit() {
  if (!activeSuggestion.value) return;
  await $fetch(`/api/suggestions/${activeSuggestion.value.id}`, {
    method: "PATCH",
    body: { editedText: editedText.value },
    headers: useCsrfHeaders(),
  });
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

function highResThumbnail(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return url.replace("mqdefault.jpg", "maxresdefault.jpg");
}

const confidence = computed(() => activeSuggestion.value?.confidenceScore ?? 0);
const confidenceLabel = computed(
  () => `${Math.round(confidence.value * 100)}%`,
);
const confidenceColor = computed(() =>
  confidence.value >= 0.7
    ? "green"
    : confidence.value >= 0.4
      ? "yellow"
      : "red",
);
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

const finalText = computed(
  () => editedText.value || activeSuggestion.value?.responseText || "",
);

const showDeleteModal = ref(false);
const showBanModal = ref(false);
const deleting = ref(false);
const banning = ref(false);

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
    await navigateTo("/comments");
  } catch (err: any) {
    toast.add({
      title: err.data?.statusMessage ?? "Failed to ban user",
      color: "red",
    });
  } finally {
    banning.value = false;
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

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>

<template>
  <div>
    <div class="flex items-center justify-between mb-8 animate-fade-in">
      <div class="flex items-center gap-4">
        <button
          @click="router.back()"
          class="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-300 group cursor-pointer"
        >
          <UIcon
            name="i-heroicons-chevron-left"
            class="w-5 h-5 group-hover:-translate-x-0.5 transition-transform"
          />
        </button>
        <div class="flex flex-col">
          <div
            class="flex items-center gap-2 text-[10px] font-bold text-indigo-400 uppercase tracking-[0.3em]"
          >
            <UIcon name="i-heroicons-shield-check" class="w-3 h-3" />
            {{ $t("comment_detail.terminal_label") }}
          </div>
          <h1 class="text-2xl font-black text-white tracking-tighter">
            {{ $t("comment_detail.title") }}
          </h1>
        </div>
      </div>
    </div>

    <div v-if="error" class="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div class="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 border border-red-500/20">
        <UIcon name="i-heroicons-exclamation-circle" class="w-10 h-10 text-red-500" />
      </div>
      <h2 class="text-xl font-black text-white mb-2 tracking-tight">
        {{ error.statusCode === 404 ? $t("comment_detail.not_found") : $t("comment_detail.load_error") }}
      </h2>
      <p class="text-slate-500 text-sm max-w-xs mx-auto mb-8">
        {{ error.statusCode === 404 ? $t("comment_detail.not_found_desc") : $t("comment_detail.load_error_desc") }}
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
        <!-- Original comment -->
        <div class="glass-card animate-slide-up stagger-1">
          <div
            class="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.01]"
          >
            <div class="flex items-center gap-2">
              <UIcon
                name="i-heroicons-chat-bubble-left-right"
                class="w-4 h-4 text-indigo-400"
              />
              <span class="font-bold text-sm text-slate-200 tracking-tight">{{
                $t("comment_detail.user_perspective")
              }}</span>
            </div>
            <div class="flex items-center gap-2">
              <UBadge
                :color="confidenceColor"
                variant="subtle"
                size="xs"
                class="rounded-full px-2.5 font-bold"
              >
                {{ selectedStatus.toUpperCase() }}
              </UBadge>
            </div>
          </div>
          <div class="p-6 space-y-4">
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center text-indigo-400 font-bold text-sm"
              >
                {{ data.comment?.authorName?.[0] }}
              </div>
              <div class="flex flex-col min-w-0">
                <span class="font-bold text-white truncate">{{
                  data.comment?.authorName
                }}</span>
                <span class="text-[10px] text-slate-500 font-medium">{{
                  new Date(data.comment?.publishedAt).toLocaleString()
                }}</span>
              </div>
              <div
                v-if="data.comment?.detectedLang"
                class="ml-auto bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded text-[10px] font-bold text-indigo-400 uppercase tracking-wider"
              >
                {{ data.comment.detectedLang }}
              </div>
            </div>

            <div class="relative">
              <UIcon
                name="i-heroicons-chat-bubble-bottom-center-text"
                class="absolute -top-1 -left-1 w-8 h-8 text-white/[0.03] pointer-events-none"
              />
              <p class="text-slate-200 text-base leading-relaxed pl-2">
                {{ data.comment?.text }}
              </p>
            </div>

            <div
              v-if="data.video"
              class="mt-4 pt-6 border-t border-white/[0.06]"
            >
              <div class="flex items-center justify-between mb-4">
                <p
                  class="text-[10px] uppercase tracking-[0.2em] text-indigo-400 font-bold"
                >
                  {{ $t("comment_detail.source_video") }}
                </p>
                <a
                  :href="`https://www.youtube.com/watch?v=${data.video.id}`"
                  target="_blank"
                  class="text-[10px] font-bold text-slate-500 hover:text-indigo-400 transition-colors flex items-center gap-1"
                >
                  {{ $t("comment_detail.view_on_youtube") }}
                  <UIcon
                    name="i-heroicons-arrow-top-right-on-square"
                    class="w-3 h-3"
                  />
                </a>
              </div>

              <a
                :href="`https://www.youtube.com/watch?v=${data.video.id}`"
                target="_blank"
                class="block group/video relative overflow-hidden border border-white/10 shadow-2xl bg-black"
              >
                <div class="aspect-video relative overflow-hidden">
                  <img
                    :src="highResThumbnail(data.video.thumbnailUrl)"
                    :alt="data.video.title"
                    class="w-full h-full object-cover group-hover/video:scale-105 transition-transform duration-1000 opacity-80 group-hover/video:opacity-100"
                  />

                  <!-- Premium Overlay -->
                  <div
                    class="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-90"
                  />

                  <!-- Play Button -->
                  <div
                    class="absolute inset-0 flex items-center justify-center opacity-0 group-hover/video:opacity-100 transition-all duration-500 scale-110 group-hover/video:scale-100"
                  >
                    <div
                      class="w-16 h-16 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 flex items-center justify-center shadow-2xl"
                    >
                      <UIcon
                        name="i-heroicons-play-20-solid"
                        class="w-8 h-8 text-white"
                      />
                    </div>
                  </div>

                  <!-- Content Overlay -->
                  <div
                    class="absolute bottom-0 left-0 right-0 p-6 transform group-hover/video:translate-y-[-4px] transition-transform duration-500"
                  >
                    <h3
                      class="text-lg font-black text-white leading-tight mb-2 group-hover/video:text-indigo-300 transition-colors tracking-tighter"
                    >
                      {{ data.video.title }}
                    </h3>
                    <div
                      class="flex items-center gap-4 text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em]"
                    >
                      <span class="flex items-center gap-1.5">
                        <UIcon
                          name="i-heroicons-calendar"
                          class="w-3.5 h-3.5 text-indigo-500"
                        />
                        {{
                          new Date(data.video.publishedAt).toLocaleDateString()
                        }}
                      </span>
                      <span
                        v-if="data.video.viewCount"
                        class="flex items-center gap-1.5"
                      >
                        <UIcon
                          name="i-heroicons-eye"
                          class="w-3.5 h-3.5 text-indigo-500"
                        />
                        {{ data.video.viewCount.toLocaleString() }}
                      </span>
                    </div>
                  </div>

                  <!-- Edge Glow -->
                  <div
                    class="absolute inset-0 border border-white/5 group-hover/video:border-indigo-500/30 transition-colors duration-500"
                  />
                </div>
              </a>
            </div>
          </div>
        </div>

        <!-- Thread replies -->
        <div
          v-if="data.replies?.length"
          class="glass-card animate-slide-up stagger-2 overflow-hidden"
        >
          <div class="px-6 py-3.5 border-b border-white/[0.06] bg-white/[0.01]">
            <span
              class="font-bold text-xs text-slate-400 uppercase tracking-widest"
              >{{
                $t("comment_detail.conversation_flow", {
                  n: data.replies.length,
                })
              }}</span
            >
          </div>
          <div class="p-6 space-y-4 max-h-56 overflow-y-auto custom-scrollbar">
            <div
              v-for="reply in data.replies"
              :key="reply.id"
              class="relative pl-6 before:absolute before:left-0 before:top-2 before:bottom-2 before:w-0.5 before:bg-indigo-500/30"
            >
              <div class="flex items-center gap-2 mb-1">
                <span class="font-bold text-xs text-indigo-300">{{
                  reply.authorName
                }}</span>
              </div>
              <p class="text-slate-400 text-xs leading-relaxed">
                {{ reply.text }}
              </p>
            </div>
          </div>
        </div>

        <!-- Status + Language -->
        <div class="glass-card p-6 space-y-5 animate-slide-up stagger-3">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label
                class="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1"
                >{{ $t("comment_detail.current_state") }}</label
              >
              <USelect
                v-model="selectedStatus"
                :options="STATUS_OPTIONS"
                value-attribute="value"
                option-attribute="label"
                size="md"
                class="w-full"
                :ui="{
                  rounded: 'rounded-xl',
                  background: 'bg-white/5',
                  border: 'border-white/10',
                }"
              />
            </div>
            <div class="space-y-2">
              <label
                class="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1"
                >{{ $t("comment_detail.reply_language") }}</label
              >
              <USelect
                v-model="selectedLang"
                :options="LANGUAGES"
                value-attribute="value"
                option-attribute="label"
                size="md"
                class="w-full"
                :ui="{
                  rounded: 'rounded-xl',
                  background: 'bg-white/5',
                  border: 'border-white/10',
                }"
              />
            </div>
          </div>

          <div
            v-if="
              data.comment?.status !== 'published' &&
              data.comment?.status !== 'dismissed' &&
              data.comment?.detectedLang &&
              selectedLang &&
              selectedLang !== data.comment.detectedLang
            "
            class="flex items-center gap-3 text-xs text-amber-200 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3"
          >
            <UIcon
              name="i-heroicons-exclamation-triangle"
              class="w-4 h-4 flex-shrink-0 text-amber-500"
            />
            <p>
              {{
                $t("comment_detail.lang_mismatch", {
                  detected: data.comment.detectedLang,
                  reply: selectedLang,
                })
              }}
            </p>
          </div>
        </div>

        <!-- Additional Context -->
        <div
          v-if="
            data.comment?.status !== 'published' &&
            data.comment?.status !== 'dismissed'
          "
          class="glass-card p-6 space-y-3 animate-slide-up stagger-3"
        >
          <div class="flex items-center gap-2">
            <UIcon
              name="i-heroicons-document-plus"
              class="w-4 h-4 text-indigo-400"
            />
            <span
              class="font-bold text-[10px] text-slate-500 uppercase tracking-widest"
              >{{ $t("comment_detail.additional_context") }}</span
            >
          </div>
          <textarea
            v-model="additionalContext"
            rows="4"
            :placeholder="$t('comment_detail.context_placeholder')"
            class="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 transition-colors resize-none"
          />
        </div>

        <!-- Action buttons -->
        <div class="flex gap-3 flex-wrap animate-slide-up stagger-4">
          <button
            v-if="
              data.comment?.status !== 'published' &&
              data.comment?.status !== 'dismissed'
            "
            class="premium-btn-primary group flex items-center gap-2"
            :disabled="generating"
            @click="generateSuggestion"
          >
            <UIcon
              :name="
                generating ? 'i-heroicons-arrow-path' : 'i-heroicons-sparkles'
              "
              class="w-5 h-5 transition-transform duration-500"
              :class="generating ? 'animate-spin' : 'group-hover:rotate-12'"
            />
            <span>{{
              generating
                ? $t("comment_detail.ai_thinking")
                : data.suggestions?.length
                  ? $t("comment_detail.regenerate")
                  : $t("comment_detail.generate")
            }}</span>
          </button>

          <div class="flex gap-2">
            <button
              v-if="data.comment?.status === 'dismissed'"
              class="px-5 py-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 text-emerald-400 hover:bg-emerald-500/10 text-sm font-bold transition-all duration-300 flex items-center gap-2 cursor-pointer"
              @click="undismissComment"
            >
              <UIcon name="i-heroicons-arrow-uturn-left" class="w-4 h-4" />
              {{ $t("comment_detail.restore") }}
            </button>
            <button
              v-if="data.comment?.status !== 'dismissed' && data.comment?.status !== 'published'"
              class="px-5 py-3 rounded-2xl border border-white/10 bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 text-sm font-bold transition-all duration-300 flex items-center gap-2 cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed"
              @click="dismissComment"
            >
              <UIcon name="i-heroicons-archive-box" class="w-4 h-4" />
              {{ $t("comment_detail.dismiss") }}
            </button>
          </div>

          <!-- Danger actions -->
          <div class="flex gap-2 pt-2">
            <button
              class="px-4 py-2 rounded-xl border border-red-500/10 bg-red-500/5 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 cursor-pointer"
              @click="showDeleteModal = true"
            >
              <UIcon name="i-heroicons-trash" class="w-3.5 h-3.5" />
              {{ $t("comment_detail.delete_youtube") }}
            </button>
            <button
              class="px-4 py-2 rounded-xl border border-red-500/10 bg-red-500/5 text-red-500/60 hover:text-red-500 hover:bg-red-500/10 text-[10px] font-black uppercase tracking-widest transition-all duration-300 flex items-center gap-2 cursor-pointer"
              @click="showBanModal = true"
            >
              <UIcon name="i-heroicons-no-symbol" class="w-3.5 h-3.5" />
              {{ $t("comment_detail.ban_user") }}
            </button>
          </div>
        </div>
      </div>

      <!-- Right: AI Suggestion (7/12) -->
      <div class="lg:col-span-7 space-y-6">
        <!-- Empty state -->
        <div
          v-if="!activeSuggestion && !generating"
          class="glass-card py-24 text-center border-dashed border-white/10 bg-white/[0.01] animate-fade-in"
        >
          <div class="relative w-20 h-20 mx-auto mb-6">
            <div
              class="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full"
            ></div>
            <UIcon
              name="i-heroicons-sparkles"
              class="relative w-20 h-20 text-indigo-500/40"
            />
          </div>
          <h3 class="text-lg font-bold text-white mb-2">
            {{ $t("comment_detail.ready_title") }}
          </h3>
          <p class="text-slate-500 text-sm max-w-xs mx-auto">
            {{ $t("comment_detail.ready_hint") }}
          </p>
        </div>

        <!-- Generating -->
        <div
          v-if="generating"
          class="glass-card py-20 text-center animate-fade-in"
        >
          <div class="relative w-16 h-16 mx-auto mb-6">
            <div
              class="absolute inset-0 bg-indigo-500/30 blur-2xl rounded-full animate-pulse"
            ></div>
            <div
              class="w-16 h-16 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin relative"
            />
          </div>
          <p
            class="text-indigo-300 font-bold tracking-widest text-xs uppercase animate-pulse"
          >
            {{ $t("comment_detail.consulting_kb") }}
          </p>
        </div>

        <template v-if="activeSuggestion && !generating">
          <!-- Confidence meter -->
          <div class="glass-card p-6 animate-fade-in">
            <div class="flex items-center justify-between mb-4">
              <div class="flex flex-col">
                <span
                  class="text-[10px] font-bold text-slate-500 uppercase tracking-widest"
                  >{{ $t("comment_detail.ai_level") }}</span
                >
                <div class="flex items-center gap-2 mt-1">
                  <span
                    class="text-2xl font-black tracking-tighter"
                    :class="confidenceTextClass"
                    >{{ confidenceLabel }}</span
                  >
                  <UBadge
                    v-if="activeSuggestion.needsConfirmation"
                    color="orange"
                    variant="soft"
                    size="xs"
                    class="font-bold"
                  >
                    {{ $t("comment_detail.high_risk") }}
                  </UBadge>
                </div>
              </div>
              <div
                class="w-12 h-12 rounded-full border-2 flex items-center justify-center transition-colors duration-500"
                :class="`border-${confidenceColor}-500/20`"
              >
                <UIcon
                  :name="
                    confidence.valueOf() >= 0.7
                      ? 'i-heroicons-check-badge'
                      : 'i-heroicons-exclamation-circle'
                  "
                  class="w-6 h-6"
                  :class="confidenceTextClass"
                />
              </div>
            </div>
            <div class="h-2 bg-white/5 rounded-full overflow-hidden p-[1px]">
              <div
                class="h-full rounded-full transition-all duration-1000 ease-out shadow-[0_0_12px] shadow-current"
                :class="confidenceBarClass"
                :style="`width: ${Math.round(confidence * 100)}%`"
              />
            </div>
          </div>

          <div
            v-if="activeSuggestion.needsConfirmation"
            class="flex items-start gap-4 text-orange-200 text-sm bg-orange-500/10 border border-orange-500/20 rounded-2xl px-6 py-4 animate-fade-in"
          >
            <UIcon
              name="i-heroicons-shield-exclamation"
              class="w-6 h-6 flex-shrink-0 text-orange-500"
            />
            <div class="flex flex-col gap-1">
              <span
                class="font-bold text-orange-400 uppercase tracking-wider text-[10px]"
                >{{ $t("comment_detail.verification_required") }}</span
              >
              <p class="leading-relaxed">
                {{
                  activeSuggestion.confirmationReason ??
                  "This suggestion includes sensitive elements that require human review."
                }}
              </p>
            </div>
          </div>

          <!-- Editable reply -->
          <div class="glass-card overflow-hidden animate-fade-in stagger-1">
            <div
              class="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.01]"
            >
              <div class="flex items-center gap-2">
                <UIcon
                  name="i-heroicons-sparkles"
                  class="w-4 h-4 text-indigo-400"
                />
                <span class="font-bold text-sm text-slate-200 tracking-tight">{{
                  $t("comment_detail.proposed_intel")
                }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span
                  class="text-[10px] font-bold text-slate-600 uppercase tracking-widest"
                  >{{ $t("comment_detail.manual_override") }}</span
                >
              </div>
            </div>
            <div class="p-6">
              <textarea
                v-model="editedText"
                rows="3"
                :placeholder="$t('comment_detail.refine_placeholder')"
                :disabled="data.comment?.status === 'published'"
                class="w-full bg-transparent text-base text-slate-200 placeholder-slate-700 resize-none focus:outline-none leading-relaxed font-medium disabled:opacity-70 disabled:cursor-not-allowed"
              />
            </div>
            <div
              class="px-6 py-4 border-t border-white/[0.06] bg-white/[0.01] flex justify-between items-center"
            >
              <p
                class="text-[10px] text-slate-600 font-bold uppercase tracking-widest"
              >
                {{ $t("comment_detail.characters", { n: editedText.length }) }}
              </p>
              <button
                v-if="data.comment?.status !== 'published'"
                class="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer flex items-center gap-1.5"
                @click="saveEdit"
              >
                <UIcon name="i-heroicons-check-circle" class="w-4 h-4" />
                {{ $t("comment_detail.commit_edits") }}
              </button>
            </div>
          </div>

          <!-- Context Grid -->
          <div
            class="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-fade-in stagger-2"
          >
            <!-- Spanish verification -->
            <div class="glass-card overflow-hidden">
              <div
                class="px-5 py-3 border-b border-white/[0.06] bg-white/[0.01]"
              >
                <span
                  class="font-bold text-xs text-slate-500 uppercase tracking-widest"
                  >{{ $t("comment_detail.verification_translation") }}</span
                >
              </div>
              <div class="p-5">
                <p class="text-slate-400 text-sm italic leading-relaxed">
                  {{ activeSuggestion.responseEs }}
                </p>
              </div>
            </div>

            <!-- Context used -->
            <div
              v-if="activeSuggestion.contextUsed"
              class="glass-card overflow-hidden"
            >
              <div
                class="px-5 py-3 border-b border-white/[0.06] bg-white/[0.01]"
              >
                <span
                  class="font-bold text-xs text-slate-500 uppercase tracking-widest"
                  >{{ $t("comment_detail.context_engine") }}</span
                >
              </div>
              <div
                class="p-5 text-xs text-slate-400 space-y-2 font-bold uppercase tracking-wider"
              >
                <p
                  v-if="activeSuggestion.contextUsed.kb_entries?.length"
                  class="flex items-start gap-2"
                >
                  <UIcon
                    name="i-heroicons-book-open"
                    class="w-4 h-4 flex-shrink-0 text-indigo-500"
                  />
                  KB: {{ activeSuggestion.contextUsed.kb_entries.join(", ") }}
                </p>
                <p
                  v-if="activeSuggestion.contextUsed.video_summary_used"
                  class="flex items-center gap-2"
                >
                  <UIcon
                    name="i-heroicons-video-camera"
                    class="w-4 h-4 flex-shrink-0 text-indigo-500"
                  />
                  {{ $t("comment_detail.video_context_used") }}
                </p>
                <p
                  v-if="activeSuggestion.contextUsed.existing_replies_count"
                  class="flex items-center gap-2"
                >
                  <UIcon
                    name="i-heroicons-chat-bubble-left-right"
                    class="w-4 h-4 flex-shrink-0 text-indigo-500"
                  />
                  {{
                    $t("comment_detail.analyzed_threads", {
                      n: activeSuggestion.contextUsed.existing_replies_count,
                    })
                  }}
                </p>
              </div>
            </div>
          </div>

          <!-- Video links -->
          <div
            v-if="activeSuggestion.videoLinksUsed?.length"
            class="space-y-4 animate-fade-in stagger-3"
          >
            <div class="flex items-center gap-2 ml-1">
              <UIcon name="i-heroicons-link" class="w-4 h-4 text-indigo-500" />
              <p
                class="text-[10px] text-slate-500 font-bold uppercase tracking-[0.2em]"
              >
                {{ $t("comment_detail.referenced_intel") }}
              </p>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                v-for="link in activeSuggestion.videoLinksUsed"
                :key="link.video_id"
                class="glass-card group/link p-3 flex items-center gap-4 hover:border-indigo-500/40"
              >
                <a
                  :href="link.url"
                  target="_blank"
                  class="relative flex-shrink-0 cursor-pointer overflow-hidden rounded-lg shadow-xl"
                >
                  <img
                    v-if="link.thumbnail_url"
                    :src="highResThumbnail(link.thumbnail_url)"
                    :alt="link.video_title"
                    class="w-24 aspect-video object-cover group-hover/link:scale-110 transition-transform duration-500"
                  />
                  <div
                    v-else
                    class="w-24 aspect-video bg-white/5 flex items-center justify-center"
                  >
                    <UIcon
                      name="i-heroicons-video-camera"
                      class="w-5 h-5 text-slate-700"
                    />
                  </div>
                  <div
                    class="absolute inset-0 bg-indigo-900/40 opacity-0 group-hover/link:opacity-100 transition-opacity flex items-center justify-center"
                  >
                    <UIcon name="i-heroicons-play" class="w-6 h-6 text-white" />
                  </div>
                </a>
                <div class="flex flex-col min-w-0">
                  <a
                    :href="link.url"
                    target="_blank"
                    class="text-[11px] font-bold text-slate-200 hover:text-indigo-400 transition-colors line-clamp-2 leading-tight"
                  >
                    {{ link.video_title }}
                  </a>
                </div>
              </div>
            </div>
          </div>

          <!-- Publish CTA -->
          <div class="pt-4 animate-fade-in stagger-4">
            <button
              v-if="data.comment?.status !== 'published'"
              class="premium-btn-success w-full flex items-center justify-center gap-3"
              @click="showPublishModal = true"
            >
              <UIcon
                name="i-heroicons-paper-airplane"
                class="w-5 h-5 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform"
              />
              <span>{{ $t("comment_detail.deploy_to_youtube") }}</span>
            </button>

            <div
              v-else
              class="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-bold shadow-[0_0_20px_rgba(16,185,129,0.1)]"
            >
              <UIcon name="i-heroicons-check-badge" class="w-6 h-6" />
              {{ $t("comment_detail.intel_deployed") }}
            </div>
          </div>
        </template>
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
              class="text-[10px] font-bold text-emerald-500 uppercase tracking-widest"
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
  </div>
</template>
