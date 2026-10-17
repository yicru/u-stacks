# Repository map

Use this reference to locate code and understand package boundaries. Paths in the original sections below are relative to `shadow` within the repository (a dot means the root). Confirm change-sensitive details against current files.

## STRUCTURE

```text
shadow/
├── shared/api/
│   ├── index.ts                   # Top-level AppApi composition
│   ├── errors.ts                  # Shared error Schema.Class values
│   ├── schema-error-middleware.ts # HttpApiSchemaError → ValidationError
│   ├── pagination.ts              # Shared pagination query and metadata schemas
│   └── {resource}.ts              # Request, response, params, and payload schemas
├── src/
│   ├── routes/
│   │   ├── __root.tsx             # Root layout
│   │   ├── index.tsx              # Top page
│   │   └── api/$.ts               # /api/* Web Request bridge
│   ├── start.ts                    # defaultSsr: false
│   ├── lib/
│   │   ├── api-client.ts          # HttpApiClient generated from AppApi
│   │   └── utils.ts               # cn() helper
│   ├── components/ui/             # shadcn/ui Base UI variant
│   └── features/                  # Domain UI components
├── server/
│   ├── index.ts                   # Production Layer composition
│   ├── handler.ts                 # Effect API Web handler factory
│   ├── db/
│   │   ├── index.ts               # Database Context.Service
│   │   ├── live.ts                # Turso/Drizzle Layer
│   │   └── schema.ts              # Drizzle tables
│   ├── modules/{name}/
│   │   ├── handlers.ts            # HttpApiBuilder.group
│   │   ├── service.ts             # Context.Service + Live Layer
│   │   └── service.test.ts        # Service behavior tests
│   └── lib/                       # Pagination and ID utilities
├── scripts/setup.ts               # Template initialization
├── .scaffdog/module.md            # Effect module generator
├── vite.config.ts
├── vitest.config.ts
├── wrangler.jsonc
└── drizzle.config.ts
```

## WHERE TO LOOK

| Task                | Location                               | Notes                              |
| ------------------- | -------------------------------------- | ---------------------------------- |
| Add page            | `src/routes/`                          | TanStack Router file-based routing |
| Define API contract | `shared/api/`                          | Effect Schema and HttpApi groups   |
| Implement endpoint  | `server/modules/`                      | Handler and service Layers         |
| Compose runtime     | `server/handler.ts`, `server/index.ts` | Web handler and production Layers  |
| Add UI component    | `src/components/ui/`                   | `bunx shadcn add <name>`           |
| DB schema           | `server/db/schema.ts`                  | Drizzle SQLite dialect             |
| Module rules        | `server/modules/README.md`             | Registration and testing workflow  |
