export type VideoSearchFn = (query: string) => Promise<Array<{ id: string; title: string; thumbnailUrl: string | null }>>
