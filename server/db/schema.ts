import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ─── Videos ──────────────────────────────────────────────────────────────────

export const videos = sqliteTable('videos', {
  id: text('id').primaryKey(), // YouTube video ID
  channelId: text('channel_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  publishedAt: text('published_at').notNull(),
  thumbnailUrl: text('thumbnail_url'),
  duration: text('duration'),
  tags: text('tags'), // JSON array
  categoryId: text('category_id'),
  defaultLanguage: text('default_language'),
  viewCount: integer('view_count').default(0),
  likeCount: integer('like_count').default(0),
  commentCount: integer('comment_count').default(0),

  lastSyncedAt: text('last_synced_at'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
}, (t) => ({
  channelIdx: index('videos_channel_idx').on(t.channelId),
}))

// ─── Authors ──────────────────────────────────────────────────────────────────

export const authors = sqliteTable('authors', {
  channelId: text('channel_id').primaryKey(),
  name: text('name').notNull(),
  profileImageUrl: text('profile_image_url'),
  lastSeenAt: text('last_seen_at'),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
}, (t) => ({
  nameIdx: index('authors_name_idx').on(t.name),
}))

// ─── Comments ─────────────────────────────────────────────────────────────────

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(), // YouTube comment ID
  videoId: text('video_id').notNull().references(() => videos.id),
  parentId: text('parent_id'), // null = top-level thread
  authorName: text('author_name').notNull(),
  authorChannelId: text('author_channel_id'),
  authorProfileImageUrl: text('author_profile_image_url'),
  text: text('text').notNull(),

  textOriginal: text('text_original'),
  likeCount: integer('like_count').default(0),
  detectedLang: text('detected_lang'), // BCP-47 e.g. 'es', 'en'
  langConfidence: real('lang_confidence'), // 0.0 - 1.0
  publishedAt: text('published_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  status: text('status', {
    enum: ['pending', 'suggested', 'dismissed', 'published', 'skipped'],
  }).default('pending').notNull(),
  fetchedAt: text('fetched_at').default(sql`(datetime('now'))`),
  processedAt: text('processed_at'),
  // Denormalized fields for high-performance indexing
  lastActivityAt: text('last_activity_at'),
  lastActivityText: text('last_activity_text'),
  lastActivityAuthor: text('last_activity_author'),
  // Intelligence scoring
  priorityScore: integer('priority_score').default(50),
  priorityLabel: text('priority_label', {
    enum: ['urgent', 'high', 'normal', 'low'],
  }).default('normal'),
  isReturnCommenter: integer('is_return_commenter', { mode: 'boolean' }).default(false),
  opportunityFlags: text('opportunity_flags'), // JSON array: ['collab', 'sponsor', etc.]
  detectedIntent: text('detected_intent'), // cached intent from scorer
  translatedText: text('translated_text'), // cached translation in user's language
  translationLang: text('translation_lang'), // the language code of the cached translation
  isLive: integer('is_live', { mode: 'boolean' }).default(true),
}, (t) => ({
  videoIdx: index('comments_video_idx').on(t.videoId),
  statusIdx: index('comments_status_idx').on(t.status),
  publishedAtIdx: index('comments_published_at_idx').on(t.publishedAt),
  ytCommentUniq: uniqueIndex('comments_yt_id_unique').on(t.id),
  parentIdx: index('comments_parent_idx').on(t.parentId, t.publishedAt),
  // Optimized index for the main list
  listPerfIdx: index('comments_list_perf_idx').on(t.status, t.lastActivityAt),
  // Priority inbox index
  priorityIdx: index('comments_priority_idx').on(t.status, t.priorityScore),
  // Author index for analytics and sync
  authorChannelIdx: index('comments_author_channel_idx').on(t.authorChannelId),
}))

// ─── Suggested Replies ────────────────────────────────────────────────────────

