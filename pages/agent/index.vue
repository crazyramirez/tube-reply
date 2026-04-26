<script setup lang="ts">
definePageMeta({ middleware: "auth" });

const { t } = useI18n();
const toast = useToast();

// ─── Agent status (Gemini key gate) ─────────────────────────────────────────

// ─── Chat list ───────────────────────────────────────────────────────────────

interface AgentChat {
  id: number;
  title: string;
  messageCount: number | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface AgentMessage {
  id: number;
  chatId: number;
  role: "user" | "assistant";
  content: string;
  metadata: string | null;
  createdAt: string | null;
}

const chats = ref<AgentChat[]>([]);
const activeChatId = ref<number | null>(null);
const messages = ref<AgentMessage[]>([]);
const loadingChats = ref(false);
const loadingMessages = ref(false);
const creating = ref(false);
const showDeleteConfirm = ref(false);
const chatToDelete = ref<AgentChat | null>(null);
const deleting = ref(false);
const input = ref("");
const sending = ref(false);
const messagesContainer = ref<HTMLElement | null>(null);
const mobileChatView = ref(false);

// ─── Agent status (Gemini key gate) ─────────────────────────────────────────

const { data: statusData } = await useFetch<{
  configured: boolean;
  model: string;
}>("/api/agent/status");
const geminiConfigured = computed(() => statusData.value?.configured ?? false);
const activeModel = computed(() => statusData.value?.model ?? "");

async function fetchChats() {
  loadingChats.value = true;
  try {
    const res = await $fetch<{ chats: AgentChat[] }>("/api/agent/chats");
    chats.value = res.chats;
  } finally {
    loadingChats.value = false;
  }
}

async function fetchMessages(chatId: number) {
  loadingMessages.value = true;
  messages.value = [];
  try {
    const res = await $fetch<{ chat: AgentChat; messages: AgentMessage[] }>(
      `/api/agent/chats/${chatId}/messages`,
    );
    messages.value = res.messages;
    const chat = chats.value.find((c) => c.id === chatId);
    if (chat) chat.title = res.chat.title;
  } finally {
    loadingMessages.value = false;
  }
}

async function selectChat(id: number) {
  activeChatId.value = id;
  mobileChatView.value = true;
  await fetchMessages(id);
  nextTick(() => scrollToBottom());
}

// ─── Create / delete chat ────────────────────────────────────────────────────

async function createChat() {
  creating.value = true;
  try {
    const res = await $fetch<{ chat: AgentChat }>("/api/agent/chats", {
      method: "POST",
      body: { title: t("agent.new_chat_title") },
      headers: useCsrfHeaders(),
    });
    chats.value.unshift(res.chat);
    mobileChatView.value = true;
    await selectChat(res.chat.id);
  } finally {
    creating.value = false;
  }
}

function openDeleteConfirm(chat: AgentChat, e: MouseEvent) {
  e.stopPropagation();
  chatToDelete.value = chat;
  showDeleteConfirm.value = true;
}

async function confirmDeleteChat() {
  if (!chatToDelete.value) return;
  deleting.value = true;
  try {
    await $fetch(`/api/agent/chats/${chatToDelete.value.id}`, {
      method: "DELETE",
      headers: useCsrfHeaders(),
    });
    chats.value = chats.value.filter((c) => c.id !== chatToDelete.value!.id);
    if (activeChatId.value === chatToDelete.value.id) {
      activeChatId.value = null;
      messages.value = [];
    }
    toast.add({ title: t("agent.chat_deleted"), color: "green" });
    showDeleteConfirm.value = false;
    chatToDelete.value = null;
  } catch {
    toast.add({ title: "Error", color: "red" });
  } finally {
    deleting.value = false;
  }
}

// ─── Send message ────────────────────────────────────────────────────────────

function scrollToBottom(smooth = true) {
  if (!messagesContainer.value) return;
  messagesContainer.value.scrollTo({
    top: messagesContainer.value.scrollHeight,
    behavior: smooth ? "smooth" : "instant",
  });
}

async function sendMessage(text?: string) {
  const msg = (text ?? input.value).trim();
  if (!msg || sending.value || !activeChatId.value) return;
  input.value = "";
  sending.value = true;

  // Optimistic user message
  const optimisticId = Date.now();
  messages.value.push({
    id: optimisticId,
    chatId: activeChatId.value,
    role: "user",
    content: msg,
    metadata: null,
    createdAt: new Date().toISOString(),
  });
  await nextTick();
  scrollToBottom();

  try {
    const res = await $fetch<{
      userMessage: AgentMessage;
      assistantMessage: AgentMessage;
      usage: { promptTokens: number; completionTokens: number };
    }>(`/api/agent/chats/${activeChatId.value}/messages`, {
      method: "POST",
      body: { message: msg },
      headers: useCsrfHeaders(),
    });

    // Replace optimistic with real user message, add assistant
    const idx = messages.value.findIndex((m) => m.id === optimisticId);
    if (idx !== -1) messages.value[idx] = res.userMessage;
    messages.value.push(res.assistantMessage);

    // Update chat title in sidebar (auto-titled from first message)
    const chat = chats.value.find((c) => c.id === activeChatId.value);
    if (chat) {
      await fetchMessages(activeChatId.value!);
      await fetchChats();
    }

    await nextTick();
    scrollToBottom();
  } catch (err: any) {
    messages.value = messages.value.filter((m) => m.id !== optimisticId);
    toast.add({
      title: t("agent.error_send"),
      description: err?.data?.statusMessage ?? err?.message,
      color: "red",
    });
  } finally {
    sending.value = false;
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
}

// ─── Markdown renderer (simple) ──────────────────────────────────────────────

function renderMarkdown(text: string): string {
  return text
    .replace(
      /^### (.+)$/gm,
      '<h3 class="text-base font-bold text-white mt-4 mb-2">$1</h3>',
    )
    .replace(
      /^## (.+)$/gm,
      '<h2 class="text-lg font-black text-white mt-5 mb-2">$1</h2>',
    )
    .replace(
      /^# (.+)$/gm,
      '<h1 class="text-xl font-black text-white mt-5 mb-3">$1</h1>',
    )
    .replace(
      /\*\*(.+?)\*\*/g,
      '<strong class="text-white font-bold">$1</strong>',
    )
    .replace(/\*(.+?)\*/g, '<em class="text-slate-300 italic">$1</em>')
    .replace(
      /`([^`]+)`/g,
      '<code class="bg-white/10 text-indigo-300 px-1.5 py-0.5 rounded text-[0.85em] font-mono">$1</code>',
    )
    .replace(
      /^- (.+)$/gm,
      '<li class="flex gap-2 text-slate-300"><span class="text-indigo-400 mt-1 shrink-0">•</span><span>$1</span></li>',
    )
    .replace(
      /^(\d+)\. (.+)$/gm,
      '<li class="flex gap-2 text-slate-300"><span class="text-indigo-400 font-bold shrink-0">$1.</span><span>$2</span></li>',
    )
    .replace(
      /(<li[\s\S]*?<\/li>\n?)+/g,
      (match) => `<ul class="space-y-1.5 my-2">${match}</ul>`,
    )
    .replace(/\n\n/g, '<br class="block my-2">')
    .replace(/\n/g, "<br>");
}

// ─── Token metadata ──────────────────────────────────────────────────────────

function getMetadata(
  msg: AgentMessage,
): { tokens: number; model: string } | null {
  if (!msg.metadata) return null;
  try {
    const m = JSON.parse(msg.metadata);
    return {
      tokens: (m.promptTokens ?? 0) + (m.completionTokens ?? 0),
      model: m.model ?? "",
    };
  } catch {
    return null;
  }
}

// ─── Suggested prompts ───────────────────────────────────────────────────────

const promptKeys = [
  "video_ideas",
  "growth",
  "comments",
  "summer",
  "subs",
  "trending",
] as const;

const promptIcons: Record<string, string> = {
  video_ideas: "i-heroicons-film",
  growth: "i-heroicons-arrow-trending-up",
  comments: "i-heroicons-chat-bubble-left-ellipsis",
  summer: "i-heroicons-sun",
  subs: "i-heroicons-user-group",
  trending: "i-heroicons-fire",
};

const promptColors: Record<string, string> = {
  video_ideas: "indigo",
  growth: "emerald",
  comments: "blue",
  summer: "amber",
  subs: "purple",
  trending: "red",
};

// ─── Active chat title ───────────────────────────────────────────────────────

const activeChat = computed(
  () => chats.value.find((c) => c.id === activeChatId.value) ?? null,
);

// ─── Mobile view toggle ──────────────────────────────────────────────────────

await fetchChats();

// ─── Relative date ───────────────────────────────────────────────────────────

function relativeDate(dateStr: string | null): string {
  if (!dateStr) return "";
  const date = new Date(dateStr + "Z");
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return t("agent.today");
  if (diffDays === 1) return t("agent.yesterday");
  return date.toLocaleDateString();
}

// Auto-scroll on messages change
watch(messages, () => {
  nextTick(() => scrollToBottom());
});
</script>

<style scoped>
.glass-card {
  @apply bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-2xl;
  box-shadow:
    0 4px 24px -1px rgba(0, 0, 0, 0.2),
    inset 0 1px 1px 0 rgba(255, 255, 255, 0.04);
}
.glass-card:hover {
  transform: none;
  border-color: rgba(255, 255, 255, 0.08);
  background-color: rgba(255, 255, 255, 0.03);
  box-shadow:
    0 4px 24px -1px rgba(0, 0, 0, 0.2),
    inset 0 1px 1px 0 rgba(255, 255, 255, 0.04);
}

.chat-sidebar {
  @apply bg-white/[0.02] border-r border-white/[0.06] h-full flex flex-col;
}

.chat-item {
  @apply flex items-center gap-2 px-3 py-3 rounded-xl cursor-pointer transition-all duration-150 relative;
}
.chat-item:hover {
  @apply bg-white/[0.05];
}
.chat-item.active {
  @apply bg-indigo-500/[0.12] ring-1 ring-indigo-500/20;
}

.msg-bubble-user {
  @apply ml-auto max-w-[80%] bg-indigo-500/20 border border-indigo-500/25 rounded-2xl rounded-br-sm px-4 py-3 text-sm text-slate-100 leading-relaxed;
  box-shadow: 0 2px 12px rgba(99, 102, 241, 0.15);
}

.msg-bubble-assistant {
  @apply mr-auto max-w-[90%] bg-white/[0.04] border border-white/[0.08] rounded-2xl rounded-bl-sm px-5 py-4 text-sm text-slate-200 leading-relaxed;
}

.prompt-card {
  @apply relative flex flex-col gap-2 p-4 rounded-2xl border cursor-pointer transition-all duration-200 text-left;
  @apply bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/[0.14] hover:-translate-y-0.5;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
}

.premium-btn {
  @apply relative overflow-hidden px-4 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 cursor-pointer flex items-center gap-2;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  box-shadow: 0 4px 14px -4px rgba(79, 70, 229, 0.5);
}
.premium-btn:hover:not(:disabled) {
  @apply -translate-y-0.5;
  box-shadow: 0 8px 20px -4px rgba(79, 70, 229, 0.6);
}
.premium-btn:disabled {
  @apply opacity-60 cursor-not-allowed;
}

.send-btn {
  @apply p-3 rounded-xl transition-all duration-200 flex items-center justify-center shrink-0 cursor-pointer;
  background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%);
  box-shadow: 0 4px 14px -4px rgba(79, 70, 229, 0.5);
}
.send-btn:hover:not(:disabled) {
  box-shadow: 0 8px 20px -4px rgba(79, 70, 229, 0.6);
  transform: translateY(-1px);
}
.send-btn:disabled {
  @apply opacity-50 cursor-not-allowed;
}

.thinking-dot {
  @apply w-2 h-2 rounded-full bg-indigo-400;
  animation: bounce 1.2s ease-in-out infinite;
}
.thinking-dot:nth-child(2) {
  animation-delay: 0.2s;
}
.thinking-dot:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.4;
  }
  30% {
    transform: translateY(-6px);
    opacity: 1;
  }
}

.animate-fade-in {
  animation: fadeIn 0.5s ease forwards;
}
.animate-slide-up {
  opacity: 0;
  transform: translateY(12px);
  animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
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
  animation-delay: 0.05s;
}
.stagger-2 {
  animation-delay: 0.1s;
}
.stagger-3 {
  animation-delay: 0.15s;
}
.stagger-4 {
  animation-delay: 0.2s;
}
.stagger-5 {
  animation-delay: 0.25s;
}
.stagger-6 {
  animation-delay: 0.3s;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.15);
}

.no-key-glow {
  box-shadow:
    0 0 80px rgba(245, 158, 11, 0.08),
    0 0 40px rgba(245, 158, 11, 0.05);
}
</style>

<template>
  <div>
    <!-- Page header -->
    <div
      class="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 animate-fade-in gap-4"
    >
      <div class="flex flex-col">
        <div
          class="flex items-center gap-2 text-[10px] font-bold text-indigo-400 uppercase tracking-[0.3em]"
        >
          <UIcon name="i-heroicons-cpu-chip" class="w-3 h-3" />
          {{ $t("agent.center_label") }}
        </div>
        <h1 class="text-2xl sm:text-3xl font-black text-white tracking-tighter">
          {{ $t("agent.title") }}
        </h1>
        <p class="text-slate-500 text-sm mt-1">{{ $t("agent.subtitle") }}</p>
      </div>
      <div v-if="geminiConfigured" class="flex items-center gap-2 shrink-0">
        <div
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08]"
        >
          <div
            class="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
          ></div>
          <span
            class="text-[10px] font-bold text-slate-400 uppercase tracking-widest"
            >{{ activeModel }}</span
          >
        </div>
      </div>
    </div>

    <!-- No Gemini key gate -->
    <div
      v-if="!geminiConfigured"
      class="glass-card no-key-glow py-24 text-center border-amber-500/20 animate-fade-in"
    >
      <div class="relative w-24 h-24 mx-auto mb-8">
        <div
          class="absolute inset-0 bg-amber-500/15 blur-3xl rounded-full"
        ></div>
        <div
          class="relative w-24 h-24 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto"
        >
          <UIcon name="i-heroicons-key" class="w-10 h-10 text-amber-400" />
        </div>
      </div>
      <h2 class="text-2xl font-black text-white tracking-tight mb-3">
        {{ $t("agent.no_key_title") }}
      </h2>
      <p class="text-slate-400 text-sm max-w-md mx-auto leading-relaxed">
        {{ $t("agent.no_key_desc") }}
      </p>
      <div
        class="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs font-mono text-slate-400"
      >
        <UIcon
          name="i-heroicons-document-text"
          class="w-4 h-4 text-slate-500"
        />
        GEMINI_API_KEY=your_key_here
      </div>
    </div>

    <!-- Main chat interface -->
    <div
      v-else
      class="glass-card overflow-hidden animate-fade-in"
      style="height: calc(100vh - 260px); min-height: 380px"
    >
      <div class="flex h-[100%]">
        <!-- Sidebar -->
        <div
          class="shrink-0 w-full md:w-64"
          :class="mobileChatView ? 'hidden md:block' : 'block'"
        >
          <div class="chat-sidebar h-full">
            <!-- Sidebar header -->
            <div
              class="px-4 py-4 border-b border-white/[0.06] flex items-center justify-between"
            >
              <span
                class="text-[10px] font-bold text-slate-500 uppercase tracking-widest"
                >{{ $t("agent.agent_name") }}</span
              >
              <button
                class="premium-btn py-1.5 px-3 text-xs"
                :disabled="creating"
                @click="createChat"
              >
                <UIcon
                  :name="
                    creating ? 'i-heroicons-arrow-path' : 'i-heroicons-plus'
                  "
                  class="w-3.5 h-3.5"
                  :class="creating ? 'animate-spin' : ''"
                />
                {{ $t("agent.new_chat") }}
              </button>
            </div>

            <!-- Chat list -->
            <div class="flex-1 overflow-y-auto custom-scrollbar py-2 px-2">
              <div v-if="loadingChats" class="flex justify-center py-8">
                <UIcon
                  name="i-heroicons-arrow-path"
                  class="w-5 h-5 text-slate-600 animate-spin"
                />
              </div>

              <div v-else-if="!chats.length" class="py-12 px-4 text-center">
                <UIcon
                  name="i-heroicons-chat-bubble-left-right"
                  class="w-8 h-8 text-slate-700 mx-auto mb-3"
                />
                <p class="text-xs text-slate-600 font-medium">
                  {{ $t("agent.no_chats_title") }}
                </p>
                <p class="text-[10px] text-slate-700 mt-1">
                  {{ $t("agent.no_chats_hint") }}
                </p>
              </div>

              <TransitionGroup
                name="list"
                tag="div"
                class="space-y-0.5"
                style="user-select: none"
              >
                <div
                  v-for="chat in chats"
                  :key="chat.id"
                  class="chat-item group"
                  :class="activeChatId === chat.id ? 'active' : ''"
                  @click="selectChat(chat.id)"
                >
                  <UIcon
                    name="i-heroicons-chat-bubble-oval-left"
                    class="w-4 h-4 shrink-0 transition-colors"
                    :class="
                      activeChatId === chat.id
                        ? 'text-indigo-400'
                        : 'text-slate-600 group-hover:text-slate-400'
                    "
                  />
                  <div class="flex-1 min-w-0">
                    <p
                      class="text-xs font-semibold truncate"
                      :class="
                        activeChatId === chat.id
                          ? 'text-indigo-200'
                          : 'text-slate-400'
                      "
                    >
                      {{ chat.title }}
                    </p>
                    <p class="text-[10px] text-slate-600">
                      {{ relativeDate(chat.updatedAt) }}
                      <span v-if="chat.messageCount">
                        · {{ chat.messageCount }} {{ $t("agent.messages") }}
                      </span>
                    </p>
                  </div>
                  <button
                    class="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-all duration-150 cursor-pointer"
                    @click="openDeleteConfirm(chat, $event)"
                  >
                    <UIcon name="i-heroicons-trash" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </TransitionGroup>
            </div>

            <!-- Sidebar footer -->
            <div class="px-4 py-3 border-t border-white/[0.06]">
              <div class="flex items-center gap-2">
                <div
                  class="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center"
                >
                  <UIcon
                    name="i-heroicons-sparkles"
                    class="w-3.5 h-3.5 text-indigo-400"
                  />
                </div>
                <span class="text-[10px] text-slate-600 font-medium"
                  >AI · Gemini Flash</span
                >
              </div>
            </div>
          </div>
        </div>

        <!-- Chat area -->
        <div
          class="flex-1 flex-col min-w-0"
          :class="mobileChatView ? 'flex' : 'hidden md:flex'"
        >
          <!-- Chat header -->
          <div
            class="px-4 sm:px-6 py-4 border-b border-white/[0.06] flex items-center gap-3 bg-white/[0.01] shrink-0"
          >
            <!-- Mobile back button -->
            <button
              class="md:hidden w-8 h-8 flex items-center justify-center rounded-xl bg-white/5 border border-white/10 text-slate-400 hover:text-white transition-all cursor-pointer shrink-0"
              @click="mobileChatView = false"
            >
              <UIcon name="i-heroicons-chevron-left" class="w-4 h-4" />
            </button>
            <template v-if="activeChat">
              <div
                class="w-8 h-8 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center"
              >
                <UIcon
                  name="i-heroicons-cpu-chip"
                  class="w-4 h-4 text-indigo-400"
                />
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-white truncate">
                  {{ activeChat.title }}
                </p>
                <p class="text-[10px] text-slate-500">
                  {{ activeChat.messageCount ?? 0 }}
                  {{ $t("agent.messages") }} ·
                  {{ relativeDate(activeChat.updatedAt) }}
                </p>
              </div>
            </template>
            <template v-else>
              <div
                class="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center"
              >
                <UIcon
                  name="i-heroicons-sparkles"
                  class="w-4 h-4 text-slate-500"
                />
              </div>
              <p class="text-sm font-semibold text-slate-500">
                {{ $t("agent.agent_name") }}
              </p>
            </template>
          </div>

          <!-- Messages / Empty state -->
          <div
            ref="messagesContainer"
            class="flex-1 overflow-y-auto custom-scrollbar px-6 py-4"
          >
            <!-- Empty: no chat selected -->
            <div
              v-if="!activeChatId"
              class="h-full flex flex-col items-center justify-center text-center animate-fade-in"
            >
              <div class="relative mb-8">
                <div
                  class="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full scale-150"
                ></div>
                <div
                  class="relative w-20 h-20 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center"
                >
                  <UIcon
                    name="i-heroicons-cpu-chip"
                    class="w-10 h-10 text-indigo-400"
                  />
                </div>
              </div>
              <h2 class="text-xl font-black text-white tracking-tight mb-2">
                {{ $t("agent.empty_state_title") }}
              </h2>
              <p class="text-sm text-slate-500 max-w-sm mb-10">
                {{ $t("agent.empty_state_hint") }}
              </p>

              <div class="w-full max-w-2xl">
                <p
                  class="text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-4"
                >
                  {{ $t("agent.suggestions_label") }}
                </p>
                <div class="grid grid-cols-2 gap-2">
                  <button
                    v-for="(key, i) in promptKeys"
                    :key="key"
                    class="prompt-card animate-slide-up"
                    :class="`stagger-${i + 1}`"
                    @click="
                      createChat().then(() =>
                        sendMessage($t(`agent.suggested_prompts.${key}`)),
                      )
                    "
                  >
                    <div class="flex items-center gap-2.5">
                      <div
                        class="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                        :class="{
                          'bg-indigo-500/10 border border-indigo-500/20':
                            promptColors[key] === 'indigo',
                          'bg-emerald-500/10 border border-emerald-500/20':
                            promptColors[key] === 'emerald',
                          'bg-blue-500/10 border border-blue-500/20':
                            promptColors[key] === 'blue',
                          'bg-amber-500/10 border border-amber-500/20':
                            promptColors[key] === 'amber',
                          'bg-purple-500/10 border border-purple-500/20':
                            promptColors[key] === 'purple',
                          'bg-red-500/10 border border-red-500/20':
                            promptColors[key] === 'red',
                        }"
                      >
                        <UIcon
                          :name="promptIcons[key]"
                          class="w-4 h-4"
                          :class="{
                            'text-indigo-400': promptColors[key] === 'indigo',
                            'text-emerald-400': promptColors[key] === 'emerald',
                            'text-blue-400': promptColors[key] === 'blue',
                            'text-amber-400': promptColors[key] === 'amber',
                            'text-purple-400': promptColors[key] === 'purple',
                            'text-red-400': promptColors[key] === 'red',
                          }"
                        />
                      </div>
                      <span
                        class="text-xs font-semibold text-slate-300 text-left leading-snug"
                        >{{ $t(`agent.suggested_prompts.${key}`) }}</span
                      >
                    </div>
                  </button>
                </div>
              </div>
            </div>

            <!-- Messages list -->
            <template v-else>
              <!-- Loading messages -->
              <div v-if="loadingMessages" class="flex justify-center py-12">
                <div class="flex gap-2">
                  <div class="thinking-dot"></div>
                  <div class="thinking-dot"></div>
                  <div class="thinking-dot"></div>
                </div>
              </div>

              <!-- Empty chat: show suggested prompts -->
              <div
                v-else-if="!messages.length && !sending"
                class="h-full flex flex-col items-center justify-center text-center py-10 animate-fade-in"
              >
                <div
                  class="w-14 h-14 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5"
                >
                  <UIcon
                    name="i-heroicons-sparkles"
                    class="w-7 h-7 text-indigo-400"
                  />
                </div>
                <p class="text-sm text-slate-400 font-medium mb-1">
                  {{ $t("agent.empty_state_title") }}
                </p>
                <p class="text-xs text-slate-600 max-w-xs mb-8">
                  {{ $t("agent.empty_state_hint") }}
                </p>
                <div class="grid grid-cols-2 gap-2 w-full max-w-lg">
                  <button
                    v-for="key in promptKeys"
                    :key="key"
                    class="prompt-card"
                    @click="sendMessage($t(`agent.suggested_prompts.${key}`))"
                  >
                    <div class="flex items-center gap-2">
                      <UIcon
                        :name="promptIcons[key]"
                        class="w-4 h-4 shrink-0"
                        :class="{
                          'text-indigo-400': promptColors[key] === 'indigo',
                          'text-emerald-400': promptColors[key] === 'emerald',
                          'text-blue-400': promptColors[key] === 'blue',
                          'text-amber-400': promptColors[key] === 'amber',
                          'text-purple-400': promptColors[key] === 'purple',
                          'text-red-400': promptColors[key] === 'red',
                        }"
                      />
                      <span
                        class="text-xs text-slate-400 text-left leading-snug"
                        >{{ $t(`agent.suggested_prompts.${key}`) }}</span
                      >
                    </div>
                  </button>
                </div>
              </div>

              <!-- Actual messages -->
              <div v-else class="space-y-5 py-2">
                <div
                  v-for="msg in messages"
                  :key="msg.id"
                  class="flex gap-3 animate-slide-up"
                  :class="msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'"
                >
                  <!-- Avatar -->
                  <div class="shrink-0 mt-1">
                    <div
                      v-if="msg.role === 'user'"
                      class="w-7 h-7 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center"
                    >
                      <UIcon
                        name="i-heroicons-user"
                        class="w-3.5 h-3.5 text-indigo-300"
                      />
                    </div>
                    <div
                      v-else
                      class="w-7 h-7 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center"
                    >
                      <UIcon
                        name="i-heroicons-cpu-chip"
                        class="w-3.5 h-3.5 text-slate-400"
                      />
                    </div>
                  </div>

                  <!-- Bubble -->
                  <div
                    class="flex flex-col gap-1"
                    :class="msg.role === 'user' ? 'items-end' : 'items-start'"
                  >
                    <div v-if="msg.role === 'user'" class="msg-bubble-user">
                      {{ msg.content }}
                    </div>
                    <div
                      v-else
                      class="msg-bubble-assistant"
                      v-html="renderMarkdown(msg.content)"
                    ></div>

                    <!-- Token metadata for assistant -->
                    <div
                      v-if="msg.role === 'assistant' && getMetadata(msg)"
                      class="flex items-center gap-2 px-2"
                    >
                      <span class="text-[10px] text-slate-700">
                        {{ getMetadata(msg)!.tokens.toLocaleString() }}
                        {{ $t("agent.tokens_label") }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Thinking indicator -->
                <div v-if="sending" class="flex gap-3">
                  <div
                    class="w-7 h-7 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center shrink-0 mt-1"
                  >
                    <UIcon
                      name="i-heroicons-cpu-chip"
                      class="w-3.5 h-3.5 text-indigo-400 animate-pulse"
                    />
                  </div>
                  <div class="msg-bubble-assistant flex items-center gap-3">
                    <div class="flex gap-1.5 items-center">
                      <div class="thinking-dot"></div>
                      <div class="thinking-dot"></div>
                      <div class="thinking-dot"></div>
                    </div>
                    <span class="text-xs text-slate-500 italic">{{
                      $t("agent.thinking")
                    }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>

          <!-- Input bar -->
          <div
            class="px-4 py-3 border-t border-white/[0.06] bg-white/[0.01] shrink-0"
          >
            <div
              class="flex gap-2 items-end bg-white/[0.04] border border-white/[0.10] rounded-2xl px-4 py-2 transition-all duration-200 focus-within:border-indigo-500/40 focus-within:bg-white/[0.05]"
            >
              <textarea
                v-model="input"
                rows="1"
                :placeholder="
                  activeChatId
                    ? $t('agent.input_placeholder')
                    : $t('agent.no_chats_hint')
                "
                :disabled="!activeChatId || sending"
                class="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-600 focus:outline-none resize-none leading-relaxed py-1.5 max-h-36 overflow-y-auto custom-scrollbar disabled:opacity-50"
                style="field-sizing: content; min-height: 1.5rem"
                @keydown="handleKeydown"
                @input="
                  ($event.target as HTMLTextAreaElement).style.height = 'auto';
                  ($event.target as HTMLTextAreaElement).style.height =
                    ($event.target as HTMLTextAreaElement).scrollHeight + 'px';
                "
              />
              <button
                class="send-btn"
                :disabled="!input.trim() || !activeChatId || sending"
                @click="sendMessage()"
              >
                <UIcon
                  :name="
                    sending
                      ? 'i-heroicons-arrow-path'
                      : 'i-heroicons-paper-airplane'
                  "
                  class="w-4 h-4 text-white"
                  :class="sending ? 'animate-spin' : ''"
                />
              </button>
            </div>
            <p class="text-[10px] text-slate-700 text-center mt-2">
              ↵ Enter {{ $t("agent.send").toLowerCase() }} · Shift+↵ new line
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete confirm modal -->
    <UiConfirmModal
      v-model="showDeleteConfirm"
      :title="$t('agent.delete_confirm_title')"
      :description="$t('agent.delete_confirm_desc')"
      :confirm-text="$t('agent.delete_confirm_action')"
      :cancel-text="$t('agent.cancel')"
      :loading="deleting"
      type="danger"
      @confirm="confirmDeleteChat"
    />
  </div>
</template>
