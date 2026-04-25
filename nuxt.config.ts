export default defineNuxtConfig({
  compatibilityDate: '2026-04-25',

  devtools: { enabled: false },
  experimental: {
    scrollRestoration: true,
    appManifest: false
  },

  modules: ['@nuxt/ui', '@vite-pwa/nuxt', '@nuxtjs/i18n'],

  i18n: {
    locales: [
      { code: 'en', name: 'English', file: 'en.json' },
      { code: 'es', name: 'Español', file: 'es.json' },
    ],
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
  },

    pwa: {
      registerType: 'autoUpdate',
      manifest: {
        name: 'TubeReply',
        short_name: 'TubeReply',
        description: 'AI-powered YouTube comment management',
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: '/images/icons/web-app-manifest-192x192.png',
            sizes: '192x192',
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
            purpose: 'any',
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
        navigateFallback: '/',
        globPatterns: ['**/*.{js,css,html,png,svg,ico,json,webp}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      client: {
        installPrompt: true,
        periodicSyncForUpdates: 3600,
      },
      devOptions: {
        enabled: true,
        type: 'classic',
        suppressWarnings: true,
        navigateFallbackAllowlist: [/^\/$/],
      },
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
    '/sw.js': { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
    '/manifest.webmanifest': { headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' } },
    '/**': {
      headers: {
        'X-Robots-Tag': 'noindex, nofollow, noarchive, nosnippet',
      },
    },
  },

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

  runtimeConfig: {
    dbUrl: process.env.DATABASE_URL ?? './data/youtube.db',
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? '',
    youtubeClientId: process.env.YOUTUBE_CLIENT_ID ?? '',
    youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? '',
    youtubeRedirectUri: process.env.YOUTUBE_REDIRECT_URI ?? '',
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
    openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    aiProvider: process.env.AI_PROVIDER ?? 'gemini',
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
    sessionDurationHours: Number(process.env.SESSION_DURATION_HOURS ?? 24),
    syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? 30),
    maxQuotaPerDay: Number(process.env.MAX_QUOTA_PER_DAY ?? 8500),
    autoSyncOnStart: process.env.AUTO_SYNC_ON_START !== 'false',
    rateLimitLoginMax: Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 5),
    rateLimitLoginWindowMinutes: Number(process.env.RATE_LIMIT_LOGIN_WINDOW_MINUTES ?? 15),
    lockoutDurationMinutes: Number(process.env.LOCKOUT_DURATION_MINUTES ?? 30),
    public: {
      appName: 'Tube Reply',
    },
  },

  app: {
    head: {
      title: 'Tube Reply',
      meta: [
        { name: 'robots', content: 'noindex, nofollow, noarchive, nosnippet' },
        { name: 'description', content: 'AI-powered YouTube comment management. Sync, generate suggestions, and reply faster.' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'theme-color', content: '#000000' },
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
