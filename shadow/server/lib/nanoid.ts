import { customAlphabet } from 'nanoid'

const alphabet =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
const defaultNanoid = customAlphabet(alphabet, 14)

export const nanoid = (length = 14) => {
  return length === 14 ? defaultNanoid() : customAlphabet(alphabet, length)()
}
