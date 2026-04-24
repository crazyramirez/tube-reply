import bcrypt from 'bcryptjs'
import { createInterface } from 'node:readline'

const rl = createInterface({ input: process.stdin, output: process.stdout })

rl.question('Enter your admin password: ', async (password) => {
  rl.close()
  if (!password.trim()) {
    console.error('Password cannot be empty')
    process.exit(1)
  }
  const hash = await bcrypt.hash(password, 12)
  console.log('\nAdd this to your .env file:')
  console.log(`ADMIN_PASSWORD_HASH=${hash}`)
})