export const suggestedReplies = sqliteTable('suggested_replies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  commentId: text('comment_id').notNull().references(() => comments.id),
  responseText: text('response_text').notNull(), // in commenter's language
  verificationTranslation: text('response_es'), // translation for user verification
  originalGenerated: text('original_generated').notNull(), // LLM raw output — immutable
  editedText: text('edited_text'), // human edits
  contextUsed: text('context_used'), // JSON
  confidenceScore: real('confidence_score'), // 0.0 - 1.0
  needsConfirmation: integer('needs_confirmation', { mode: 'boolean' }).default(false),
  confirmationReason: text('confirmation_reason'),
  videoLinksUsed: text('video_links_used'), // JSON array of verified IDs
  detectedCommentLang: text('detected_comment_lang'),
  modelUsed: text('model_used'),
  promptTokens: integer('prompt_tokens'),
  completionTokens: integer('completion_tokens'),
  generatedAt: text('generated_at').default(sql`(datetime('now'))`),
  reviewedAt: text('reviewed_at'),
  status: text('status', {
    enum: ['pending_review', 'approved', 'rejected', 'published'],
  }).default('pending_review').notNull(),
}, (t) => ({
  commentIdx: index('suggestions_comment_idx').on(t.commentId),
  statusIdx: index('suggestions_status_idx').on(t.status),
}))

// ─── Published Replies ────────────────────────────────────────────────────────

export const publishedReplies = sqliteTable('published_replies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  commentId: text('comment_id').notNull().references(() => comments.id),
  suggestionId: integer('suggestion_id').references(() => suggestedReplies.id),
  youtubeReplyId: text('youtube_reply_id').notNull(),
  finalText: text('final_text').notNull(),
  publishedAt: text('published_at').default(sql`(datetime('now'))`),
  publishedBy: text('published_by').default('owner'),
  // Reply performance tracking
  likeCount: integer('like_count').default(0),
  commenterRepliedBack: integer('commenter_replied_back', { mode: 'boolean' }).default(false),
  threadGrowthAfter: integer('thread_growth_after').default(0),
  replyMetricsSyncedAt: text('reply_metrics_synced_at'),
}, (t) => ({
  commentIdx: index('published_comment_idx').on(t.commentId),
  ytReplyUniq: uniqueIndex('published_yt_reply_unique').on(t.youtubeReplyId),
}))

// ─── Knowledge Base ───────────────────────────────────────────────────────────

export const knowledgeBase = sqliteTable('knowledge_base', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type', {
    enum: ['faq', 'style', 'info', 'rule'],
  }).notNull(),
  title: text('title').notNull(),
  content: text('content').notNull(),
  tags: text('tags'), // JSON array
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  priority: integer('priority').default(0), // higher = included first in context
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
}, (t) => ({
  typeIdx: index('kb_type_idx').on(t.type),
  activeIdx: index('kb_active_idx').on(t.isActive),
}))

// ─── Video Summaries ──────────────────────────────────────────────────────────

export const videoSummaries = sqliteTable('video_summaries', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  videoId: text('video_id').notNull().references(() => videos.id),
  summary: text('summary').notNull(),
  keyTopics: text('key_topics'), // JSON array
  faqs: text('faqs'), // JSON array of {q, a}
  generatedAt: text('generated_at').default(sql`(datetime('now'))`),
  generatedBy: text('generated_by').default('openai'),
  tokenCount: integer('token_count'),
}, (t) => ({
  videoUniq: uniqueIndex('video_summaries_video_unique').on(t.videoId),
}))

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // 64 random hex chars
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  expiresAt: text('expires_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  isValid: integer('is_valid', { mode: 'boolean' }).default(true),
}, (t) => ({
  expiresIdx: index('sessions_expires_idx').on(t.expiresAt),
}))

// ─── Login Attempts ───────────────────────────────────────────────────────────

export const loginAttempts = sqliteTable('login_attempts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ipAddress: text('ip_address').notNull(),
  attemptedAt: text('attempted_at').default(sql`(datetime('now'))`),
  success: integer('success', { mode: 'boolean' }).default(false),
  userAgent: text('user_agent'),
}, (t) => ({
  ipIdx: index('login_attempts_ip_idx').on(t.ipAddress),
  timeIdx: index('login_attempts_time_idx').on(t.attemptedAt),
}))

// ─── OAuth Tokens ─────────────────────────────────────────────────────────────

