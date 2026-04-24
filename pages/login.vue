<script setup lang="ts">
definePageMeta({ layout: false });

const password = ref("");
const error = ref("");
const loading = ref(false);

const { login } = useAuth();

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
    error.value = e.data?.statusMessage ?? e.statusMessage ?? "Login failed";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div
    class="min-h-screen bg-[#030712] flex items-center justify-center px-4 relative overflow-hidden"
    style="font-family: &quot;Inter&quot;, system-ui, sans-serif"
  >
    <div class="absolute inset-0 pointer-events-none">
      <div
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[700px] bg-indigo-600/[0.06] rounded-full blur-3xl"
      />
      <div
        class="absolute top-1/3 left-1/3 w-[300px] h-[300px] bg-violet-600/[0.04] rounded-full blur-2xl"
      />
    </div>

    <div class="w-full max-w-sm relative z-10">
      <div class="text-center mb-8">
        <div
          class="w-24 h-24 mx-auto mb-5 rounded-2xl overflow-hidden ring-1 ring-white/10 bg-white/5 shadow-2xl"
        >
          <img
            src="/images/logo_mona.jpg"
            alt="Mona Monísima"
            class="w-full h-full object-cover"
          />
        </div>
        <h1 class="text-2xl font-bold text-white tracking-tight">Tube Reply</h1>
        <p class="text-slate-500 text-sm mt-1.5">YouTube Comment Assistant</p>
      </div>

      <div
        class="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-6 backdrop-blur-sm shadow-2xl"
      >
        <form @submit.prevent="handleLogin" class="space-y-4">
          <div>
            <label class="block text-xs font-medium text-slate-400 mb-2"
              >Password</label
            >
            <input
              v-model="password"
              type="password"
              placeholder="Enter admin password"
              :disabled="loading"
              autofocus
              class="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500/40 transition-all duration-150 disabled:opacity-50"
            />
          </div>

          <div
            v-if="error"
            class="flex items-start gap-2.5 text-red-300 text-sm bg-red-500/[0.08] border border-red-500/20 rounded-xl px-4 py-3"
          >
            <UIcon
              name="i-heroicons-exclamation-triangle"
              class="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400"
            />
            <span>{{ error }}</span>
          </div>

          <button
            type="submit"
            :disabled="!password.trim() || loading"
            class="w-full bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-xl text-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-indigo-900/40"
          >
            <UIcon
              v-if="loading"
              name="i-heroicons-arrow-path"
              class="w-4 h-4 animate-spin"
            />
            {{ loading ? "Signing in…" : "Sign In" }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
