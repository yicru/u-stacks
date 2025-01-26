import type { Task } from '@prisma/client'

type Props = {
  tasks: Task[]
}

export function TaskList({ tasks }: Props) {
  return (
    <ul className="list-disc pl-4">
      {tasks.map((task) => (
        <li key={task.id}>{task.title}</li>
      ))}
    </ul>
  )
}
