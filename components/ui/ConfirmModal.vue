<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: boolean;
    title: string;
    description: string;
    confirmText: string;
    cancelText: string;
    loading?: boolean;
    type?: "danger" | "warning" | "info" | "success";
  }>(),
  {
    modelValue: false,
    loading: false,
    type: "warning",
  },
);

const emit = defineEmits(["update:modelValue", "confirm", "cancel"]);

function close() {
  emit("update:modelValue", false);
}

function confirm() {
  emit("confirm");
}
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
        background: 'bg-black/60 backdrop-blur-md',
      },
    }"
  >
    <div
      class="relative overflow-hidden bg-slate-900/90 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl"
    >
      <!-- Gradient background effect -->
      <div
        class="absolute -top-24 -right-24 w-48 h-48 bg-red-600/10 blur-[80px] rounded-full pointer-events-none"
        v-if="type === 'danger'"
      />
      <div
        class="absolute -top-24 -right-24 w-48 h-48 bg-emerald-600/10 blur-[80px] rounded-full pointer-events-none"
        v-if="type === 'success'"
      />
      <div
        class="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-600/5 blur-[80px] rounded-full pointer-events-none"
      />

      <div class="p-8 relative z-10">
        <!-- Icon & Content -->
        <div class="flex flex-col items-center text-center space-y-4">
          <div
            class="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg transform rotate-3"
            :class="[
              type === 'danger'
                ? 'bg-red-500/10 text-red-500 border border-red-500/20'
                : type === 'success'
                  ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-500 border border-amber-500/20',
            ]"
          >
            <UIcon
              :name="
                type === 'danger'
                  ? 'i-heroicons-exclamation-triangle'
                  : type === 'success'
                    ? 'i-heroicons-check-circle'
                    : 'i-heroicons-question-mark-circle'
              "
              class="w-8 h-8"
            />
          </div>

          <div class="space-y-2">
            <h3 class="text-2xl font-bold text-white tracking-tight">
              {{ title }}
            </h3>
            <p
              class="text-slate-400 text-sm leading-relaxed max-w-[280px] mx-auto"
            >
              {{ description }}
            </p>
          </div>
        </div>

        <!-- Actions -->
        <div class="grid grid-cols-2 gap-4 mt-10">
          <button
            class="px-5 py-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 font-bold transition-all duration-200 active:scale-95"
            @click="close"
          >
            {{ cancelText }}
          </button>
          <button
            class="px-5 py-3 rounded-xl font-bold transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 shadow-xl"
            :class="[
              type === 'danger'
                ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-900/20'
                : type === 'success'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/20'
                  : 'bg-white text-slate-900 hover:bg-slate-100',
            ]"
            :disabled="loading"
            @click="confirm"
          >
            <UIcon
              v-if="loading"
              name="i-heroicons-arrow-path"
              class="w-4 h-4 animate-spin"
            />
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </UModal>
</template>
