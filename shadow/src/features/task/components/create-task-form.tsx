import { Effect, Schema } from 'effect'
import { useForm } from '@tanstack/react-form'
import { useRouter } from '@tanstack/react-router'
import { TaskCreateBody } from '@shared/api/task'
import { toast } from '@/components/ui/toast'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/lib/api-client'

const formSchema = Schema.toStandardSchemaV1(TaskCreateBody)

export function CreateTaskForm() {
  const router = useRouter()

  const form = useForm({
    defaultValues: {
      title: '',
    },
    validators: {
      onSubmit: formSchema,
    },
    onSubmit: async ({ value }) => {
      try {
        await Effect.runPromise(
          apiClient.tasks.createTask({
            payload: { title: value.title },
          }),
        )
        form.reset()
        router.invalidate()
        toast.add({ title: 'Task created', type: 'success' })
      } catch {
        toast.add({ title: 'Failed to create task', type: 'error' })
      }
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <FieldGroup className="flex-row items-start gap-3">
        <form.Field name="title">
          {(field) => {
            const errors = field.state.meta.errors
            const isInvalid =
              (field.state.meta.isTouched && errors.length > 0) || undefined

            return (
              <Field data-invalid={isInvalid} className="flex-1">
                <FieldLabel htmlFor="task-title" className="sr-only">
                  Task title
                </FieldLabel>
                <Input
                  id="task-title"
                  aria-invalid={isInvalid}
                  placeholder="What needs to be done?"
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  className="h-10 px-3.5 shadow-xs transition-shadow hover:border-border/80"
                />
                {isInvalid && <FieldError errors={errors} />}
              </Field>
            )
          }}
        </form.Field>

        <Button
          disabled={form.state.isSubmitting}
          type="submit"
          className="h-10 gap-1.5 px-4 shadow-xs"
        >
          <HugeiconsIcon
            icon={Add01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          <span className="hidden sm:inline-block font-medium">Add Task</span>
        </Button>
      </FieldGroup>
    </form>
  )
}
