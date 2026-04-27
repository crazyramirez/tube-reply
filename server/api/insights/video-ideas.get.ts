import { getVideoIdeas } from '../../services/video-ideas-engine'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const force = query.force === '1' || query.force === 'true'
  return getVideoIdeas(force, event)
})

