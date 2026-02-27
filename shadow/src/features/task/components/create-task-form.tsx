import { parseResponse } from 'hono/client'
import { useForm } from '@tanstack/react-form'
import { useRouter } from '@tanstack/react-router'
import { z } from 'zod'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { Add01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { apiClient } from '@/lib/api-client'

const formSchema = z.object({
  title: z.string().min(1, 'Title is required'),
})

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
        await parseResponse(
          apiClient.api.tasks.$post({
            json: { title: value.title },
          }),
        )
        form.reset()
        router.invalidate()
        toast.success('Task created')
      } catch {
        toast.error('Failed to create task')
      }
    },
  })

  return (
    <form
      className="flex items-start gap-3"
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <form.Field
        name="title"
        children={(field) => {
          const errors = field.state.meta.errors
          const isInvalid = field.state.meta.isTouched && errors.length > 0

          return (
            <Field data-invalid={isInvalid || undefined} className="flex-1">
              <Input
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
      />

      <Button
        disabled={form.state.isSubmitting}
        type="submit"
        className="h-10 gap-1.5 px-4 shadow-xs"
      >
        <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
        <span className="hidden sm:inline-block font-medium">Add Task</span>
      </Button>
    </form>
  )
}
