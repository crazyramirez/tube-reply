export default defineNuxtConfig({
  compatibilityDate: '2026-04-25',

  devtools: { enabled: false },
  experimental: {
    scrollRestoration: true,
    appManifest: false
  },

  modules: ['@vite-pwa/nuxt', '@nuxt/ui', '@nuxtjs/i18n'],

  nitro: {
    externals: {
      external: ['better-sqlite3'],
    },
    serverAssets: [
      {
        baseName: 'migrations',
        dir: './server/db/migrations',
      },
    ],
  },

  pwa: {
    strategies: 'generateSW',
    registerType: 'autoUpdate',
    manifest: {
      id: '/',
      name: 'Tube Reply',
      short_name: 'TubeReply',
      description: 'AI-powered YouTube comment management. Sync, generate suggestions, and reply faster.',
      theme_color: '#000000',
      background_color: '#000000',
      display: 'standalone',
      orientation: 'portrait',
      scope: '/',
      start_url: '/',
      icons: [
        {
          src: '/images/icons/web-app-manifest-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/images/icons/web-app-manifest-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/images/icons/web-app-manifest-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/images/icons/web-app-manifest-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,png,svg,ico}'],
      navigateFallback: null,
    },
    devOptions: {
      enabled: true,
      suppressWarnings: false,
      type: 'classic',
    },
  },

  i18n: {
    locales: [
      { code: 'en', iso: 'en-US', name: 'English', file: 'en.json' },
      { code: 'es', iso: 'es-ES', name: 'Español', file: 'es.json' },
      { code: 'pt', iso: 'pt-BR', name: 'Português', file: 'en.json' },
      { code: 'fr', iso: 'fr-FR', name: 'Français', file: 'en.json' },
      { code: 'de', iso: 'de-DE', name: 'Deutsch', file: 'en.json' },
      { code: 'it', iso: 'it-IT', name: 'Italiano', file: 'en.json' },
      { code: 'nl', iso: 'nl-NL', name: 'Nederlands', file: 'en.json' },
      { code: 'pl', iso: 'pl-PL', name: 'Polski', file: 'en.json' },
      { code: 'ru', iso: 'ru-RU', name: 'Русский', file: 'en.json' },
      { code: 'ja', iso: 'ja-JP', name: '日本語', file: 'en.json' },
      { code: 'zh', iso: 'zh-CN', name: '中文', file: 'en.json' },
      { code: 'ar', iso: 'ar-SA', name: 'العربية', file: 'en.json' },
      { code: 'ko', iso: 'ko-KR', name: '한국어', file: 'en.json' },
      { code: 'tr', iso: 'tr-TR', name: 'Türkçe', file: 'en.json' },
      { code: 'sv', iso: 'sv-SE', name: 'Svenska', file: 'en.json' },
      { code: 'no', iso: 'no-NO', name: 'Norsk', file: 'en.json' },
      { code: 'da', iso: 'da-DK', name: 'Dansk', file: 'en.json' },
      { code: 'fi', iso: 'fi-FI', name: 'Suomi', file: 'en.json' },
      { code: 'ca', iso: 'ca-ES', name: 'Català', file: 'en.json' },
      { code: 'cs', iso: 'cs-CZ', name: 'Čeština', file: 'en.json' },
    ],
    lazy: true,
    defaultLocale: 'en',
    strategy: 'no_prefix',
    langDir: 'locales/',
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'tube_reply_locale',
      redirectOn: 'root',
      alwaysRedirect: false,
    },
    bundle: {
      optimizeTranslationDirective: false,
    },
    vueI18n: './i18n.config.ts',
  },

  css: ['~/assets/css/main.css'],

  typescript: {
    strict: true,
  },

  routeRules: {
    '/api/**': {
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
      },
    },
    '/**': {
      headers: {
        'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    },
  },

  runtimeConfig: {
    dbUrl: process.env.DATABASE_URL ?? './data/youtube.db',
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? '',
    youtubeClientId: process.env.YOUTUBE_CLIENT_ID ?? '',
    youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? '',
    youtubeRedirectUri: process.env.YOUTUBE_REDIRECT_URI ?? '',
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3-flash-preview',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    aiProvider: process.env.AI_PROVIDER ?? 'openai',
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
    sessionDurationHours: Number(process.env.SESSION_DURATION_HOURS ?? 24),
    syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? 30),
    maxQuotaPerDay: Number(process.env.MAX_QUOTA_PER_DAY ?? 8500),
    autoSyncOnStart: process.env.AUTO_SYNC_ON_START !== 'false',
    rateLimitLoginMax: Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 5),
    rateLimitLoginWindowMinutes: Number(process.env.RATE_LIMIT_LOGIN_WINDOW_MINUTES ?? 15),
    lockoutDurationMinutes: Number(process.env.LOCKOUT_DURATION_MINUTES ?? 30),
    logRetentionDays: Number(process.env.LOG_RETENTION_DAYS ?? 30),
    public: {
      appName: 'Tube Reply',
    },
  },

  app: {
    head: {
      title: 'Tube Reply',
      meta: [
        { name: 'robots', content: 'noindex, nofollow, noarchive, nosnippet' },
        { name: 'googlebot', content: 'noindex, nofollow, noarchive, nosnippet' },
        { name: 'description', content: 'AI-powered YouTube comment management. Sync, generate suggestions, and reply faster.' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#000000' },
        { name: 'mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'apple-mobile-web-app-title', content: 'Tube Reply' },
        { property: 'og:type', content: 'website' },
        { property: 'og:title', content: 'Tube Reply - AI YouTube Comment Management' },
        { property: 'og:description', content: 'AI-powered YouTube comment management. Sync, generate suggestions, and reply faster.' },
        { property: 'og:image', content: '/images/ogimage.jpg' },
        { name: 'twitter:card', content: 'summary_large_image' },
        { name: 'twitter:title', content: 'Tube Reply - AI YouTube Comment Management' },
        { name: 'twitter:description', content: 'AI-powered YouTube comment management. Sync, generate suggestions, and reply faster.' },
        { name: 'twitter:image', content: '/images/ogimage.jpg' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/images/icons/favicon.ico' },
        { rel: 'icon', type: 'image/png', sizes: '96x96', href: '/images/icons/favicon-96x96.png' },
        { rel: 'icon', type: 'image/svg+xml', href: '/images/icons/favicon.svg' },
        { rel: 'apple-touch-icon', href: '/images/icons/apple-touch-icon.png' },
        {
          rel: 'preconnect',
          href: 'https://fonts.googleapis.com',
        },
        {
          rel: 'preconnect',
          href: 'https://fonts.gstatic.com',
          crossorigin: '',
        },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
        },
      ],
    },
  },
})
