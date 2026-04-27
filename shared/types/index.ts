// ─── Comment ─────────────────────────────────────────────────────────────────

export type CommentStatus = 'pending' | 'suggested' | 'dismissed' | 'published' | 'skipped'

export type PriorityLabel = 'urgent' | 'high' | 'normal' | 'low'

export interface Comment {
  id: string
  videoId: string
  parentId: string | null
  authorName: string
  authorChannelId: string | null
  authorProfileImageUrl: string | null
  text: string
  likeCount: number
  detectedLang: string | null
  langConfidence: number | null
  publishedAt: string
  updatedAt: string
  status: CommentStatus
  fetchedAt: string | null
  processedAt: string | null
  isBanned?: boolean
  // Intelligence scoring
  priorityScore: number | null
  priorityLabel: PriorityLabel | null
  isReturnCommenter: boolean | null
  opportunityFlags: string[] | null
  detectedIntent: string | null
  translatedText?: string | null
}

export interface CommentListItem extends Comment {
  videoTitle: string | null
  videoThumbnail: string | null
  replyText?: string | null
  suggestedReplyText?: string | null
  lastText?: string
  lastAuthor?: string
  lastActivityAt?: string
}

// ─── Analytics ────────────────────────────────────────────────────────────────

export interface SentimentDataPoint {
  date: string
  positive: number
  neutral: number
  negative: number
  total: number
}

export interface TopicCluster {
  topic: string
  count: number
  totalLikes: number
  exampleComments: string[]
}

export interface SuperfanEntry {
  authorName: string
  authorChannelId: string | null
  authorProfileImageUrl: string | null
  commentCount: number
  totalLikes: number
  firstSeenAt: string
  lastSeenAt: string
}

export interface VideoCommentStats {
  videoId: string
  videoTitle: string
  thumbnailUrl: string | null
  pendingCount: number
  publishedCount: number
  negativeCount: number
  questionCount: number
  totalComments: number
}

export interface AnalyticsOverview {
  replyRate: number
  avgResponseTimeHours: number | null
  returnCommenterRate: number
  totalCommentsLast30Days: number
  sentiment: { positive: number; neutral: number; negative: number }
  languageDistribution: Record<string, number>
}

// ─── Video Ideas ──────────────────────────────────────────────────────────────

export interface VideoIdeaCluster {
  id: string
  topic: string
  suggestedTitle: string
  demandCount: number
  totalLikes: number
  exampleQuestions: string[]
  // Strategy & Production Blueprint
  strategicObjective: string
  viralHook: string
  keyPillars: string[]
  productionTips: string
  expectedOutcome: string
  addedToKb?: boolean
  dismissed?: boolean
}

// ─── Automation Rules ─────────────────────────────────────────────────────────

export type AutomationConditionField = 'contains_keyword' | 'intent_is' | 'score_above' | 'score_below' | 'language_is' | 'is_return_commenter' | 'has_opportunity_flag'
export type AutomationAction = 'auto_dismiss' | 'set_priority' | 'add_flag' | 'auto_suggest' | 'notify'

export interface AutomationCondition {
  field: AutomationConditionField
  value: string | number | boolean
}

export interface AutomationRule {
  id: number
  name: string
  isActive: boolean
  conditions: AutomationCondition[]
  action: AutomationAction
  actionParams: Record<string, string | number> | null
  triggerCount: number
  createdAt: string | null
  updatedAt: string | null
}

// ─── Suggestion ──────────────────────────────────────────────────────────────

export type SuggestionStatus = 'pending_review' | 'approved' | 'rejected' | 'published'

export interface VideoLink {
  video_id: string
  video_title: string
  url: string
  thumbnail_url?: string | null
}

export interface ContextUsed {
  kb_entries: string[]
  video_title: string | null
  video_summary_used: boolean
  existing_replies_checked: boolean
  existing_replies_count: number
}

