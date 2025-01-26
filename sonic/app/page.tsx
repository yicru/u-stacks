import {
  SignInButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/clerk-react'
import { getAuth } from '@clerk/react-router/ssr.server'
import { Button, Code } from '@mantine/core'
import { createClient } from 'server/client'
import { CreateTaskForm } from '../features/task/components/create-task-form'
import type { Route } from './+types/page'

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'New React Router App' },
    { name: 'description', content: 'Welcome to React Router!' },
  ]
}

export async function loader(args: Route.LoaderArgs) {
  const { getToken } = await getAuth(args)
  const client = createClient({ token: await getToken() })
  const response = await client.api.$get()
  const root = await response.json()

  const tasks = await client.api.tasks
    .$get()
    .then((response) => response.json())
    .then((data) => data.tasks)

  return { root, tasks }
}

export default function Index({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto w-full max-w-4xl p-10">
      <div className="flex items-center justify-between">
        <h1 className="font-bold text-4xl">
          <span className="mr-2">⚡</span>Sonic Stack
        </h1>
        <SignedOut>
          <SignInButton mode="modal">
            <Button>Sign in</Button>
          </SignInButton>
        </SignedOut>
        <SignedIn>
          <UserButton />
        </SignedIn>
      </div>

      <div className="mt-10">
        <p className="mb-2 font-medium text-sm">Loader Data</p>
        <Code block>{JSON.stringify(loaderData.root, null, 2)}</Code>
      </div>

      <SignedIn>
        <div className="mt-10">
          <p className="mb-2 font-medium text-sm">Tasks</p>
          <ul className="mb-4 list-disc pl-4 text-xs">
            {loaderData.tasks.map((task) => (
              <li key={task.id}>{task.title}</li>
            ))}
          </ul>
          <CreateTaskForm />
        </div>
      </SignedIn>
    </div>
  )
}
