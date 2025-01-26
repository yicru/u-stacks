import { Link } from 'react-router'
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
    <div className="grid min-h-dvh place-content-center space-y-10">
      <h1 className="font-bold text-4xl">Hono on React Router</h1>
      <code className="rounded bg-zinc-900 p-4 text-white">
        <p className="text-xs">Loader Data</p>
        <p className="mt-1">{JSON.stringify(loaderData, null, 2)}</p>
      </code>
      <div className="flex justify-end">
        <Link to="/tasks" className="text-blue-500 underline">
          tasks page
        </Link>
      </div>
    </div>
  )
}