export interface SuggestedReply {
  id: number
  commentId: string
  responseText: string
  verificationTranslation: string | null
  originalGenerated: string
  editedText: string | null
  contextUsed: ContextUsed | null
  confidenceScore: number | null
  needsConfirmation: boolean | null
  confirmationReason: string | null
  videoLinksUsed: VideoLink[]
  detectedCommentLang: string | null
  modelUsed: string | null
  promptTokens: number | null
  completionTokens: number | null
  generatedAt: string | null
  reviewedAt: string | null
  status: SuggestionStatus
}

// ─── Knowledge Base ───────────────────────────────────────────────────────────

export type KBType = 'faq' | 'style' | 'info' | 'rule'

export interface KnowledgeBaseEntry {
  id: number
  type: KBType
  title: string
  content: string
  tags: string[] | null
  isActive: boolean | null
  priority: number | null
  createdAt: string | null
  updatedAt: string | null
}

// ─── Video ────────────────────────────────────────────────────────────────────

export interface Video {
  id: string
  title: string
  thumbnailUrl: string | null
  publishedAt: string
  viewCount: number | null
  likeCount: number | null
  commentCount: number | null
  lastSyncedAt: string | null
  defaultLanguage: string | null
  duration: string | null
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardComment {
  id: string
  videoId: string
  authorName: string
  text: string
  likeCount: number
  detectedLang: string | null
  publishedAt: string
  status: CommentStatus
  videoTitle: string | null
  videoThumbnail: string | null
  replyText?: string | null
  authorProfileImageUrl: string | null
}

export interface UrgentComment {
  id: string
  authorName: string
  text: string
  likeCount: number | null
  priorityLabel: PriorityLabel | null
  priorityScore: number | null
  opportunityFlags: string | null
  detectedIntent: string | null
  publishedAt: string
  status: string
  videoTitle: string | null
}

export interface DashboardStats {
  comments: {
    pending: number
    suggested: number
    publishedToday: number
    totalPublished: number
  }
  recentComments: DashboardComment[]
  recentCommentsTotal: number
  recentVideos: Video[]
  urgentComments: UrgentComment[]
  urgentCount: number
}

export interface SyncLogEntry {
  id: number
  syncType: string
  status: string
  newComments: number | null
  quotaUsed: number | null
  startedAt: string | null
  completedAt: string | null
  errorMessage: string | null
}

export interface ErrorLogEntry {
  id: number
  source: string
  message: string
  level: string
  occurredAt: string | null
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  items: T[]
  pagination: {
    page: number
    limit: number
    total: number
    pages: number
  }
}

export interface YouTubeStatus {
  connected: boolean
  dailyQuotaUsed: number
  autoSuggestRunning?: boolean
  channel: {
    id: string
    title: string | null | undefined
    thumbnailUrl: string | null | undefined
    subscriberCount: string | null | undefined
    videoCount: string | null | undefined
  } | null
  lastSync: {
    syncType: string
    status: string
    startedAt: string | null
    completedAt: string | null
    videosProcessed: number | null
    commentsFound: number | null
    newComments: number | null
    quotaUsed: number | null
    errorMessage: string | null | undefined
    nextSyncAt?: string | null
  } | null
}

export interface CommentReply {
  id: string
  authorName: string
  text: string
  publishedAt: string
  authorChannelId: string | null
  authorProfileImageUrl: string | null
  isOwner?: boolean
  isLocal?: boolean
  detectedLang?: string | null
  translatedText?: string | null
}

export interface CommenterHistory {
  authorName: string
  total: number
  totalLikes: number
  items: Array<{
    id: string
    text: string
    likeCount: number | null
    publishedAt: string
    status: string
    videoTitle: string | null
    videoId: string
  }>
}

export interface CommentDetailResponse {
  comment: Comment
  video: Video | null
  replies: CommentReply[]
  suggestions: SuggestedReply[]
  publishedReply: any | null
  ownerThumbnail?: string | null
  ownerChannelId?: string | null
}
