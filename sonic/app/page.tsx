import { Code } from '@mantine/core'
import { client } from 'server/client'
import type { Route } from './+types/page'

export function meta(_: Route.MetaArgs) {
  return [
    { title: 'New React Router App' },
    { name: 'description', content: 'Welcome to React Router!' },
  ]
}

export async function loader(_: Route.LoaderArgs) {
  const response = await client.api.$get()
  const result = await response.json()

  return {
    message: result.message,
  }
}

export default function Index({ loaderData }: Route.ComponentProps) {
  return (
    <div className="mx-auto w-full max-w-4xl p-10">
      <h1 className="font-bold text-4xl">
        <span className="mr-2">⚡</span>Sonic Stack
      </h1>

      <div className="mt-10">
        <p className="mb-2 font-medium text-sm">Loader Data</p>
        <Code block>{JSON.stringify(loaderData, null, 2)}</Code>
      </div>
    </div>
  )
}
