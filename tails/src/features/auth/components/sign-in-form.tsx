'use client'

import { useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { authClient } from '@/lib/auth-client'

const formSchema = z.object({
  email: z.string(),
  password: z.string(),
})

type FormValues = z.infer<typeof formSchema>

export function SignInForm() {
  const [isPending, startTransition] = useTransition()

  const form = useForm<FormValues>({
    defaultValues: {
      email: '',
      password: '',
    },
  })

  const onSubmit = (values: FormValues) => {
    startTransition(async () => {
      const result = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      })

      console.log(result)
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button disabled={isPending} type="submit">
          Submit
        </Button>
      </form>
    </Form>
  )
}
