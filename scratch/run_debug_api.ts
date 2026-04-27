
import handler from '../server/api/analytics/debug.get'

async function test() {
  try {
    const result = await handler({} as any)
    console.log('Debug Results:', JSON.stringify(result, null, 2))
  } catch (err) {
    console.error('Error calling debug handler:', err)
  }
}

test()
