
import handler from '../server/api/comments/index.get'

async function test() {
  try {
    const event = {
      node: { req: {}, res: {} },
      context: {},
    } as any
    // Mock getQuery
    const result = await handler({
      ...event,
      _query: { status: 'inbox' }
    } as any)
    console.log('Inbox Results:', JSON.stringify(result, null, 2))
  } catch (err) {
    console.error('Error calling comments handler:', err)
  }
}

test()
