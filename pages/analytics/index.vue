<script setup lang="ts">
import type {
  AnalyticsOverview,
  SentimentDataPoint,
  TopicCluster,
  VideoCommentStats,
} from "~/shared/types";

definePageMeta({ middleware: "auth" });

const { data: overview } = useFetch<AnalyticsOverview>(
  "/api/analytics/overview",
  { lazy: true },
);
const { data: sentiment } = useFetch<SentimentDataPoint[]>(
  "/api/analytics/sentiment",
  { lazy: true },
);
const { data: topics } = useFetch<TopicCluster[]>("/api/analytics/topics", {
  lazy: true,
});
const { data: audience } = useFetch<{
  superfans: any[];
  languageDistribution: any[];
}>("/api/analytics/audience", { lazy: true });
const { data: videoStats } = useFetch<VideoCommentStats[]>(
  "/api/analytics/video-stats",
  {
    query: { limit: 12 },
    lazy: true,
  },
);

const lastVideos = computed(() => videoStats.value?.slice(0, 12) || []);

const FLAG: Record<string, string> = {
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
};

function sentimentBar(week: any) {
  const total = week.total || 1;
  return {
    pos: Math.round((week.positive / total) * 100),
    cur: Math.round((week.curious / total) * 100),
    neu: Math.round((week.neutral / total) * 100),
    neg: Math.round((week.negative / total) * 100),
  };
}

