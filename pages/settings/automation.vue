<script setup lang="ts">
import type { AutomationRule, AutomationCondition, AutomationConditionField, AutomationAction } from '~/shared/types'

definePageMeta({ middleware: 'auth' })

const toast = useToast()

// ─── Data ─────────────────────────────────────────────────────────────────────

const { data: rules, refresh } = await useFetch<AutomationRule[]>('/api/automation')

// ─── Field / action meta ──────────────────────────────────────────────────────

const CONDITION_FIELDS: { value: AutomationConditionField; label: string; type: 'text' | 'number' | 'select' | 'boolean'; options?: string[] }[] = [
  { value: 'contains_keyword', label: 'Contains keyword', type: 'text' },
  { value: 'intent_is', label: 'Intent is', type: 'select', options: ['question', 'complaint', 'compliment', 'help_needed', 'video_request', 'spam', 'neutral'] },
  { value: 'score_above', label: 'Score above', type: 'number' },
  { value: 'score_below', label: 'Score below', type: 'number' },
  { value: 'language_is', label: 'Language is', type: 'text' },
  { value: 'is_return_commenter', label: 'Is return commenter', type: 'boolean' },
  { value: 'has_opportunity_flag', label: 'Has opportunity flag', type: 'text' },
]

const ACTION_OPTIONS: { value: AutomationAction; label: string; hasParams: boolean; paramKey?: string; paramType?: 'text' | 'select'; paramOptions?: string[] }[] = [
  { value: 'auto_dismiss', label: 'Auto-dismiss comment', hasParams: false },
  { value: 'set_priority', label: 'Set priority', hasParams: true, paramKey: 'label', paramType: 'select', paramOptions: ['urgent', 'high', 'normal', 'low'] },
  { value: 'add_flag', label: 'Add opportunity flag', hasParams: true, paramKey: 'flag', paramType: 'text' },
  { value: 'auto_suggest', label: 'Auto-generate AI reply', hasParams: false },
  { value: 'notify', label: 'Mark as urgent (notify)', hasParams: false },
]

// ─── Builder state ────────────────────────────────────────────────────────────

const showBuilder = ref(false)
const saving = ref(false)
const deletingId = ref<number | null>(null)
const togglingId = ref<number | null>(null)

const draft = ref({
  name: '',
  conditions: [{ field: 'contains_keyword' as AutomationConditionField, value: '' }] as AutomationCondition[],
  action: 'set_priority' as AutomationAction,
  actionParam: 'high',
})

function resetDraft() {
  draft.value = {
    name: '',
    conditions: [{ field: 'contains_keyword', value: '' }],
    action: 'set_priority',
    actionParam: 'high',
  }
}

function openBuilder() {
  resetDraft()
  showBuilder.value = true
}

function addCondition() {
  draft.value.conditions.push({ field: 'contains_keyword', value: '' })
}

function removeCondition(i: number) {
  draft.value.conditions.splice(i, 1)
}

function conditionMeta(field: AutomationConditionField) {
  return CONDITION_FIELDS.find(f => f.value === field)!
}

function actionMeta(action: AutomationAction) {
  return ACTION_OPTIONS.find(a => a.value === action)!
}

// ─── Save ─────────────────────────────────────────────────────────────────────

async function saveRule() {
  if (!draft.value.name.trim()) {
    toast.add({ title: 'Rule name is required', color: 'red' })
    return
  }
  if (draft.value.conditions.some(c => c.value === '' && conditionMeta(c.field).type !== 'boolean')) {
    toast.add({ title: 'All conditions need a value', color: 'red' })
    return
  }

  const meta = actionMeta(draft.value.action)
  const actionParams = meta.hasParams && meta.paramKey
    ? { [meta.paramKey]: draft.value.actionParam }
    : null

  saving.value = true
  try {
    await $fetch('/api/automation', {
      method: 'POST',
      headers: useCsrfHeaders(),
      body: {
        name: draft.value.name,
        conditions: draft.value.conditions,
        action: draft.value.action,
        actionParams,
      },
    })
    await refresh()
    showBuilder.value = false
    toast.add({ title: 'Rule created', color: 'green' })
  } catch {
    toast.add({ title: 'Failed to save rule', color: 'red' })
  } finally {
    saving.value = false
  }
}

