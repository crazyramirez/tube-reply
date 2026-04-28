export const useYouTubeThumbnail = () => {
  const failedThumbnails = ref<Record<string, boolean>>({});

  /**
   * Returns a standard YouTube thumbnail URL.
   * YouTube sometimes provides dynamic URLs (i9.ytimg.com with params) that might expire.
   * This ensures we use the most stable hostname.
   */
  const getCleanThumbnailUrl = (videoId: string, originalUrl?: string | null | undefined) => {
    if (!videoId) return originalUrl;
    return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
  };

  /**
   * Handles image load errors by trying lower quality fallbacks.
   * @param id A unique identifier for the item (video ID or comment ID)
   * @param videoId The YouTube video ID
   * @param event The error event
   */
  const handleThumbnailError = (id: string, videoId: string, event: Event) => {
    const img = event.target as HTMLImageElement;
    
    // Fallback chain: mqdefault -> default
    const mq = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    const sd = `https://i.ytimg.com/vi/${videoId}/default.jpg`;

    // If it's not a standard /vi/ URL (like the i9... one that might have failed), try mqdefault
    if (!img.src.includes('/vi/')) {
      img.src = mq;
    } 
    // If it was already mqdefault but failed, try the base default (last resort)
    else if (img.src.includes('mqdefault')) {
      img.src = sd;
    } 
    // If even the base default fails, mark as completely failed to show placeholder
    else {
      failedThumbnails.value[id] = true;
    }
  };

  return {
    failedThumbnails,
    getCleanThumbnailUrl,
    handleThumbnailError
  };
};
