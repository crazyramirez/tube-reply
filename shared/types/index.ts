// ─── Comment ─────────────────────────────────────────────────────────────────

export type CommentStatus = 'pending' | 'suggested' | 'dismissed' | 'published' | 'skipped'

export interface Comment {
  id: string
  videoId: string
  parentId: string | null
  authorName: string
  authorChannelId: string | null
  text: string
  likeCount: number
  detectedLang: string | null
  langConfidence: number | null
  publishedAt: string
  updatedAt: string
  status: CommentStatus
  fetchedAt: string | null
  processedAt: string | null
}

export interface CommentListItem extends Comment {
  videoTitle: string | null
  videoThumbnail: string | null
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
  responseEs: string | null
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

export type KBType = 'channel_style' | 'faq' | 'topic' | 'persona' | 'rule' | 'custom'

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
  commentCount: number | null
  lastSyncedAt: string | null
  defaultLanguage: string | null
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
  channel: {
    id: string
    title: string | null | undefined
    thumbnailUrl: string | null | undefined
    subscriberCount: string | null | undefined
    videoCount: string | null | undefined
  } | null
  lastSync: {
    completedAt: string | null
    status: string
    newComments: number | null
    quotaUsed: number | null
    errorMessage: string | null | undefined
  } | null
}
