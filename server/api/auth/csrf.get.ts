import { generateToken } from '../../utils/crypto'

export default defineEventHandler((event) => {
  const token = generateToken(16)

  setCookie(event, 'csrf_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60,
  })

  return { token }
})
