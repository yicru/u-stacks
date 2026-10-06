export async function measureTaskMutation(
  operation: 'create' | 'update' | 'delete',
  mutation: () => Promise<void>,
) {
  const started = performance.now()
  let outcome = 'error'
  try {
    await mutation()
    outcome = 'success'
  } finally {
    const name = `task.${operation}.refresh`
    try {
      performance.clearMeasures(name)
      performance.measure(name, {
        start: started,
        end: performance.now(),
        detail: { outcome },
      })
    } catch {}
  }
}
