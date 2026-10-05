const dateTimeFormatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function formatDateTime(date: string | Date): string {
  return dateTimeFormatter.format(
    typeof date === 'string' ? new Date(date) : date,
  )
}
