import { customAlphabet } from 'nanoid'

export const nanoid = (length = 14) => {
  return customAlphabet(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    length,
  )()
}