// ─── Toggle active ────────────────────────────────────────────────────────────

async function toggleRule(rule: AutomationRule) {
  togglingId.value = rule.id
  try {
    await $fetch(`/api/automation/${rule.id}`, {
      method: 'PATCH',
      headers: useCsrfHeaders(),
      body: { isActive: !rule.isActive },
    })
    await refresh()
  } catch {
    toast.add({ title: 'Failed to update rule', color: 'red' })
  } finally {
    togglingId.value = null
  }
}

// ─── Delete ───────────────────────────────────────────────────────────────────

async function deleteRule(id: number) {
  deletingId.value = id
  try {
    await $fetch(`/api/automation/${id}`, {
      method: 'DELETE',
      headers: useCsrfHeaders(),
    })
    await refresh()
    toast.add({ title: 'Rule deleted', color: 'green' })
  } catch {
    toast.add({ title: 'Failed to delete rule', color: 'red' })
  } finally {
    deletingId.value = null
  }
}

// ─── Display helpers ──────────────────────────────────────────────────────────

function parseConditions(rule: AutomationRule): AutomationCondition[] {
  if (Array.isArray(rule.conditions)) return rule.conditions
  try { return JSON.parse(rule.conditions as unknown as string) } catch { return [] }
}

function conditionSummary(cond: AutomationCondition): string {
  const meta = CONDITION_FIELDS.find(f => f.value === cond.field)
  return `${meta?.label ?? cond.field} = ${cond.value}`
}

