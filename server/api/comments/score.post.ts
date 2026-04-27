import { scoreAllComments } from '../../services/comment-scorer'

export default defineEventHandler(async (event) => {
  const body = await readBody(event).catch(() => ({}))
  const onlyUnscored = body?.onlyUnscored !== false // default true

  const updated = await scoreAllComments({ onlyUnscored })
  return { updated }
})
