import { parseResponse } from 'hono/client'
import { useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { apiClient } from '@/lib/api-client'

interface TaskListProps {
  tasks: { id: string; title: string; createdAt: string }[]
  onTaskDeleted: () => void
}

export function TaskList({ tasks, onTaskDeleted }: TaskListProps) {
  const [isPending, startTransition] = useTransition()

  const handleDelete = async (id: string) => {
    startTransition(async () => {
      const result = await parseResponse(
        apiClient.api.tasks[':id'].$delete({
          param: { id },
        }),
      )
      if (result.success) {
        onTaskDeleted()
      }
    })
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Title</TableHead>
          <TableHead>Created At</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell>{task.title}</TableCell>
            <TableCell>
              {new Date(task.createdAt).toLocaleDateString()}
            </TableCell>
            <TableCell className="text-right">
              <Button
                disabled={isPending}
                size="sm"
                variant="outline"
                onClick={() => handleDelete(task.id)}
              >
                Delete
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
