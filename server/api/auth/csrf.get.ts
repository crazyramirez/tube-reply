import { generateToken } from '../../utils/crypto'

export default defineEventHandler((event) => {
  const token = generateToken(16)

  // Readable by JS so the client can attach it as a header
  setCookie(event, 'csrf_token', token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60, // 1 hour
  })

  return { token }
})
