import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { Schema } from 'effect'
import { ReferenceSearch } from '@shared/api/reference'
import { loadReference } from '@/features/reference/load'
import { ReferenceView } from '@/features/reference/view'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/reference')({
  validateSearch: Schema.toStandardSchemaV1(ReferenceSearch),
  loaderDeps: ({ search }) => search,
  loader: ({ deps, abortController }) =>
    loadReference(deps, abortController.signal),
  component: ReferencePage,
  errorComponent: ({ reset }) => (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-12">
      <Alert variant="destructive">
        <AlertTitle>Could not load this page</AlertTitle>
        <AlertDescription>
          Check the cursor or try loading the page again.
        </AlertDescription>
      </Alert>
      <Button onClick={reset} className="self-start">
        Try again
      </Button>
      <Button
        variant="outline"
        render={<Link to="/reference" search={{ mode: 'stream' }} />}
        nativeButton={false}
        className="self-start"
      >
        First page
      </Button>
    </main>
  ),
})

function ReferencePage() {
  const router = useRouter()
  const navigate = Route.useNavigate()
  const data = Route.useLoaderData()
  const search = Route.useSearch()

  return (
    <ReferenceView
      data={data}
      search={search}
      onMode={(mode) => {
        void navigate({ search: { ...search, mode } })
      }}
      onNext={(cursor) => {
        void navigate({
          search: { ...search, cursor },
        })
      }}
      onRefresh={() =>
        router.invalidate({
          filter: (match) =>
            match.routeId === '/' || match.routeId === '/reference',
          sync: true,
        })
      }
    />
  )
}
