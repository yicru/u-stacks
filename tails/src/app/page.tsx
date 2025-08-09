'use client'

import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SignInForm } from '@/features/auth/components/sign-in-form'
import { SignUpForm } from '@/features/auth/components/sign-up-form'
import { authClient } from '@/lib/auth-client'

export default function Home() {
  const session = authClient.useSession()

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
        <code className="block whitespace-pre rounded bg-neutral-100 p-4">
          {JSON.stringify(session, null, 2)}
        </code>
      </div>

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
    </div>
  )
}
