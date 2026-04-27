import { getVideoIdeas } from '../../services/video-ideas-engine'

// Force regenerate
export default defineEventHandler(async (event) => {
  return getVideoIdeas(true, event)
})

