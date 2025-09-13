'use client'

import { parseResponse } from 'hono/client'
import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/lib/api-client'

const formSchema = z.object({
  title: z.string().min(1, 'Title is required'),
})

type FormValues = z.infer<typeof formSchema>

interface CreateTaskFormProps {
  onTaskCreated?: () => void
}

export function CreateTaskForm({ onTaskCreated }: CreateTaskFormProps) {
  const [isPending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    defaultValues: {
      title: '',
    },
  })

  const onSubmit = async (values: FormValues) => {
    startTransition(async () => {
      const result = await parseResponse(
        apiClient.api.tasks.$post({
          json: { title: values.title },
        }),
      )

      if (result.success) {
        form.reset()
        onTaskCreated?.()
      }
    })
  }

  return (
    <Form {...form}>
      <form
        className="flex items-center gap-2"
        onSubmit={form.handleSubmit(onSubmit)}
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormControl>
                <Input placeholder="Enter task title" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button disabled={isPending} type="submit">
          Create Task
        </Button>
      </form>
    </Form>
  )
}
