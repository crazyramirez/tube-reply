export default defineNuxtConfig({
  devtools: { enabled: false },

  modules: ['@nuxt/ui'],

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
      },
    },
  },

  nitro: {
    externals: {
      external: ['better-sqlite3'],
    },
  },

  runtimeConfig: {
    dbUrl: process.env.DATABASE_URL ?? './data/youtube.db',
    adminPasswordHash: process.env.ADMIN_PASSWORD_HASH ?? '',
    youtubeClientId: process.env.YOUTUBE_CLIENT_ID ?? '',
    youtubeClientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? '',
    youtubeRedirectUri: process.env.YOUTUBE_REDIRECT_URI ?? '',
    geminiApiKey: process.env.GEMINI_API_KEY ?? '',
    geminiModel: process.env.GEMINI_MODEL ?? 'gemini-2.0-flash',
    tokenEncryptionKey: process.env.TOKEN_ENCRYPTION_KEY ?? '',
    sessionSecret: process.env.NUXT_SECRET ?? '',
    sessionDurationHours: Number(process.env.SESSION_DURATION_HOURS ?? 24),
    syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES ?? 30),
    maxQuotaPerDay: Number(process.env.MAX_QUOTA_PER_DAY ?? 8500),
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
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      ],
      link: [
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