function replyRateColor(rate: number) {
  if (rate >= 60) return "text-emerald-400";
  if (rate >= 30) return "text-amber-400";
  return "text-red-400";
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="mb-8">
      <div
        class="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-[0.3em] mb-1"
      >
        <UIcon name="i-heroicons-chart-bar" class="w-3.5 h-3.5" />
        {{ $t("nav.analytics") }}
      </div>
      <h1 class="text-2xl sm:text-4xl font-black text-white tracking-tighter">
        {{ $t("analytics.title") }}
      </h1>
    </div>


    <!-- Overview Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
      <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
        <p
          class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2"
        >
          {{ $t("analytics.reply_rate") }}
        </p>
        <p
          class="text-4xl font-black"
          :class="replyRateColor(overview?.replyRate ?? 0)"
        >
          {{ overview?.replyRate ?? "—" }}<span class="text-xl">%</span>
        </p>
        <p class="text-[11px] text-slate-600 mt-1">{{ $t("analytics.reply_rate_desc") }}</p>
      </div>
      <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
        <p
          class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2"
        >
          {{ $t("analytics.last_30_days") }}
        </p>
        <p class="text-4xl font-black text-white">
          {{ overview?.totalCommentsLast30Days ?? "—" }}
        </p>
        <p class="text-[11px] text-slate-600 mt-1">{{ $t("analytics.last_30_days_desc") }}</p>
      </div>
      <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
        <p
          class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2"
        >
          {{ $t("analytics.return_rate") }}
        </p>
        <p class="text-4xl font-black text-violet-400">
          {{ overview?.returnCommenterRate ?? "—"
          }}<span class="text-xl">%</span>
        </p>
        <p class="text-[11px] text-slate-600 mt-1">{{ $t("analytics.return_rate_desc") }}</p>
      </div>
      <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
        <p
          class="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2"
        >
          {{ $t("analytics.sentiment_label") }}
        </p>
        <div class="flex flex-col gap-1 mt-2">
          <div class="flex justify-between items-center text-sm font-black">
            <span class="text-emerald-400">Positivo</span>
            <span class="text-white">{{ overview?.sentiment.positive ?? 0 }}%</span>
          </div>
          <div class="flex justify-between items-center text-sm font-black">
            <span class="text-blue-400">Dudas/Preguntas</span>
            <span class="text-white">{{ overview?.sentiment.curious ?? 0 }}%</span>
          </div>
          <div class="flex justify-between items-center text-sm font-black">
            <span class="text-red-400">Críticas</span>
            <span class="text-white">{{ overview?.sentiment.negative ?? 0 }}%</span>
          </div>
        </div>
        <p class="text-[11px] text-slate-600 mt-2">{{ $t("analytics.sentiment_desc") }}</p>
      </div>

    </div>


    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
      <!-- Sentiment Trend -->
      <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
        <div class="flex items-center justify-between mb-6">
          <h2
            class="text-xs font-black text-slate-400 uppercase tracking-[0.2em]"
          >
            {{ $t("analytics.sentiment_trend") }}
          </h2>
          <!-- Legend -->
          <div class="flex gap-4">
            <div class="flex items-center gap-1.5">
              <div class="w-2 h-2 rounded-full bg-emerald-400"></div>
              <span class="text-[11px] font-black text-slate-500 uppercase">{{ $t("analytics.pos") }}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <div class="w-2 h-2 rounded-full bg-slate-500"></div>
              <span class="text-[11px] font-black text-slate-500 uppercase">{{ $t("analytics.neu") }}</span>
            </div>
            <div class="flex items-center gap-1.5">
              <div class="w-2 h-2 rounded-full bg-red-400"></div>
              <span class="text-[11px] font-black text-slate-500 uppercase">{{ $t("analytics.neg") }}</span>
            </div>
          </div>
        </div>


        <div v-if="sentiment?.length" class="space-y-5">
          <div
            v-for="week in sentiment"
            :key="week.date"
            class="flex flex-col gap-2"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-black text-slate-400">
                {{ $t("analytics.week_of", { d: new Date(week.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) }) }}
              </span>
              <span class="text-xs font-bold text-slate-600">
                {{ $t("analytics.comments_count", { n: week.total }) }}
              </span>
            </div>

            
            <div class="w-full h-6 rounded-lg overflow-hidden flex bg-white/[0.02] border border-white/[0.05]">
              <div
                v-if="sentimentBar(week).pos > 0"
                class="bg-emerald-500/60 h-full transition-all border-r border-black/20 flex items-center justify-center text-xs font-black text-emerald-100"
                :style="{ width: sentimentBar(week).pos + '%' }"
              >
                <span v-if="sentimentBar(week).pos > 15">{{ sentimentBar(week).pos }}%</span>
              </div>
              <div
                v-if="sentimentBar(week).cur > 0"
                class="bg-blue-500/50 h-full transition-all border-r border-black/20 flex items-center justify-center text-xs font-black text-blue-100"
                :style="{ width: sentimentBar(week).cur + '%' }"
              >
                <span v-if="sentimentBar(week).cur > 15">{{ sentimentBar(week).cur }}%</span>
              </div>
              <div
                v-if="sentimentBar(week).neu > 0"
                class="bg-slate-500/20 h-full transition-all border-r border-black/20 flex items-center justify-center text-xs font-black text-slate-400"
                :style="{ width: sentimentBar(week).neu + '%' }"
              >
                <span v-if="sentimentBar(week).neu > 15">{{ sentimentBar(week).neu }}%</span>
              </div>

              <div
                v-if="sentimentBar(week).neg > 0"
                class="bg-red-500/50 h-full transition-all flex items-center justify-center text-xs font-black text-red-100"
                :style="{ width: sentimentBar(week).neg + '%' }"
              >
                <span v-if="sentimentBar(week).neg > 15">{{ sentimentBar(week).neg }}%</span>
              </div>

            </div>
          </div>
        </div>
        <div v-else class="py-12 text-center text-slate-600 text-sm">
          {{ $t("analytics.no_trend") }}
        </div>

      </div>


      <!-- Language Distribution -->
      <div class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5">
        <h2
          class="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-4"
        >
          {{ $t("analytics.audience_languages") }}
        </h2>

        <div v-if="audience?.languageDistribution?.length" class="space-y-2">
          <div
            v-for="l in audience.languageDistribution"
            :key="l.lang"
            class="flex items-center gap-3"
          >
            <span class="text-base w-6">{{ FLAG[l.lang] ?? "🌐" }}</span>
            <span class="text-xs font-bold text-slate-300 uppercase w-8">{{
              l.lang
            }}</span>
            <div
              class="flex-1 h-2.5 rounded-full bg-white/[0.05] overflow-hidden"
            >

              <div
                class="h-full rounded-full bg-indigo-500/60"
                :style="{
                  width:
                    Math.min(
                      100,
                      (l.count /
                        (audience!.languageDistribution[0]?.count || 1)) *
                        100,
                    ) + '%',
                }"
              />
            </div>
            <span class="text-[11px] font-bold text-slate-500 w-8 text-right">{{
              l.count
            }}</span>
          </div>
        </div>
        <div v-else class="py-8 text-center text-slate-600 text-sm">
          {{ $t("analytics.no_languages") }}
        </div>

      </div>
    </div>

    <!-- Top Topics -->
    <div
      class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-5 mb-6"
    >
      <div class="flex items-center justify-between mb-4">
        <h2
          class="text-xs font-black text-slate-400 uppercase tracking-[0.2em]"
        >
          {{ $t("analytics.top_topics") }}
        </h2>
        <NuxtLink
          to="/insights"
          class="text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          {{ $t("analytics.video_ideas") }} →
        </NuxtLink>
      </div>

      <div v-if="topics?.length" class="flex flex-wrap gap-2">
        <div
          v-for="t in topics"
          :key="t.topic"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] group hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all cursor-default"
          :title="t.exampleComments[0]"
        >
          <span class="text-xs font-bold text-slate-300">{{ t.topic }}</span>
          <span class="text-[10px] font-black text-indigo-400"
            >×{{ t.count }}</span
          >
          <span
            v-if="t.totalLikes > 0"
            class="text-[9px] text-slate-600 flex items-center gap-0.5"
          >
            <UIcon name="i-heroicons-hand-thumb-up" class="w-2.5 h-2.5" />{{
              t.totalLikes
            }}
          </span>
        </div>
      </div>
      <div v-else class="py-6 text-center text-slate-600 text-sm">
        {{ $t("analytics.no_topics") }}
      </div>

    </div>

    <!-- Superfan Leaderboard -->
    <div class="mb-12">
      <div
        class="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-[0.3em] mb-1"
      >
        <UIcon name="i-heroicons-user-group" class="w-3.5 h-3.5" />
        Top Commenters
      </div>
      <h2 class="text-2xl font-black text-white tracking-tight mb-6">
        {{ $t("analytics.superfans_title") }}
      </h2>


      <div
        v-if="audience?.superfans?.length"
        class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
      >
        <div
          v-for="(fan, idx) in audience.superfans"
          :key="fan.authorChannelId ?? idx"
          class="group relative bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 flex flex-col items-center text-center hover:bg-white/[0.05] hover:border-violet-500/30 transition-all duration-300"
        >
          <!-- Rank Badge -->
          <div
            class="absolute top-3 left-3 w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center text-xs font-black text-slate-500"
          >
            #{{ idx + 1 }}
          </div>


          <!-- Avatar -->
          <UAvatar
            :src="fan.authorProfileImageUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(fan.authorName || 'User')}&background=6366f1&color=fff`"
            size="xl"
            class="mb-4 ring-1 ring-white/10 group-hover:scale-110 transition-transform duration-500"
            :alt="fan.authorName"
          />

          <!-- Name & Link -->
          <a
            :href="`https://www.youtube.com/channel/${fan.authorChannelId}`"
            target="_blank"
            class="text-sm font-bold text-white hover:text-violet-400 transition-colors mb-1 line-clamp-1 w-full"
          >
            {{ fan.authorName }}
          </a>
          <p class="text-[11px] text-slate-600 mb-4">
            {{ $t("comment_detail.analyzed_threads", { n: fan.commentCount }) }}
          </p>


          <!-- Stats -->
          <div
            class="mt-auto w-full grid grid-cols-2 gap-2 pt-4 border-t border-white/[0.05]"
          >
            <div>
              <p class="text-xl font-black text-violet-400 leading-none">
                {{ fan.commentCount }}
              </p>
              <p
                class="text-[9px] text-slate-600 uppercase tracking-tighter mt-1 font-bold"
              >
                {{ $t("nav.comments") }}
              </p>
            </div>
            <div>
              <p class="text-xl font-black text-slate-400 leading-none">
                {{ fan.totalLikes }}
              </p>
              <p
                class="text-[9px] text-slate-600 uppercase tracking-tighter mt-1 font-bold"
              >
                Likes
              </p>
            </div>
          </div>

        </div>
      </div>
      <div
        v-else
        class="py-12 text-center bg-white/[0.02] border border-dashed border-white/[0.07] rounded-3xl"
      >
        <UIcon name="i-heroicons-user" class="w-8 h-8 text-slate-700 mb-2" />
        <p class="text-slate-600 text-sm">{{ $t("analytics.no_superfans") }}</p>
      </div>

    </div>

    <!-- Video Performance -->
    <div class="mb-12">
      <div class="flex items-center justify-between mb-6">
        <div>
          <div
            class="flex items-center gap-2 text-xs font-bold text-indigo-400 uppercase tracking-[0.3em] mb-1"
          >
            <UIcon name="i-heroicons-chart-pie" class="w-3.5 h-3.5" />
            {{ $t("analytics.recent_activity") }}
          </div>
          <h2 class="text-2xl font-black text-white tracking-tight">
            {{ $t("analytics.video_performance") }}
          </h2>
        </div>
        <NuxtLink
          to="/comments"
          class="text-xs font-bold text-slate-500 hover:text-white uppercase tracking-widest transition-colors"
        >
          {{ $t("analytics.view_all") }} →
        </NuxtLink>
      </div>


      <div
        v-if="lastVideos.length"
        class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
      >
        <div
          v-for="v in lastVideos"
          :key="v.videoId"
          class="group relative flex flex-col bg-white/[0.03] border border-white/[0.07] rounded-2xl overflow-hidden hover:bg-white/[0.05] hover:border-indigo-500/30 transition-all duration-300"
        >
          <!-- Thumbnail Container (Links to YouTube) -->
          <a 
            :href="`https://youtube.com/watch?v=${v.videoId}`" 
            target="_blank"
            class="relative aspect-video overflow-hidden block"
          >
            <img
              v-if="v.thumbnailUrl"
              :src="v.thumbnailUrl"
              class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
            <div
              class="absolute inset-0 bg-slate-900 flex items-center justify-center"
              v-else
            >
              <UIcon name="i-heroicons-film" class="w-8 h-8 text-slate-700" />
            </div>

            <!-- YouTube Play Overlay (Shows on hover) -->
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <div class="w-12 h-12 rounded-full bg-red-600 flex items-center justify-center text-white shadow-xl scale-90 group-hover:scale-100 transition-transform">
                <UIcon name="i-heroicons-play-solid" class="w-6 h-6" />
              </div>
            </div>


            <!-- Overlay Stats (Views/Likes) -->
            <div
              class="absolute bottom-2 left-2 right-2 flex items-center justify-between"
            >
              <div class="flex gap-1.5 sm:gap-2">
                <div class="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-black/80 text-[11px] sm:text-[13px] font-black text-white backdrop-blur-md border border-white/10 flex items-center gap-1.5 sm:gap-2 shadow-xl">
                  <UIcon name="i-heroicons-eye" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400" />
                  {{ v.viewCount?.toLocaleString() || 0 }}
                </div>
                <div v-if="v.likeCount" class="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-black/80 text-[11px] sm:text-[13px] font-black text-white backdrop-blur-md border border-white/10 flex items-center gap-1.5 sm:gap-2 shadow-xl">
                  <UIcon name="i-heroicons-hand-thumb-up" class="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400" />
                  {{ v.likeCount?.toLocaleString() }}
                </div>
              </div>
              <div
                class="px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-lg bg-indigo-600 text-[11px] sm:text-[13px] font-black text-white backdrop-blur-md border border-white/20 shadow-[0_4px_12px_rgba(79,70,229,0.4)]"
                title="Total Comments"
              >
                {{ v.totalComments }}
              </div>
            </div>

          </a>

          <!-- Content -->
          <div class="p-3 flex flex-col flex-1">
            <p
              class="text-xs font-black text-slate-200 line-clamp-2 group-hover:text-indigo-300 transition-colors mb-3 leading-snug h-9"
            >
              {{ v.videoTitle }}
            </p>

            <div class="mt-auto flex flex-col gap-3">
              <div class="flex flex-wrap gap-1.5">
                <NuxtLink
                  v-if="v.pendingCount > 0"
                  :to="`/comments?videoId=${v.videoId}&status=pending`"
                  class="px-2 py-1 rounded-md bg-amber-400/10 text-[10px] font-black text-amber-400 border border-amber-400/20 hover:bg-amber-400/20 transition-colors"
                >
                  {{ v.pendingCount }} {{ $t("analytics.pending_label") }}
                </NuxtLink>
                <NuxtLink
                  v-if="v.negativeCount > 0"
                  :to="`/comments?videoId=${v.videoId}&intent=complaint`"
                  class="px-2 py-1 rounded-md bg-red-400/10 text-[10px] font-black text-red-400 border border-red-400/20 hover:bg-red-400/20 transition-colors"
                >
                  {{ v.negativeCount }} {{ $t("analytics.complaints_label") }}
                </NuxtLink>
                <NuxtLink
                  v-if="v.questionCount > 0"
                  :to="`/comments?videoId=${v.videoId}&intent=question`"
                  class="px-2 py-1 rounded-md bg-blue-400/10 text-[10px] font-black text-blue-400 border border-blue-400/20 hover:bg-blue-400/20 transition-colors"
                >
                  {{ v.questionCount }} {{ $t("analytics.questions_label") }}
                </NuxtLink>
              </div>



              <!-- Internal Review Button -->
              <NuxtLink
                :to="`/comments?videoId=${v.videoId}`"
                class="w-full py-2.5 rounded-xl bg-white/5 border border-white/10 text-[11px] font-black text-indigo-400 uppercase tracking-widest text-center hover:bg-indigo-500/10 hover:border-indigo-500/30 transition-all"
              >
                {{ $t("analytics.manage_comments") }}
              </NuxtLink>

            </div>
          </div>
        </div>
      </div>


      <div
        v-else
        class="py-12 text-center bg-white/[0.02] border border-dashed border-white/[0.07] rounded-3xl"
      >
        <UIcon
          name="i-heroicons-face-frown"
          class="w-8 h-8 text-slate-700 mb-2"
        />
        <p class="text-slate-600 text-sm">{{ $t("analytics.no_videos") }}</p>
      </div>

    </div>
  </div>
</template>