function actionSummary(rule: AutomationRule): string {
  const meta = ACTION_OPTIONS.find(a => a.value === rule.action)
  if (!meta) return rule.action
  if (meta.hasParams && rule.actionParams && meta.paramKey) {
    return `${meta.label}: ${rule.actionParams[meta.paramKey]}`
  }
  return meta.label
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex items-start sm:items-end justify-between mb-8 gap-4">
      <div>
        <div class="flex items-center gap-2 text-[10px] font-bold text-violet-400 uppercase tracking-[0.3em] mb-1">
          <UIcon name="i-heroicons-bolt" class="w-3.5 h-3.5" />
          Automation
        </div>
        <h1 class="text-2xl sm:text-3xl font-black text-white tracking-tighter">Automation Rules</h1>
        <p class="text-slate-500 text-sm mt-1">If/then rules that run automatically on every sync.</p>
      </div>
      <UButton
        icon="i-heroicons-plus"
        color="violet"
        variant="soft"
        size="sm"
        class="rounded-xl font-bold shrink-0"
        @click="openBuilder"
      >
        New Rule
      </UButton>
    </div>

    <!-- Rule builder modal -->
    <UModal v-model="showBuilder" :ui="{ container: 'items-center', width: 'max-w-lg' }">
      <div class="bg-slate-900 border border-white/[0.08] rounded-2xl p-6 space-y-5">
        <h2 class="text-lg font-black text-white">New Automation Rule</h2>

        <!-- Name -->
        <div>
          <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5 block">Rule name</label>
          <UInput v-model="draft.name" placeholder="e.g. Auto-dismiss spam" class="w-full" />
        </div>

        <!-- Conditions -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest">Conditions (ALL must match)</label>
            <UButton size="xs" variant="ghost" color="slate" icon="i-heroicons-plus" class="rounded-lg" @click="addCondition">
              Add
            </UButton>
          </div>

          <div
            v-for="(cond, i) in draft.conditions"
            :key="i"
            class="flex items-center gap-2 bg-white/[0.03] border border-white/[0.06] rounded-xl p-3"
          >
            <!-- Field selector -->
            <USelect
              v-model="cond.field"
              :options="CONDITION_FIELDS.map(f => ({ value: f.value, label: f.label }))"
              size="sm"
              class="flex-1"
            />

            <!-- Value input -->
            <template v-if="conditionMeta(cond.field).type === 'boolean'">
              <USelect
                v-model="cond.value"
                :options="[{ value: true, label: 'Yes' }, { value: false, label: 'No' }]"
                size="sm"
                class="w-24"
              />
            </template>
            <template v-else-if="conditionMeta(cond.field).type === 'select'">
              <USelect
                v-model="cond.value"
                :options="conditionMeta(cond.field).options ?? []"
                size="sm"
                class="w-36"
              />
            </template>
            <template v-else-if="conditionMeta(cond.field).type === 'number'">
              <UInput v-model.number="cond.value" type="number" size="sm" class="w-24" placeholder="0-100" />
            </template>
            <template v-else>
              <UInput v-model="cond.value" size="sm" class="w-36" placeholder="value" />
            </template>

            <UButton
              v-if="draft.conditions.length > 1"
              size="xs"
              color="red"
              variant="ghost"
              icon="i-heroicons-x-mark"
              class="rounded-lg shrink-0"
              @click="removeCondition(i)"
            />
          </div>
        </div>

        <!-- Action -->
        <div class="space-y-2">
          <label class="text-[10px] font-black text-slate-500 uppercase tracking-widest block">Action</label>
          <USelect
            v-model="draft.action"
            :options="ACTION_OPTIONS.map(a => ({ value: a.value, label: a.label }))"
            class="w-full"
          />

          <!-- Action param -->
          <template v-if="actionMeta(draft.action).hasParams">
            <USelect
              v-if="actionMeta(draft.action).paramType === 'select'"
              v-model="draft.actionParam"
              :options="actionMeta(draft.action).paramOptions ?? []"
              size="sm"
            />
            <UInput
              v-else
              v-model="draft.actionParam"
              size="sm"
              :placeholder="actionMeta(draft.action).paramKey ?? 'value'"
            />
          </template>
        </div>

        <!-- Footer -->
        <div class="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
          <UButton variant="ghost" color="slate" size="sm" class="rounded-xl" @click="showBuilder = false">Cancel</UButton>
          <UButton color="violet" size="sm" class="rounded-xl font-bold" :loading="saving" @click="saveRule">
            Create Rule
          </UButton>
        </div>
      </div>
    </UModal>

    <!-- Empty state -->
    <div
      v-if="!rules?.length"
      class="bg-white/[0.02] border border-white/[0.06] border-dashed rounded-3xl py-24 text-center"
    >
      <UIcon name="i-heroicons-bolt" class="w-12 h-12 mx-auto mb-3 text-slate-700" />
      <p class="text-slate-400 font-bold uppercase tracking-widest text-sm mb-2">No rules yet</p>
      <p class="text-slate-600 text-xs mb-6">Create your first rule to automate comment handling.</p>
      <UButton color="violet" variant="soft" size="sm" class="rounded-xl" @click="openBuilder">
        Create First Rule
      </UButton>
    </div>

    <!-- Rules list -->
    <div v-else class="space-y-3">
      <div
        v-for="rule in rules"
        :key="rule.id"
        class="bg-white/[0.03] border border-white/[0.07] rounded-2xl p-4 flex items-start gap-4 transition-all"
        :class="{ 'opacity-50': !rule.isActive }"
      >
        <!-- Toggle -->
        <div class="pt-0.5">
          <UToggle
            :model-value="rule.isActive"
            :loading="togglingId === rule.id"
            color="violet"
            @update:model-value="toggleRule(rule)"
          />
        </div>

        <!-- Content -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-2">
            <span class="text-sm font-black text-white">{{ rule.name }}</span>
            <span class="text-[9px] font-black text-slate-600 uppercase tracking-widest">
              {{ rule.triggerCount }} triggers
            </span>
          </div>

          <!-- Conditions -->
          <div class="flex flex-wrap gap-1.5 mb-2">
            <span
              v-for="(cond, i) in parseConditions(rule)"
              :key="i"
              class="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20"
            >
              {{ conditionSummary(cond) }}
            </span>
          </div>

          <!-- Action -->
          <div class="flex items-center gap-1.5">
            <UIcon name="i-heroicons-arrow-right" class="w-3 h-3 text-slate-600 shrink-0" />
            <span class="text-[11px] font-bold text-violet-400">{{ actionSummary(rule) }}</span>
          </div>
        </div>

        <!-- Delete -->
        <UButton
          icon="i-heroicons-trash"
          color="red"
          variant="ghost"
          size="xs"
          class="rounded-xl shrink-0"
          :loading="deletingId === rule.id"
          @click="deleteRule(rule.id)"
        />
      </div>
    </div>
  </div>
</template>
