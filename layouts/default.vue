<script setup lang="ts">
const { logout } = useAuth();
const route = useRoute();
const { t } = useI18n();

const { isRunning, justCompleted, lastSync } = useSyncStatus();

const { data: brand } = await useFetch<{
  logoUrl: string;
  name: string | null;
}>("/api/public/brand");

const navItems = [
  { key: "dashboard", icon: "i-heroicons-squares-2x2", to: "/dashboard" },
  {
    key: "comments",
    icon: "i-heroicons-chat-bubble-left-right",
    to: "/comments",
  },
  {
    key: "agent",
    icon: "i-heroicons-cpu-chip",
    to: "/agent",
  },
  {
    key: "knowledge_base",
    icon: "i-heroicons-book-open",
    to: "/knowledge-base",
  },
  { key: "settings", icon: "i-heroicons-cog-6-tooth", to: "/settings" },
];

const sidebarOpen = ref(false);

watch(
  () => route.path,
  () => {
    sidebarOpen.value = false;
  },
);
</script>

<template>
  <div
    class="min-h-screen bg-[#030712] text-slate-100 relative"
    style="font-family: &quot;Inter&quot;, system-ui, sans-serif"
  >
    <!-- Background Glow Effects -->
    <div class="bg-glow-wrapper">
      <div class="bg-bokeh-orange"></div>
      <div class="bg-bokeh-blue"></div>
    </div>

    <!-- Mobile overlay -->
    <Transition
      enter-active-class="transition-opacity duration-300"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-200"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="sidebarOpen"
        class="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
        @click="sidebarOpen = false"
      />
    </Transition>

    <!-- Mobile top bar -->
    <div
      class="lg:hidden fixed top-0 left-0 right-0 z-50 h-14 bg-[#030712]/90 backdrop-blur-md border-b border-white/[0.06] flex items-center justify-between px-4"
    >
      <button
        class="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] transition-all duration-150 cursor-pointer"
        :aria-label="t('nav.open_menu')"
        @click="sidebarOpen = !sidebarOpen"
      >
        <UIcon
          :name="sidebarOpen ? 'i-heroicons-x-mark' : 'i-heroicons-bars-3'"
          class="w-5 h-5 transition-all duration-200"
        />
      </button>
      <div class="flex items-center gap-2.5">
        <div
          class="w-7 h-7 rounded-lg overflow-hidden bg-white/5 flex-shrink-0 ring-1 ring-white/10"
        >
          <img
            v-if="brand?.logoUrl"
            :src="brand.logoUrl"
            alt="Channel Logo"
            class="w-full h-full object-cover"
            loading="eager"
            referrerpolicy="no-referrer"
          />
          <img
            v-else
            src="/images/icons/web-app-manifest-192x192.webp"
            alt="App Logo"
            class="w-full h-full object-cover"
            loading="eager"
          />
        </div>
        <p class="font-semibold text-white text-sm tracking-tight">
          {{ $t("nav.app_name") }}
        </p>
      </div>
      <div class="w-9" />
    </div>

    <!-- Sidebar -->
    <aside
      class="fixed inset-y-0 left-0 w-64 lg:w-60 bg-[#13172072] border-r border-white/[0.06] flex flex-col z-50 backdrop-blur-md transition-transform duration-300 ease-out lg:translate-x-0"
      :class="
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      "
    >
      <div class="px-5 py-5 border-b border-white/[0.06]">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 rounded-xl overflow-hidden bg-white/5 flex-shrink-0 ring-1 ring-white/10"
          >
            <img
              v-if="brand?.logoUrl"
              :src="brand.logoUrl"
              alt="Channel Logo"
              class="w-full h-full object-cover"
              loading="eager"
              referrerpolicy="no-referrer"
            />
            <img
              v-else
              src="/images/icons/web-app-manifest-192x192.webp"
              alt="App Logo"
              class="w-full h-full object-cover"
              loading="eager"
            />
          </div>
          <div class="min-w-0">
            <p class="font-semibold text-white text-sm tracking-tight truncate">
              {{ $t("nav.app_name") }}
            </p>
            <p class="text-[11px] text-slate-500 truncate">
              {{ $t("nav.subtitle") }}
            </p>
          </div>
        </div>
      </div>

      <nav class="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        <NuxtLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 px-3 py-4 rounded-lg text-sm transition-all duration-150 cursor-pointer group"
          :class="
            route.path.startsWith(item.to)
              ? 'bg-indigo-500/[0.12] text-indigo-300 ring-1 ring-indigo-500/20'
              : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
          "
        >
          <UIcon
            :name="item.icon"
            class="w-4 h-4 shrink-0 transition-colors"
            :class="
              route.path.startsWith(item.to)
                ? 'text-indigo-400'
                : 'text-slate-600 group-hover:text-slate-400'
            "
          />
          <span class="font-medium">{{ $t("nav." + item.key) }}</span>
        </NuxtLink>
      </nav>

      <div class="p-3 border-t border-white/[0.06]">
        <button
          class="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-slate-500 hover:bg-white/[0.04] hover:text-slate-200 transition-all duration-150 cursor-pointer"
          @click="logout"
        >
          <UIcon
            name="i-heroicons-arrow-right-on-rectangle"
            class="w-4 h-4 shrink-0"
          />
          <span class="font-medium">{{ $t("nav.sign_out") }}</span>
        </button>
      </div>
    </aside>

    <main class="lg:ml-60 min-h-[100%] md:min-h-screen pt-14 lg:pt-0">
      <div class="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
        <slot />
      </div>
    </main>

    <!-- Sync status pill -->
    <Transition
      enter-active-class="transition duration-300 ease-out"
      enter-from-class="translate-y-4 opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-4 opacity-0"
    >
      <div
        v-if="isRunning || justCompleted"
        class="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex items-center gap-3 px-4 py-2.5 rounded-2xl border text-xs font-bold shadow-2xl backdrop-blur-xl transition-colors duration-500 max-w-[calc(100vw-2rem)] sm:max-w-none"
        :class="
          isRunning
            ? 'bg-slate-900/90 border-blue-500/30 text-blue-300'
            : 'bg-slate-900/90 border-emerald-500/30 text-emerald-300'
        "
      >
        <div class="relative flex items-center justify-center w-4 h-4 shrink-0">
          <UIcon
            v-if="isRunning"
            name="i-heroicons-arrow-path"
            class="w-4 h-4 animate-spin"
          />
          <UIcon v-else name="i-heroicons-check-circle" class="w-4 h-4" />
        </div>
        <div class="flex items-center gap-2 min-w-0">
          <span v-if="isRunning" class="truncate">
            {{
              lastSync?.syncType === "manual"
                ? t("sync_pill.syncing_manual")
                : t("sync_pill.syncing")
            }}
          </span>
          <span v-else class="truncate">{{ t("sync_pill.done") }}</span>
          <template v-if="lastSync">
            <span class="text-slate-600 shrink-0">·</span>
            <span
              :class="isRunning ? 'text-slate-400' : 'text-slate-400'"
              class="shrink-0"
            >
              <template v-if="lastSync.videosProcessed === 1">
                {{ t("sync_pill.channel") }}
              </template>
              <template v-else>
                {{ lastSync.videosProcessed ?? 0 }} {{ t("sync_pill.videos") }}
              </template>
            </span>
            <template v-if="(lastSync.newComments ?? 0) > 0">
              <span class="text-slate-600 shrink-0">·</span>
              <span
                :class="isRunning ? 'text-blue-400' : 'text-emerald-400'"
                class="shrink-0"
              >
                +{{ lastSync.newComments }} {{ t("sync_pill.new") }}
              </span>
            </template>
          </template>
        </div>
      </div>
    </Transition>
  </div>
</template>
