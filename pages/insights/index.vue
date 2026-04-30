<script setup lang="ts">
import type { VideoIdeaCluster } from "~/shared/types";

definePageMeta({ middleware: "auth" });

const { t } = useI18n();
const toast = useToast();
const generating = ref(false);
const copiedHook = ref(false);
const selectedIdea = ref<VideoIdeaCluster | null>(null);

const {
  data: ideas,
  refresh,
  pending,
  error,
} = useFetch<VideoIdeaCluster[]>("/api/insights/video-ideas", { lazy: true });

const isAnalyzing = computed(
  () => generating.value || pending.value || error.value?.statusCode === 429,
);

// Auto-refresh if there's a conflict (another process is running)
watch(error, (err) => {
  if (err?.statusCode === 429 && import.meta.client) {
    setTimeout(() => {
      if (error.value?.statusCode === 429) refresh();
    }, 10000); // Check every 10s
  }
});

watch(
  [ideas, isAnalyzing],
  ([val, analyzing]) => {
    if (val?.length && !analyzing && !selectedIdea.value) {
      const stillExists = val.find((i) => i.id === selectedIdea.value?.id);
      selectedIdea.value = stillExists ?? val[0];
    }
  },
  { immediate: true },
);

watch(selectedIdea, () => {
  copiedHook.value = false;
});

async function regenerate() {
  if (generating.value) {
    toast.add({ title: t("insights.already_generating"), color: "orange" });
    return;
  }
  generating.value = true;
  selectedIdea.value = null;
  try {
    await $fetch("/api/insights/video-ideas", {
      method: "POST",
      headers: useCsrfHeaders(),
    });
    await refresh();
    toast.add({ title: t("insights.refreshed"), color: "green" });
  } catch (err: any) {
    if (err.statusCode === 429) {
      toast.add({ title: t("insights.already_generating"), color: "orange" });
    } else {
      toast.add({ title: t("insights.failed_refresh"), color: "red" });
    }
  } finally {
    generating.value = false;
  }
}

async function addToKb(idea: VideoIdeaCluster) {
  try {
    await $fetch("/api/knowledge-base", {
      method: "POST",
      body: {
        type: "faq",
        title: idea.suggestedTitle,
        content: `${t("insights.kb_objective")}: ${idea.strategicObjective}\n\n${t("insights.kb_hook")}: ${idea.viralHook}\n\n${t("insights.kb_pillars")}:\n${idea.keyPillars.map((p) => `- ${p}`).join("\n")}\n\n${t("insights.kb_tips")}: ${idea.productionTips}\n\n${t("insights.kb_questions")}:\n${idea.exampleQuestions.map((q) => `- ${q}`).join("\n")}`,
        priority: 50,
      },
      headers: useCsrfHeaders(),
    });
    toast.add({ title: t("insights.added_to_kb"), color: "green" });
  } catch {
    toast.add({ title: t("insights.failed_to_add"), color: "red" });
  }
}

async function copyHook(hook: string) {
  try {
    await navigator.clipboard.writeText(hook);
    copiedHook.value = true;
    setTimeout(() => {
      copiedHook.value = false;
    }, 2500);
    toast.add({ title: t("insights.copy_success"), color: "green" });
  } catch {
    toast.add({ title: t("insights.copy_error"), color: "red" });
  }
}

function demandSignal(count: number) {
  if (count >= 10)
    return {
      bars: 3,
      barColor: "bg-red-500",
      text: "text-red-400",
      label: t("insights.demand_high"),
    };
  if (count >= 5)
    return {
      bars: 2,
      barColor: "bg-amber-500",
      text: "text-amber-400",
      label: t("insights.demand_medium"),
    };
  return {
    bars: 1,
    barColor: "bg-indigo-500",
    text: "text-indigo-400",
    label: t("insights.demand_growing"),
  };
}

function opportunityScore(idea: VideoIdeaCluster) {
  return Math.min(99, Math.round(idea.demandCount * 4 + idea.totalLikes * 0.5));
}

