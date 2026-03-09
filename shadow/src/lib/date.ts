import { format } from 'date-fns'
import { TZDate } from '@date-fns/tz'

const TIME_ZONE = 'Asia/Tokyo'

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new TZDate(date, TIME_ZONE) : new TZDate(date, TIME_ZONE)
  return format(d, 'yyyy/MM/dd HH:mm')
}