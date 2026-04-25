<script setup lang="ts">
import type { KnowledgeBaseEntry, KBType } from "~/shared/types";

definePageMeta({ middleware: "auth" });

const { t } = useI18n();

const { data, refresh } = await useFetch<{ items: KnowledgeBaseEntry[] }>(
  "/api/knowledge-base",
  {
    query: { active: "false" },
  },
);

const showForm = ref(false);
const editingEntry = ref<KnowledgeBaseEntry | null>(null);
const saving = ref(false);
const toast = useToast();

const form = ref({
  type: "faq" as KBType,
  title: "",
  content: "",
  priority: 0,
});

function openNew() {
  editingEntry.value = null;
  form.value = { type: "faq", title: "", content: "", priority: 0 };
  showForm.value = true;
}

function openEdit(entry: KnowledgeBaseEntry) {
  editingEntry.value = entry;
  form.value = {
    type: entry.type,
    title: entry.title,
    content: entry.content,
    priority: entry.priority ?? 0,
  };
  showForm.value = true;
}

async function saveEntry() {
  saving.value = true;
  try {
    if (editingEntry.value) {
      await $fetch(`/api/knowledge-base/${editingEntry.value.id}`, {
        method: "PATCH",
        body: form.value,
        headers: useCsrfHeaders(),
      });
      toast.add({ title: t('knowledge_base.updated'), color: "green" });
    } else {
      await $fetch("/api/knowledge-base", {
        method: "POST",
        body: form.value,
        headers: useCsrfHeaders(),
      });
      toast.add({ title: t('knowledge_base.created'), color: "green" });
    }
    showForm.value = false;
    await refresh();
  } catch {
    toast.add({ title: t('knowledge_base.save_failed'), color: "red" });
  } finally {
    saving.value = false;
  }
}

async function toggleActive(entry: KnowledgeBaseEntry) {
  await $fetch(`/api/knowledge-base/${entry.id}`, {
    method: "PATCH",
    body: { isActive: !entry.isActive },
    headers: useCsrfHeaders(),
  });
  await refresh();
}

const typeConfig: Record<
  KBType,
  {
    color: string;
    bg: string;
    border: string;
    text: string;
    icon: string;
  }
> = {
  channel_style: {
    color: "purple",
    bg: "bg-purple-500/10",
    border: "border-purple-500/20",
    text: "text-purple-400",
    icon: "i-heroicons-sparkles",
  },
  faq: {
    color: "blue",
    bg: "bg-blue-500/10",
    border: "border-blue-500/20",
    text: "text-blue-400",
    icon: "i-heroicons-question-mark-circle",
  },
  topic: {
    color: "green",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    text: "text-emerald-400",
    icon: "i-heroicons-hashtag",
  },
  persona: {
    color: "orange",
    bg: "bg-orange-500/10",
    border: "border-orange-500/20",
    text: "text-orange-400",
    icon: "i-heroicons-user-circle",
  },
  rule: {
    color: "red",
    bg: "bg-red-500/10",
    border: "border-red-500/20",
    text: "text-red-400",
    icon: "i-heroicons-shield-exclamation",
  },
  custom: {
    color: "gray",
    bg: "bg-white/[0.06]",
    border: "border-white/10",
    text: "text-slate-400",
    icon: "i-heroicons-cog-6-tooth",
  },
};

const typeOptions = computed(() => [
  { label: t('knowledge_base.types.channel_style'), value: "channel_style" },
  { label: t('knowledge_base.types.faq'), value: "faq" },
  { label: t('knowledge_base.types.topic'), value: "topic" },
  { label: t('knowledge_base.types.persona'), value: "persona" },
  { label: t('knowledge_base.types.rule'), value: "rule" },
  { label: t('knowledge_base.types.custom'), value: "custom" },
]);
</script>

<style scoped>
.glass-card {
  @apply bg-white/[0.03] backdrop-blur-xl border border-white/[0.08] rounded-3xl transition-all duration-300;
  box-shadow:
    0 4px 24px -1px rgba(0, 0, 0, 0.2),
    inset 0 1px 1px 0 rgba(255, 255, 255, 0.05);
}