const CIRC = 2 * Math.PI * 30;

const STEPS = [
  { icon: "i-heroicons-magnifying-glass", label: "Scanning comment patterns" },
  { icon: "i-heroicons-cpu-chip", label: "Clustering semantic topics" },
  { icon: "i-heroicons-users", label: "Profiling audience intent" },
  { icon: "i-heroicons-signal", label: "Computing demand signals" },
  { icon: "i-heroicons-sparkles", label: "Generating blueprints" },
  { icon: "i-heroicons-trophy", label: "Scoring opportunities" },
  { icon: "i-heroicons-fire", label: "Crafting viral hooks" },
];
const activeStep = ref(0);
let _stepTimer: ReturnType<typeof setInterval> | null = null;

watch(
  isAnalyzing,
  (val) => {
    if (val && import.meta.client) {
      activeStep.value = 0;
      if (_stepTimer) clearInterval(_stepTimer);
      _stepTimer = setInterval(() => {
        if (activeStep.value < STEPS.length - 1) activeStep.value++;
      }, 1300);
    } else {
      if (_stepTimer) clearInterval(_stepTimer);
      _stepTimer = null;
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  if (_stepTimer) clearInterval(_stepTimer);
});
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- ── Header ───────────────────────────────────────────────────── -->
    <div class="flex items-center justify-between">
      <div>
        <div
          class="flex items-center gap-1.5 text-[10px] font-black text-indigo-400 uppercase tracking-[0.35em] mb-1"
        >
          <UIcon name="i-heroicons-light-bulb" class="w-3 h-3" />
          {{ $t("insights.nav_label") }}
        </div>
        <h1
          class="text-2xl sm:text-3xl font-black text-white tracking-tighter leading-none"
        >
          {{ $t("insights.title") }}
        </h1>
        <p class="text-slate-500 text-xs mt-1.5">
          {{ $t("insights.subtitle") }}
        </p>
      </div>
      <UButton
        :loading="generating"
        :icon="generating ? undefined : 'i-heroicons-arrow-path'"
        color="indigo"
        variant="soft"
        size="sm"
        class="rounded-xl font-bold shrink-0"
        @click="regenerate"
      >
        <span class="hidden sm:inline">
          {{ generating ? $t("insights.analyzing") : $t("insights.refresh") }}
        </span>
      </UButton>
    </div>

    <!-- ── Loading (Initial state before analysis) ────────────────── -->
    <div
      v-if="!ideas && !isAnalyzing"
      class="grid grid-cols-1 lg:grid-cols-[20rem_1fr] gap-5"
    >
      <div class="space-y-3">
        <div
          v-for="i in 4"
          :key="i"
          class="h-28 rounded-2xl bg-white/[0.03] animate-pulse"
        />
      </div>
      <div
        class="h-[640px] rounded-3xl bg-white/[0.03] animate-pulse hidden lg:block"
      />
    </div>

    <!-- ── Empty ────────────────────────────────────────────────────── -->
    <div
      v-else-if="ideas?.length === 0 && !isAnalyzing"
      class="bg-white/[0.02] border border-white/[0.06] border-dashed rounded-3xl py-24 text-center"
    >
      <UIcon
        name="i-heroicons-light-bulb"
        class="w-12 h-12 mx-auto mb-3 text-slate-700"
      />
      <p
        class="text-slate-400 font-black uppercase tracking-widest text-sm mb-2"
      >
        {{ $t("insights.no_ideas_title") }}
      </p>
      <p class="text-slate-600 text-xs mb-6">
        {{ $t("insights.no_ideas_hint") }}
      </p>
      <UButton
        color="indigo"
        variant="soft"
        size="sm"
        class="rounded-xl"
        :loading="generating"
        @click="regenerate"
      >
        {{ $t("insights.analyze_button") }}
      </UButton>
    </div>

    <!-- ── Split Panel ──────────────────────────────────────────────── -->
    <div
      v-else
      class="grid grid-cols-1 lg:grid-cols-[20rem_1fr] xl:grid-cols-[22rem_1fr] gap-5 items-start"
    >
      <!-- LEFT · Mission List -->
      <div class="flex flex-col gap-2.5">
        <template v-if="!ideas || isAnalyzing">
          <div
            v-for="i in 4"
            :key="i"
            class="h-28 rounded-2xl bg-white/[0.03] border border-white/[0.05] animate-pulse"
          />
        </template>
        <template v-else>
          <button
            v-for="(idea, idx) in ideas"
            :key="idea.id"
            class="group relative w-full text-left rounded-2xl p-5 border transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            :class="
              selectedIdea?.id === idea.id
                ? 'bg-indigo-500/[0.07] border-indigo-500/30 shadow-lg shadow-indigo-500/5'
                : 'bg-white/[0.02] border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.08]'
            "
            @click="selectedIdea = idea"
          >
            <!-- Active indicator -->
            <div
              class="absolute left-0 inset-y-3 w-[3px] rounded-full transition-all duration-300"
              :class="
                selectedIdea?.id === idea.id
                  ? 'bg-indigo-500 opacity-100'
                  : 'opacity-0'
              "
            />

            <div class="flex items-start gap-3 pl-1 py-2 sm:py-0">
              <!-- Mission number -->
              <span
                class="font-mono text-[11px] font-black mt-0.5 shrink-0 transition-colors duration-200"
                :class="
                  selectedIdea?.id === idea.id
                    ? 'text-indigo-400'
                    : 'text-slate-700'
                "
              >
                {{ String(idx + 1).padStart(2, "0") }}
              </span>

              <div class="min-w-0 flex-1">
                <!-- Topic pill -->
                <span
                  class="inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border mb-1.5 transition-all duration-200"
                  :class="
                    selectedIdea?.id === idea.id
                      ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20'
                      : 'text-slate-600 bg-white/[0.02] border-white/[0.05]'
                  "
                >
                  {{ idea.topic }}
                </span>

                <!-- Title -->
                <p
                  class="text-sm font-black leading-snug line-clamp-2 mb-3 transition-colors duration-200"
                  :class="
                    selectedIdea?.id === idea.id
                      ? 'text-white'
                      : 'text-slate-300 group-hover:text-white'
                  "
                >
                  {{ idea.suggestedTitle }}
                </p>

                <!-- Demand signal bars -->
                <div class="flex items-center gap-2">
                  <div class="flex items-end gap-[3px] h-4">
                    <div
                      v-for="bar in 3"
                      :key="bar"
                      class="w-[3px] rounded-full transition-all duration-200"
                      :class="[
                        bar <= demandSignal(idea.demandCount).bars
                          ? demandSignal(idea.demandCount).barColor
                          : 'bg-slate-700',
                        bar === 1 ? 'h-[6px]' : bar === 2 ? 'h-[10px]' : 'h-4',
                      ]"
                    />
                  </div>
                  <span
                    class="text-[9px] font-black uppercase tracking-wider"
                    :class="demandSignal(idea.demandCount).text"
                  >
                    {{ $t("insights.signals", { n: idea.demandCount }) }}
                  </span>
                </div>
              </div>
            </div>
          </button>

          <!-- Refresh hint -->
          <p class="text-[10px] text-slate-700 text-center mt-1 font-medium">
            {{ $t("insights.refresh_hint") }} ·
            <button
              class="text-indigo-600 hover:text-indigo-400 transition-colors font-bold"
              @click="regenerate"
            >
              {{ $t("insights.force_analysis") }}
            </button>
          </p>
        </template>
      </div>

      <!-- RIGHT · Blueprint Detail Panel -->
      <Transition name="blueprint" mode="out-in">
        <!-- ── AI Generating State ─────────────────────────────────────── -->
        <div
          v-if="isAnalyzing"
          key="ai-generating"
          class="rounded-3xl overflow-hidden border border-indigo-500/20 bg-[#0b1120]/80 backdrop-blur-xl"
        >
          <!-- Scan Header -->
          <div
            class="relative p-8 border-b border-white/[0.05] overflow-hidden"
          >
            <div
              class="absolute inset-0 bg-gradient-to-br from-indigo-600/[0.07] to-transparent pointer-events-none"
            />
            <div
              class="ai-scan bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent pointer-events-none"
            />
            <div class="relative">
              <div class="flex items-center gap-2 mb-5">
                <div class="relative flex">
                  <div
                    class="w-2 h-2 rounded-full bg-indigo-500 animate-ping absolute opacity-60"
                  />
                  <div class="w-2 h-2 rounded-full bg-indigo-500 relative" />
                </div>
                <span
                  class="text-[10px] font-black text-indigo-400 uppercase tracking-[0.35em]"
                  >Neural Analysis</span
                >
              </div>
              <Transition name="step-fade" mode="out-in">
                <div :key="activeStep" class="mb-5">
                  <p class="text-xl font-black text-white leading-tight">
                    {{ STEPS[activeStep].label }}
                  </p>
                  <p class="text-[11px] text-slate-500 mt-1">
                    Analyzing your audience data...
                  </p>
                </div>
              </Transition>
              <div class="flex items-center gap-3">
                <div
                  class="flex-1 h-[2px] bg-white/[0.05] rounded-full overflow-hidden"
                >
                  <div
                    class="h-full bg-gradient-to-r from-indigo-600 to-indigo-400 rounded-full transition-all duration-700 ease-out"
                    :style="{
                      width: `${Math.round(((activeStep + 1) / STEPS.length) * 100)}%`,
                    }"
                  />
                </div>
                <span
                  class="text-[10px] font-black text-indigo-400 tabular-nums shrink-0"
                >
                  {{ Math.round(((activeStep + 1) / STEPS.length) * 100) }}%
                </span>
              </div>
            </div>
          </div>

          <!-- Steps list -->
          <div class="p-6 space-y-1">
            <div
              v-for="(step, i) in STEPS"
              :key="i"
              class="flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300 border"
              :class="
                i === activeStep
                  ? 'bg-indigo-500/[0.07] border-indigo-500/20'
                  : 'border-transparent'
              "
            >
              <div
                class="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 border"
                :class="
                  i < activeStep
                    ? 'bg-emerald-500/10 border-emerald-500/20'
                    : i === activeStep
                      ? 'bg-indigo-500/10 border-indigo-500/20'
                      : 'bg-white/[0.02] border-white/[0.05]'
                "
              >
                <UIcon
                  v-if="i < activeStep"
                  name="i-heroicons-check"
                  class="w-3 h-3 text-emerald-400"
                />
                <div
                  v-else-if="i === activeStep"
                  class="w-2.5 h-2.5 border-[1.5px] border-indigo-400 border-t-transparent rounded-full animate-spin"
                />
                <UIcon
                  v-else
                  :name="step.icon"
                  class="w-3 h-3 text-slate-700"
                />
              </div>
              <span
                class="text-xs font-bold transition-colors duration-300"
                :class="
                  i < activeStep
                    ? 'text-slate-600'
                    : i === activeStep
                      ? 'text-white'
                      : 'text-slate-700'
                "
                >{{ step.label }}</span
              >
              <span
                v-if="i < activeStep"
                class="ml-auto text-[9px] font-black text-emerald-600/70 uppercase tracking-wider"
                >done</span
              >
              <span
                v-else-if="i === activeStep"
                class="ml-auto text-[9px] font-black text-indigo-400 uppercase tracking-wider animate-pulse"
                >live</span
              >
            </div>
          </div>

          <!-- Wave visualization -->
          <div class="px-6 pb-6">
            <div
              class="flex items-end gap-[3px] h-8 px-4 rounded-2xl bg-white/[0.02] border border-white/[0.04] justify-center overflow-hidden"
            >
              <div
                v-for="n in 30"
                :key="n"
                class="w-[3px] rounded-full bg-indigo-500/40 wave-bar shrink-0"
                :style="{ animationDelay: `${(n - 1) * 0.055}s` }"
              />
            </div>
          </div>
        </div>

        <div
          v-else-if="selectedIdea"
          :key="selectedIdea.id"
          class="rounded-3xl overflow-hidden border border-white/[0.07] bg-[#0b1120]/80 backdrop-blur-xl"
        >
          <!-- Panel Header -->
          <div class="relative p-8 border-b border-white/[0.05]">
            <div
              class="absolute inset-0 bg-gradient-to-br from-indigo-600/[0.06] via-transparent to-transparent pointer-events-none"
            />
            <div class="relative">
              <div class="flex items-start justify-between gap-6">
                <div class="min-w-0 flex-1">
                  <span
                    class="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 mb-3"
                  >
                    <UIcon name="i-heroicons-light-bulb" class="w-3 h-3" />
                    {{ selectedIdea.topic }}
                  </span>
                  <h2
                    class="text-2xl sm:text-3xl font-black text-white tracking-tight leading-tight"
                  >
                    {{ selectedIdea.suggestedTitle }}
                  </h2>
                </div>

                <!-- Opportunity Score Ring -->
                <div class="shrink-0 flex flex-col items-center gap-1">
                  <div class="relative w-[68px] h-[68px]">
                    <svg class="w-full h-full -rotate-90" viewBox="0 0 80 80">
                      <circle
                        cx="40"
                        cy="40"
                        r="30"
                        class="fill-none stroke-white/[0.05]"
                        stroke-width="6"
                      />
                      <circle
                        cx="40"
                        cy="40"
                        r="30"
                        class="fill-none stroke-indigo-500 transition-all duration-700 ease-out"
                        stroke-width="6"
                        stroke-linecap="round"
                        :stroke-dasharray="CIRC"
                        :stroke-dashoffset="
                          CIRC - (CIRC * opportunityScore(selectedIdea)) / 100
                        "
                      />
                    </svg>
                    <div
                      class="absolute inset-0 flex flex-col items-center justify-center"
                    >
                      <span class="text-lg font-black text-white leading-none">
                        {{ opportunityScore(selectedIdea) }}
                      </span>
                      <span
                        class="text-[7px] font-bold text-slate-500 uppercase tracking-widest"
                        >{{ $t("insights.opp_score").split(" ")[0] }}</span
                      >
                    </div>
                  </div>
                  <span
                    class="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em]"
                    >{{ $t("insights.opp_score").split(" ")[1] }}</span
                  >
                </div>
              </div>

              <!-- Demand metrics strip -->
              <div class="mt-5 flex items-center gap-5 flex-wrap">
                <div class="flex flex-col">
                  <span class="text-xl font-black text-white leading-none">{{
                    selectedIdea.demandCount
                  }}</span>
                  <span
                    class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5"
                    >{{ $t("insights.signals", { n: "" }).trim() }}</span
                  >
                </div>
                <div class="w-px h-7 bg-white/[0.06]" />
                <div class="flex flex-col">
                  <span class="text-xl font-black text-white leading-none">{{
                    selectedIdea.totalLikes
                  }}</span>
                  <span
                    class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-0.5"
                    >{{ $t("insights.total_likes") }}</span
                  >
                </div>
                <div class="w-px h-7 bg-white/[0.06]" />
                <div class="flex items-center gap-2">
                  <div class="flex items-end gap-[3px] h-5">
                    <div
                      v-for="bar in 3"
                      :key="bar"
                      class="w-[3px] rounded-full"
                      :class="[
                        bar <= demandSignal(selectedIdea.demandCount).bars
                          ? demandSignal(selectedIdea.demandCount).barColor
                          : 'bg-slate-700',
                        bar === 1 ? 'h-[7px]' : bar === 2 ? 'h-[13px]' : 'h-5',
                      ]"
                    />
                  </div>
                  <span
                    class="text-[10px] font-black uppercase tracking-widest"
                    :class="demandSignal(selectedIdea.demandCount).text"
                  >
                    {{ demandSignal(selectedIdea.demandCount).label }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- Panel Body -->
          <div class="p-8 space-y-8">
            <!-- 1 · VIRAL HOOK -->
            <section>
              <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2.5">
                  <div
                    class="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20"
                  >
                    <UIcon
                      name="i-heroicons-fire"
                      class="w-4 h-4 text-amber-400"
                    />
                  </div>
                  <span
                    class="text-[10px] font-black text-amber-400 uppercase tracking-[0.3em]"
                  >
                    {{ $t("insights.viral_hook") }}
                  </span>
                </div>
                <button
                  class="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-lg border transition-all duration-200"
                  :class="
                    copiedHook
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                      : 'text-amber-500/80 bg-amber-500/5 border-amber-500/10 hover:text-amber-400 hover:border-amber-500/30'
                  "
                  @click="copyHook(selectedIdea.viralHook)"
                >
                  <UIcon
                    :name="
                      copiedHook ? 'i-heroicons-check' : 'i-heroicons-clipboard'
                    "
                    class="w-3 h-3"
                  />
                  {{ copiedHook ? $t("insights.copied") : $t("insights.copy") }}
                </button>
              </div>
              <div
                class="relative p-5 rounded-2xl bg-amber-500/[0.04] border border-amber-500/10 overflow-hidden"
              >
                <div
                  class="absolute top-3.5 left-4 w-[3px] h-4 bg-amber-500/60 rounded-full animate-pulse"
                />
                <p
                  class="text-sm text-amber-100/80 italic leading-relaxed font-medium pl-5"
                >
                  "{{ selectedIdea.viralHook }}"
                </p>
              </div>
            </section>

            <!-- 2 · STRATEGIC OBJECTIVE -->
            <section>
              <div class="flex items-center gap-2.5 mb-3">
                <div
                  class="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
                >
                  <UIcon
                    name="i-heroicons-bolt"
                    class="w-4 h-4 text-indigo-400"
                  />
                </div>
                <span
                  class="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em]"
                >
                  {{ $t("insights.strategic_objective") }}
                </span>
              </div>
              <p class="text-sm text-slate-300 leading-relaxed font-medium">
                {{ selectedIdea.strategicObjective }}
              </p>
            </section>

            <!-- 3 · CONTENT BLUEPRINT PILLARS -->
            <section>
              <div class="flex items-center gap-2.5 mb-4">
                <div
                  class="p-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20"
                >
                  <UIcon
                    name="i-heroicons-list-bullet"
                    class="w-4 h-4 text-violet-400"
                  />
                </div>
                <span
                  class="text-[10px] font-black text-violet-400 uppercase tracking-[0.3em]"
                >
                  {{ $t("insights.content_blueprint") }}
                </span>
              </div>
              <div class="space-y-3">
                <div
                  v-for="(pillar, i) in selectedIdea.keyPillars"
                  :key="i"
                  class="flex items-start gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] transition-colors"
                >
                  <span
                    class="shrink-0 w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center font-mono text-[10px] font-black text-violet-400"
                  >
                    {{ String(i + 1).padStart(2, "0") }}
                  </span>
                  <p
                    class="text-sm text-slate-300 leading-relaxed font-medium pt-0.5"
                  >
                    {{ pillar }}
                  </p>
                </div>
              </div>
            </section>

            <!-- 4 · PRODUCTION GUIDE + KPI (2 cols) -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <section>
                <div class="flex items-center gap-2.5 mb-3">
                  <div
                    class="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20"
                  >
                    <UIcon
                      name="i-heroicons-video-camera"
                      class="w-4 h-4 text-sky-400"
                    />
                  </div>
                  <span
                    class="text-[10px] font-black text-sky-400 uppercase tracking-[0.3em]"
                  >
                    {{ $t("insights.production_guide") }}
                  </span>
                </div>
                <div
                  class="p-4 rounded-xl bg-sky-500/[0.03] border border-sky-500/10"
                >
                  <p class="text-sm text-slate-400 leading-relaxed">
                    {{ selectedIdea.productionTips }}
                  </p>
                </div>
              </section>

              <section>
                <div class="flex items-center gap-2.5 mb-3">
                  <div
                    class="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
                  >
                    <UIcon
                      name="i-heroicons-chart-bar"
                      class="w-4 h-4 text-emerald-400"
                    />
                  </div>
                  <span
                    class="text-[10px] font-black text-emerald-400 uppercase tracking-[0.3em]"
                  >
                    {{ $t("insights.expected_kpi") }}
                  </span>
                </div>
                <div
                  class="p-4 rounded-xl bg-emerald-500/[0.03] border border-emerald-500/10"
                >
                  <p class="text-sm text-slate-400 leading-relaxed">
                    {{ selectedIdea.expectedOutcome }}
                  </p>
                </div>
              </section>
            </div>

            <!-- 5 · AUDIENCE VOICE -->
            <section>
              <div class="flex items-center gap-2.5 mb-4">
                <div
                  class="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20"
                >
                  <UIcon
                    name="i-heroicons-chat-bubble-left-ellipsis"
                    class="w-4 h-4 text-rose-400"
                  />
                </div>
                <span
                  class="text-[10px] font-black text-rose-400 uppercase tracking-[0.3em]"
                >
                  {{ $t("insights.audience_voice") }}
                </span>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div
                  v-for="(q, i) in selectedIdea.exampleQuestions"
                  :key="i"
                  class="relative p-4 rounded-xl bg-white/[0.02] border border-white/[0.04] overflow-hidden"
                >
                  <span
                    class="absolute top-1 left-2 text-rose-500/15 font-black text-5xl leading-none select-none"
                    >"</span
                  >
                  <p
                    class="text-xs text-slate-400 italic leading-relaxed relative z-10"
                  >
                    {{ q }}
                  </p>
                </div>
              </div>
            </section>

            <!-- 6 · ACTIONS -->
            <div
              class="flex items-center gap-3 pt-2 border-t border-white/[0.05]"
            >
              <UButton
                size="md"
                color="indigo"
                variant="soft"
                icon="i-heroicons-sparkles"
                class="rounded-xl font-black text-xs px-5"
                @click="addToKb(selectedIdea)"
              >
                {{ $t("insights.add_to_kb") }}
              </UButton>
              <UButton
                size="md"
                color="amber"
                variant="soft"
                :icon="
                  copiedHook ? 'i-heroicons-check' : 'i-heroicons-clipboard'
                "
                class="rounded-xl font-black text-xs px-5 transition-colors"
                :class="
                  copiedHook
                    ? '!text-emerald-400 !bg-emerald-500/10 !border-emerald-500/20'
                    : ''
                "
                @click="copyHook(selectedIdea.viralHook)"
              >
                {{ copiedHook ? $t("insights.copied") : $t("insights.copy") }}
              </UButton>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>

<style scoped>
@keyframes ai-scan {
  from {
    top: 0;
  }
  to {
    top: 100%;
  }
}
.ai-scan {
  position: absolute;
  left: 0;
  right: 0;
  height: 1px;
  animation: ai-scan 2.5s linear infinite;
}

@keyframes wave-bar {
  0%,
  100% {
    transform: scaleY(0.15);
    opacity: 0.3;
  }
  50% {
    transform: scaleY(1);
    opacity: 0.8;
  }
}
.wave-bar {
  height: 28px;
  transform-origin: bottom;
  animation: wave-bar 1.2s ease-in-out infinite;
}

.step-fade-enter-active,
.step-fade-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.step-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.step-fade-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

.blueprint-enter-active,
.blueprint-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}
.blueprint-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.blueprint-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
