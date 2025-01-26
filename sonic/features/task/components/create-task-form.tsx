import { useAuth } from '@clerk/react-router'
import { Button, TextInput } from '@mantine/core'
import { useForm, zodResolver } from '@mantine/form'
import { useRevalidator } from 'react-router'
import { z } from 'zod'
import { createClient } from '../../../server/client'

const schema = z.object({
  title: z.string(),
})

type FormValues = z.infer<typeof schema>

export function CreateTaskForm() {
  const { getToken } = useAuth()
  const revalidator = useRevalidator()

  const form = useForm<FormValues>({
    initialValues: {
      title: '',
    },
    validate: zodResolver(schema),
  })

  const handleSubmit = async (values: FormValues) => {
    const client = createClient({ token: await getToken() })
    await client.api.tasks.$post({
      json: {
        title: values.title,
      },
    })

    alert('created')
    form.reset()
    await revalidator.revalidate()
  }

  return (
    <form
      className="flex items-center gap-2"
      onSubmit={form.onSubmit(handleSubmit)}
    >
      <TextInput
        key={form.key('title')}
        className="flex-1"
        {...form.getInputProps('title')}
      />
      <Button type="submit">Submit</Button>
    </form>
  )
}
