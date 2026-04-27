<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    modelValue: boolean;
    loading?: boolean;
  }>(),
  {
    modelValue: false,
    loading: false,
  },
);

const emit = defineEmits(["update:modelValue", "confirm"]);

const { t } = useI18n();
const confirmationInput = ref("");
const requiredText = "OK";

const canConfirm = computed(
  () =>
    confirmationInput.value.trim().toUpperCase() === requiredText &&
    !props.loading,
);

function close() {
  confirmationInput.value = "";
  emit("update:modelValue", false);
}

function handleConfirm() {
  if (canConfirm.value) {
    emit("confirm");
  }
}

// Reset input when modal opens
watch(
  () => props.modelValue,
  (val) => {
    if (val) confirmationInput.value = "";
  },
);
</script>

<template>
  <UModal
    :model-value="modelValue"
    @update:model-value="emit('update:modelValue', $event)"
    :ui="{
      container: 'flex items-center justify-center p-4',
      width: 'max-w-md w-full',
      base: 'overflow-hidden',
      overlay: {
        background: 'bg-black/80 backdrop-blur-xl',
      },
    }"
  >
    <div
      class="relative overflow-hidden bg-slate-900 border border-red-500/30 rounded-3xl shadow-[0_0_50px_rgba(220,38,38,0.15)]"
    >
      <!-- Aggressive background effect -->
      <div
        class="absolute -top-24 -right-24 w-64 h-64 bg-red-600/20 blur-[100px] rounded-full pointer-events-none animate-pulse"
      />
      <div
        class="absolute -bottom-24 -left-24 w-64 h-64 bg-red-900/20 blur-[100px] rounded-full pointer-events-none"
      />

      <!-- Danger Pattern -->
      <div
        class="absolute inset-0 opacity-[0.03] pointer-events-none"
        style="
          background-image: radial-gradient(#ef4444 1px, transparent 1px);
          background-size: 20px 20px;
        "
      />

      <div class="p-8 relative z-10">
        <!-- Icon & Content -->
        <div class="flex flex-col items-center text-center space-y-5">
          <div
            class="w-20 h-20 rounded-3xl bg-red-500/10 text-red-500 border border-red-500/30 flex items-center justify-center shadow-2xl shadow-red-900/20 transform -rotate-3 transition-transform hover:rotate-0 duration-500"
          >
            <UIcon name="i-heroicons-bolt" class="w-10 h-10" />
          </div>

          <div class="space-y-3">
            <h3
              class="text-2xl font-black text-white tracking-tight uppercase italic"
            >
              {{ t("settings.reset_confirm_title") }}
            </h3>
            <p
              class="text-slate-400 text-sm leading-relaxed max-w-[320px] mx-auto"
            >
              {{ t("settings.reset_confirm_description") }}
            </p>
          </div>
        </div>

        <!-- Confirmation Input -->
        <div class="mt-8 space-y-4">
          <div class="space-y-2">
            <label
              class="text-[10px] font-bold text-red-400/80 uppercase tracking-[0.2em] ml-1"
            >
              {{
                t("settings.reset_confirm_instruction", { ok: requiredText })
              }}
            </label>
            <div class="relative group">
              <input
                v-model="confirmationInput"
                type="text"
                :placeholder="requiredText"
                class="w-full bg-black/40 border-2 border-white/5 rounded-2xl px-5 py-4 text-white font-black text-center tracking-[0.5em] focus:border-red-500/50 focus:ring-0 outline-none transition-all duration-300 placeholder:text-white/5 uppercase"
                @keyup.enter="handleConfirm"
              />
              <div
                class="absolute inset-0 rounded-2xl border border-white/5 pointer-events-none group-hover:border-white/10 transition-colors"
              />
            </div>
          </div>

          <!-- Actions -->
          <div class="grid grid-cols-2 gap-4 pt-2">
            <button
              class="px-5 py-4 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 text-slate-400 font-bold transition-all duration-200 active:scale-95 cursor-pointer"
              @click="close"
            >
              {{ t("settings.cancel") || "Cancel" }}
            </button>
            <button
              class="px-5 py-4 rounded-2xl font-black transition-all duration-300 active:scale-95 flex items-center justify-center gap-2 shadow-xl relative overflow-hidden group disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed"
              :class="[
                canConfirm
                  ? 'bg-red-600 text-white shadow-red-900/40 cursor-pointer'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed',
              ]"
              :disabled="!canConfirm || loading"
              @click="handleConfirm"
            >
              <!-- Animated background on hover -->
              <div
                v-if="canConfirm"
                class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"
              />

              <UIcon
                v-if="loading"
                name="i-heroicons-arrow-path"
                class="w-5 h-5 animate-spin"
              />
              <span class="relative z-10">{{ t("settings.reset_app") }}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </UModal>
</template>

<style scoped>
@keyframes shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