export const oauthTokens = sqliteTable('oauth_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  channelId: text('channel_id').notNull(),
  accessToken: text('access_token').notNull(), // AES-256-GCM encrypted
  refreshToken: text('refresh_token').notNull(), // AES-256-GCM encrypted
  tokenType: text('token_type').default('Bearer'),
  expiresAt: text('expires_at').notNull(),
  scope: text('scope'),
  channelTitle: text('channel_title'),
  channelThumbnailUrl: text('channel_thumbnail_url'),
  channelSubscriberCount: text('channel_subscriber_count'),
  channelVideoCount: text('channel_video_count'),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
}, (t) => ({
  channelUniq: uniqueIndex('oauth_channel_unique').on(t.channelId),
}))

// ─── Sync Log ─────────────────────────────────────────────────────────────────

export const syncLog = sqliteTable('sync_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  syncType: text('sync_type', {
    enum: ['videos', 'comments', 'replies_check', 'manual', 'scheduled'],
  }).notNull(),
  status: text('status', {
    enum: ['running', 'completed', 'failed', 'partial'],
  }).notNull(),
  videosProcessed: integer('videos_processed').default(0),
  commentsFound: integer('comments_found').default(0),
  newComments: integer('new_comments').default(0),
  quotaUsed: integer('quota_used').default(0),
  errorMessage: text('error_message'),
  startedAt: text('started_at').default(sql`(datetime('now'))`),
  completedAt: text('completed_at'),
})

// ─── App Settings ─────────────────────────────────────────────────────────────

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ─── Error Logs ───────────────────────────────────────────────────────────────

export const errorLogs = sqliteTable('error_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  level: text('level', { enum: ['info', 'warn', 'error', 'fatal'] }).notNull(),
  source: text('source').notNull(),
  message: text('message').notNull(),
  details: text('details'), // JSON
  stackTrace: text('stack_trace'),
  occurredAt: text('occurred_at').default(sql`(datetime('now'))`),
}, (t) => ({
  levelIdx: index('error_logs_level_idx').on(t.level),
  sourceIdx: index('error_logs_source_idx').on(t.source),
  timeIdx: index('error_logs_time_idx').on(t.occurredAt),
}))
// ─── Banned Authors ──────────────────────────────────────────────────────────
export const bannedAuthors = sqliteTable('banned_authors', {
  channelId: text('channel_id').primaryKey(),
  authorName: text('author_name').notNull(),
  bannedAt: text('banned_at').default(sql`(datetime('now'))`),
  reason: text('reason'),
})

// ─── Agent Chats ──────────────────────────────────────────────────────────────

export const agentChats = sqliteTable('agent_chats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull().default('New conversation'),
  messageCount: integer('message_count').default(0),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ─── Agent Messages ───────────────────────────────────────────────────────────

export const agentMessages = sqliteTable('agent_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  chatId: integer('chat_id').notNull().references(() => agentChats.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant'] }).notNull(),
  content: text('content').notNull(),
  metadata: text('metadata'), // JSON: { promptTokens, completionTokens, model }
  createdAt: text('created_at').default(sql`(datetime('now'))`),
}, (t) => ({
  chatIdx: index('agent_messages_chat_idx').on(t.chatId),
}))

// ─── Automation Rules ─────────────────────────────────────────────────────────

export const automationRules = sqliteTable('automation_rules', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  // JSON: [{ field, operator, value }]
  conditions: text('conditions').notNull(),
  action: text('action', {
    enum: ['auto_dismiss', 'set_priority', 'add_flag', 'auto_suggest', 'notify'],
  }).notNull(),
  actionParams: text('action_params'), // JSON: { label?, flag?, ... }
  triggerCount: integer('trigger_count').default(0),
  createdAt: text('created_at').default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').default(sql`(datetime('now'))`),
})

// ─── Video Idea Cache ─────────────────────────────────────────────────────────

export const videoIdeasCache = sqliteTable('video_ideas_cache', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  clusters: text('clusters').notNull(), // JSON array of VideoIdeaCluster
  generatedAt: text('generated_at').default(sql`(datetime('now'))`),
  commentsAnalyzed: integer('comments_analyzed').default(0),
  modelUsed: text('model_used'),
})