.glass-card:hover {
  @apply border-white/[0.12] bg-white/[0.04] -translate-y-1;
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
</style>

<template>
  <div>
    <div class="flex items-center justify-between mb-8 animate-fade-in">
      <div class="flex flex-col">
        <div
          class="flex items-center gap-2 text-[10px] font-bold text-indigo-400 uppercase tracking-[0.3em]"
        >
          <UIcon name="i-heroicons-cpu-chip" class="w-3 h-3" />
          {{ $t('knowledge_base.center_label') }}
        </div>
        <h1 class="text-3xl font-black text-white tracking-tighter">
          {{ $t('knowledge_base.title') }}
        </h1>
        <p class="text-slate-500 text-sm mt-1">
          {{ $t('knowledge_base.subtitle') }}
        </p>
      </div>
      <button
        class="premium-btn-primary group flex items-center gap-2"
        @click="openNew"
      >
        <UIcon
          name="i-heroicons-plus"
          class="w-5 h-5 group-hover:rotate-90 transition-transform duration-300"
        />
        <span>{{ $t('knowledge_base.add') }}</span>
      </button>
    </div>

    <div
      v-if="!data?.items?.length"
      class="glass-card py-24 text-center border-dashed border-white/10 bg-white/[0.01] animate-fade-in stagger-1"
    >
      <div class="relative w-20 h-20 mx-auto mb-6">
        <div
          class="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full"
        ></div>
        <UIcon
          name="i-heroicons-book-open"
          class="relative w-20 h-20 text-indigo-500/40"
        />
      </div>
      <h3 class="text-lg font-bold text-white mb-2">{{ $t('knowledge_base.no_entries_title') }}</h3>
      <p class="text-slate-500 text-sm max-w-xs mx-auto">
        {{ $t('knowledge_base.no_entries_hint') }}
      </p>
    </div>

    <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      <div
        v-for="(entry, index) in data.items"
        :key="entry.id"
        class="glass-card p-6 flex flex-col animate-slide-up"
        :class="[
          !entry.isActive ? 'opacity-50 grayscale-[0.5]' : '',
          `stagger-${(index % 4) + 1}`,
        ]"
      >
        <div class="flex items-center justify-between mb-4">
          <div
            class="w-10 h-10 rounded-xl flex items-center justify-center border transition-colors duration-300"
            :class="[
              typeConfig[entry.type].bg,
              typeConfig[entry.type].border,
              typeConfig[entry.type].text,
            ]"
          >
            <UIcon :name="typeConfig[entry.type].icon" class="w-5 h-5" />
          </div>
          <div class="flex items-center gap-1">
            <button
              class="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition-all duration-300 cursor-pointer"
              @click="openEdit(entry)"
            >
              <UIcon name="i-heroicons-pencil-square" class="w-4 h-4" />
            </button>
            <button
              class="p-2 rounded-lg transition-all duration-300 cursor-pointer"
              :class="
                entry.isActive
                  ? 'text-slate-500 hover:text-white hover:bg-white/10'
                  : 'text-emerald-500 hover:text-emerald-400 hover:bg-emerald-500/10'
              "
              @click="toggleActive(entry)"
            >
              <UIcon
                :name="
                  entry.isActive ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'
                "
                class="w-4 h-4"
              />
            </button>
          </div>
        </div>

        <div class="flex-1">
          <div class="flex items-center gap-2 mb-2">
            <h3 class="font-bold text-white truncate flex-1 tracking-tight">
              {{ entry.title }}
            </h3>
            <span
              class="text-[10px] font-black text-slate-700 bg-white/5 px-1.5 py-0.5 rounded uppercase tracking-tighter"
              >P:{{ entry.priority }}</span
            >
          </div>
          <p
            class="text-slate-400 text-sm leading-relaxed line-clamp-4 font-medium mb-4"
          >
            {{ entry.content }}
          </p>
        </div>

        <div
          class="pt-4 mt-auto border-t border-white/[0.06] flex items-center justify-between"
        >
          <span
            class="text-[10px] font-bold text-slate-600 uppercase tracking-widest"
            >{{ $t('knowledge_base.types.' + entry.type) }}</span
          >
          <div v-if="entry.isActive" class="flex items-center gap-1.5">
            <div
              class="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
            ></div>
            <span
              class="text-[10px] font-bold text-emerald-500 uppercase tracking-widest"
              >{{ $t('knowledge_base.active') }}</span
            >
          </div>
          <span
            v-else
            class="text-[10px] font-bold text-slate-600 uppercase tracking-widest"
            >{{ $t('knowledge_base.inactive') }}</span
          >
        </div>
      </div>
    </div>

    <!-- Form modal -->
    <UModal
      v-model="showForm"
      :ui="{
        width: 'sm:max-w-lg',
        background: 'bg-transparent',
        shadow: 'none',
      }"
    >
      <div
        class="glass-card overflow-hidden border-indigo-500/20 shadow-[0_0_50px_rgba(79,70,229,0.15)] !bg-color-transparent"
      >
        <div
          class="px-8 py-6 border-b border-white/[0.06] flex items-center gap-3 bg-white/[0.01]"
        >
          <div
            class="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center border border-indigo-500/20"
          >
            <UIcon
              :name="
                editingEntry
                  ? 'i-heroicons-pencil-square'
                  : 'i-heroicons-plus-circle'
              "
              class="w-5 h-5 text-indigo-400"
            />
          </div>
          <div class="flex flex-col">
            <span
              class="text-[10px] font-bold text-indigo-400 uppercase tracking-widest"
              >{{ editingEntry ? $t('knowledge_base.modification') : $t('knowledge_base.creation') }}</span
            >
            <h2 class="font-black text-xl text-white tracking-tight">
              {{ editingEntry ? $t('knowledge_base.edit_title') : $t('knowledge_base.new_title') }}
            </h2>
          </div>
        </div>

        <div class="p-8 space-y-6">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <label
                class="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1"
                >{{ $t('knowledge_base.category') }}</label
              >
              <USelect
                v-model="form.type"
                :options="typeOptions"
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
                >{{ $t('knowledge_base.priority') }}</label
              >
              <UInput
                v-model.number="form.priority"
                type="number"
                min="0"
                max="100"
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

          <div class="space-y-2">
            <label
              class="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1"
              >{{ $t('knowledge_base.title_field') }}</label
            >
            <UInput
              v-model="form.title"
              :placeholder="$t('knowledge_base.title_placeholder')"
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
              >{{ $t('knowledge_base.content_label') }}</label
            >
            <textarea
              v-model="form.content"
              rows="12"
              :placeholder="$t('knowledge_base.content_placeholder')"
              class="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-indigo-500/50 transition-colors resize-none font-medium leading-relaxed"
            />
          </div>
        </div>

        <div
          class="px-8 py-6 border-t border-white/[0.06] bg-white/[0.01] flex gap-3 justify-end"
        >
          <button
            class="px-6 py-3 rounded-xl text-sm font-bold text-slate-400 hover:text-white hover:bg-white/5 transition-all duration-300 cursor-pointer"
            @click="showForm = false"
          >
            {{ $t('knowledge_base.cancel') }}
          </button>
          <button
            class="premium-btn-primary flex items-center gap-2 py-3 px-8"
            :disabled="saving"
            @click="saveEntry"
          >
            <UIcon
              v-if="saving"
              name="i-heroicons-arrow-path"
              class="w-4 h-4 animate-spin"
            />
            <UIcon v-else name="i-heroicons-check-circle" class="w-4 h-4" />
            {{ saving ? $t('knowledge_base.saving') : $t('knowledge_base.save') }}
          </button>
        </div>
      </div>
    </UModal>
  </div>
</template>
