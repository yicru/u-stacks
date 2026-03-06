import { format } from 'date-fns'

export function formatDateTime(date: string | Date): string {
  return format(new Date(date), 'yyyy/MM/dd HH:mm')
}