<script setup lang="ts">
const { $pwa } = useNuxtApp()
const toast = useToast()
const { t } = useI18n()

onMounted(() => {
  if ($pwa?.offlineReady) {
    toast.add({
      title: t('pwa.offline_ready'),
      icon: 'i-heroicons-check-circle',
      color: 'green'
    })
  }
  if ($pwa?.needRefresh) {
    toast.add({
      title: t('pwa.new_version'),
      description: t('pwa.reload_description'),
      icon: 'i-heroicons-arrow-path',
      actions: [{
        label: t('pwa.update_button'),
        click: () => $pwa.updateServiceWorker()
      }]
    })
  }
})
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
  <UNotifications />
  <VitePwaManifest />
</template>
