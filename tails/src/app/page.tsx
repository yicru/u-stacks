'use client'

import { useSuspenseQuery } from '@tanstack/react-query'
import { parseResponse } from 'hono/client'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SignInForm } from '@/features/auth/components/sign-in-form'
import { SignUpForm } from '@/features/auth/components/sign-up-form'
import { CreateTaskForm } from '@/features/tasks/components/create-task-form'
import { TaskList } from '@/features/tasks/components/task-list'
import { apiClient } from '@/lib/api-client'
import { authClient } from '@/lib/auth-client'

export default function Home() {
  const session = authClient.useSession()

  const { data, refetch } = useSuspenseQuery({
    queryKey: ['tasks'],
    queryFn: async () => {
      if (!session.data) return null

      const startTime = performance.now()
      const response = await parseResponse(apiClient.api.tasks.$get())
      const endTime = performance.now()
      const responseTime = Math.round(endTime - startTime)

      return { response, responseTime }
    },
  })

  const handleSignOut = async () => {
    try {
      await authClient.signOut()
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  return (
    <div className="space-y-8 p-10">
      <h1 className="font-bold text-2xl">Tails Stack ⚡</h1>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <p>Session</p>
          <Button onClick={handleSignOut}>Sign Out</Button>
        </div>
        <code className="block overflow-scroll whitespace-pre rounded bg-neutral-100 p-4">
          {JSON.stringify(session, null, 2)}
        </code>
      </div>

      {!session.data && (
        <Tabs defaultValue="sign-up" className="max-w-xl">
          <TabsList>
            <TabsTrigger value="sign-up">Sign Up</TabsTrigger>
            <TabsTrigger value="sign-in">Sign In</TabsTrigger>
          </TabsList>
          <TabsContent value="sign-up" className="p-2">
            <SignUpForm />
          </TabsContent>
          <TabsContent value="sign-in" className="p-2">
            <SignInForm />
          </TabsContent>
        </Tabs>
      )}

      {data?.response?.success && (
        <div className="space-y-4">
          <h2 className="font-semibold text-lg">
            Your Tasks
            {data.responseTime !== null && (
              <span className="ml-2 text-gray-500 text-sm">
                ({data.responseTime}ms)
              </span>
            )}
          </h2>
          <TaskList tasks={data.response.data.tasks} onTaskDeleted={refetch} />
          <CreateTaskForm onTaskCreated={refetch} />
        </div>
      )}
    </div>
  )
}
