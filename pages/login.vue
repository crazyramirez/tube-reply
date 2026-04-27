<script setup lang="ts">
definePageMeta({ layout: false });

const password = ref("");
const showPassword = ref(false);
const error = ref("");
const loading = ref(false);

const { login } = useAuth();
const { t, locale, locales, setLocale } = useI18n();

const { data: brand } = await useFetch<{
  logoUrl: string;
  name: string | null;
}>("/api/public/brand");

const availableLocales = computed(() => locales.value);
const currentLocale = computed(() =>
  availableLocales.value.find(
    (l) => (typeof l === "string" ? l : l.code) === locale.value,
  ),
);

async function handleLogin() {
  if (!password.value.trim()) return;
  loading.value = true;
  error.value = "";
  try {
    await login(password.value);
  } catch (err: unknown) {
    const e = err as {
      data?: { statusMessage?: string };
      statusMessage?: string;
    };
    error.value = e.data?.statusMessage ?? e.statusMessage ?? t("login.error");
  } finally {
    loading.value = false;
  }
}

function togglePassword() {
  showPassword.value = !showPassword.value;
}

const onLocaleChange = (loc: any) => {
  setLocale(loc.code);
};
</script>

<template>
  <div
    class="min-h-screen bg-[#020617] flex items-center justify-center px-4 relative overflow-hidden selection:bg-indigo-500/30"
    style="font-family: &quot;Inter&quot;, sans-serif"
  >
    <!-- Dynamic Background -->
    <div class="absolute inset-0 z-0">
      <img
        src="/images/backgrounds/bg2.webp"
        class="w-full h-full object-cover opacity-40 scale-105 animate-pulse-slow"
        alt="Background"
      />
      <div
        class="absolute inset-0 bg-gradient-to-b from-[#020617]/80 via-transparent to-[#020617]"
      />

      <!-- Bokeh Effects from main.css -->
      <div class="bg-glow-wrapper opacity-50">
        <div class="bg-bokeh-orange" />
        <div class="bg-bokeh-blue" />
      </div>
    </div>

    <!-- Floating UI Elements -->
    <div class="absolute top-8 right-8 z-20 animate-fade-in stagger-1">
      <USelectMenu
        v-model="locale"
        :options="availableLocales"
        value-attribute="code"
        option-attribute="name"
        @update:model-value="setLocale"
        class="w-32"
        :ui="{
          trigger:
            'bg-white/5 border-white/10 text-white hover:bg-white/10 transition-colors rounded-xl backdrop-blur-md',
          content:
            'bg-[#0f172a] border-white/10 text-white rounded-xl backdrop-blur-xl',
          option: {
            active: 'bg-indigo-600/20 text-indigo-400',
            selected: 'bg-indigo-600 text-white',
          },
        }"
      >
        <template #leading>
          <UIcon name="i-heroicons-language" class="w-4 h-4 text-slate-400" />
        </template>
      </USelectMenu>
    </div>

    <div class="w-full max-w-[420px] relative z-10 animate-slide-up">
      <!-- Logo Section -->
      <div class="text-center mb-10 group">
        <div class="relative inline-block">
          <!-- Multi-layered glow effect -->
          <div
            class="absolute inset-0 bg-indigo-500/30 blur-3xl rounded-full scale-150 group-hover:scale-175 transition-all duration-1000 animate-pulse"
          />
          <div
            class="absolute inset-0 bg-violet-500/20 blur-2xl rounded-full scale-125 group-hover:scale-150 transition-all duration-700"
          />

          <div
            class="relative w-32 h-32 mx-auto mb-6 rounded-full overflow-hidden ring-2 ring-white/20 bg-gradient-to-br from-white/15 to-white/5 backdrop-blur-md shadow-[0_0_50px_rgba(79,70,229,0.3)] transition-all duration-500 group-hover:scale-105"
          >
            <img
              src="/images/icons/web-app-manifest-192x192.webp"
              alt="Tube Reply Logo"
              class="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
            />
          </div>
        </div>

        <h1
          class="text-4xl font-extrabold text-white tracking-tight mb-2 drop-shadow-[0_2px_10px_rgba(0,0,0,0.5)]"
          style="font-family: &quot;Outfit&quot;, sans-serif"
        >
          {{ brand?.name || "Tube Reply" }}
        </h1>
        <div
          class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 backdrop-blur-sm"
        >
          <div class="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
          <p
            class="text-indigo-200/60 text-[10px] font-bold tracking-[0.2em] uppercase"
          >
            {{ $t("login.subtitle") }}
          </p>
        </div>
      </div>

      <!-- Login Card -->
      <div
        class="glass-card p-8 relative overflow-hidden group/card border-white/10"
      >
        <!-- Inner highlight -->
        <div
          class="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none"
        />

        <form @submit.prevent="handleLogin" class="space-y-6 relative z-10">
          <div class="space-y-2">
            <label class="block text-sm font-semibold text-slate-300 ml-1">
              {{ $t("login.password") }}
            </label>
            <div class="relative">
              <div
                class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none"
              >
                <UIcon
                  name="i-heroicons-lock-closed"
                  class="w-5 h-5 text-slate-500"
                />
              </div>
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                :placeholder="$t('login.placeholder')"
                :disabled="loading"
                autofocus
                class="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-12 py-4 text-base text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all duration-300 disabled:opacity-50 hover:bg-white/[0.08]"
              />
              <button
                type="button"
                @click="togglePassword"
                class="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-500 hover:text-white transition-colors"
              >
                <UIcon
                  :name="
                    showPassword ? 'i-heroicons-eye-slash' : 'i-heroicons-eye'
                  "
                  class="w-5 h-5"
                />
              </button>
            </div>
          </div>

          <!-- Error Message -->
          <Transition
            enter-active-class="transition duration-300 ease-out"
            enter-from-class="transform -translate-y-2 opacity-0"
            enter-to-class="transform translate-y-0 opacity-100"
            leave-active-class="transition duration-200 ease-in"
            leave-from-class="transform translate-y-0 opacity-100"
            leave-to-class="transform -translate-y-2 opacity-0"
          >
            <div
              v-if="error"
              class="flex items-center gap-3 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-4"
            >
              <UIcon
                name="i-heroicons-exclamation-circle"
                class="w-5 h-5 flex-shrink-0"
              />
              <span class="font-medium">{{ error }}</span>
            </div>
          </Transition>

          <!-- Submit Button -->
          <button
            type="submit"
            :disabled="!password.trim() || loading"
            class="premium-btn-primary w-full py-4 px-6 flex items-center justify-center gap-3 relative overflow-hidden group/btn shadow-[0_0_20px_rgba(79,70,229,0.4)]"
          >
            <!-- Shimmer effect -->
            <div
              class="absolute inset-0 -translate-x-full group-hover/btn:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent"
            />

            <UIcon
              v-if="loading"
              name="i-heroicons-arrow-path"
              class="w-5 h-5 animate-spin"
            />
            <span v-else class="text-base font-bold tracking-tight">
              {{ $t("login.submit") }}
            </span>
            <UIcon
              v-if="!loading"
              name="i-heroicons-arrow-right"
              class="w-5 h-5 group-hover/btn:translate-x-1 transition-transform"
            />
          </button>
        </form>
      </div>

      <!-- Footer Info -->
      <div class="mt-8 text-center animate-fade-in stagger-3">
        <p
          class="text-slate-500 text-sm flex items-center justify-center gap-2"
        >
          <UIcon
            name="i-heroicons-shield-check"
            class="w-4 h-4 text-indigo-400"
          />
          {{
            $t("login.secure_access") ||
            "Secure access powered by Tube Reply AI"
          }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url("https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap");

.animate-pulse-slow {
  animation: pulse-slow 8s ease-in-out infinite;
}

@keyframes pulse-slow {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.1);
  }
}

@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}

:deep(.u-select-menu-trigger) {
  @apply !shadow-none;
}
</style>
