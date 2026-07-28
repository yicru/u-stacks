# Shadow Effect HTTP API 全面移行設計

## 決定

ShadowスタックのバックエンドをHonoからEffect HTTP APIへ全面移行する。

API contract、requestとresponseのSchema、typed error、service、dependency injection、browser clientをEffectで統一する。

既存のURL、HTTP status、JSON envelope、画面動作は維持する。

Honoとの併存期間は設けない。

## 対象範囲

移行対象は次の要素である。

- `/api`配下のHTTP routing
- Health Check API
- Task CRUD API
- request、response、errorのSchema
- Task serviceとDB依存の表現
- TanStack StartのAPI bridge
- browserの型安全API client
- module generator
- ShadowスタックのREADMEとAGENTS.md
- API contract、HTTP integration、Layer、browser clientのtest

DB schema、Drizzle、Turso、既存画面の見た目は変更しない。

OpenAPI UI、認証、認可、retry policy、repository層は追加しない。

## 現行構成

現行のTanStack Start server routeは、標準Web `Request`をHonoの`app.fetch`へ渡している。

Honoは`/api`をbase pathとしてHealth CheckとTaskのrouterをmountする。

browserはHono RPCの`hc<AppType>`からclientを生成する。

Task serviceはmodule top-levelのDrizzle instanceを直接参照し、Promiseを返す。

request validationにはZodと`@hono/zod-validator`を使用する。

この構成では、API contractがHono routerのchainに埋め込まれ、server、service、browser clientがEffectのfailure channelとLayerを利用できない。

## 移行後の構成

API contractは`shared/api`へ配置する。

`shared/api`はEffect SchemaとEffect HTTP APIの宣言だけを含み、Drizzle、Cloudflare Workers、Reactへ依存しない。

serverとbrowserは同じcontract valueをruntimeでimportする。

```text
shadow/
├── shared/
│   └── api/
│       ├── errors.ts
│       ├── health-check.ts
│       ├── task.ts
│       └── index.ts
├── server/
│   ├── db/
│   │   ├── index.ts
│   │   └── live.ts
│   ├── modules/
│   │   ├── health-check/
│   │   │   └── handlers.ts
│   │   └── task/
│   │       ├── service.ts
│   │       └── handlers.ts
│   ├── handler.ts
│   └── index.ts
└── src/
    ├── lib/
    │   └── api-client.ts
    └── routes/
        └── api/
            └── $.ts
```

`@shared/*`をTypeScript path aliasへ追加する。

`src`は`server`をruntime importせず、`shared/api`だけを参照する。

## API contract

`AppApi`はHealth Check groupとTask groupを持ち、API全体へ`/api` prefixを付ける。

### Health Check

| Method | Path | Success |
| --- | --- | --- |
| GET | `/api/health-check` | `200 { "message": "ok" }` |

### Task

| Method | Path | Input | Success |
| --- | --- | --- | --- |
| GET | `/api/tasks` | query `page`, `perPage` | `200 { data, meta }` |
| GET | `/api/tasks/:id` | path `id` | `200 { data }` |
| POST | `/api/tasks` | JSON `{ title, done? }` | `201 { data }` |
| PUT | `/api/tasks/:id` | JSON `{ title?, done? }` | `200 { data }` |
| DELETE | `/api/tasks/:id` | path `id` | `200 { success: true }` |

`page`は1以上の整数とし、未指定時は1を使う。

`perPage`は1以上50以下の整数とし、未指定時は10を使う。

Taskの`createdAt`と`updatedAt`はwire上でISO 8601 stringとして表現し、serverとbrowserのEffect内部では`Date`として扱う。

Create payloadでは`title`を必須とし、`done`を省略可能にする。

Update payloadでは`title`と`done`を省略可能にする。

## Error contract

外部へ返すerrorはEffect固有のtagを含めず、既存のJSON envelopeを維持する。

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Validation Error",
  "detail": []
}
```

```json
{
  "code": "NOT_FOUND",
  "message": "Task with id example not found"
}
```

```json
{
  "code": "INTERNAL_ERROR",
  "message": "Internal Server Error"
}
```

`HttpApiDecodeError`はAPI middlewareで`VALIDATION_ERROR`へ変換する。

decode issueは`detail`配列へ格納し、少なくともfield pathとmessageを保持する。

存在しないTaskは`NOT_FOUND`としてfailure channelへ返す。

DB操作のrejectionは`Effect.tryPromise`で捕捉し、`INTERNAL_ERROR`へ変換する。

内部例外、SQL、parameter、secretはresponseへ含めない。

内部原因はEffect loggerへ記録する。

未定義のAPI endpointは`NOT_FOUND` envelopeへ正規化する。

## Layer構成

`Database`を`Context.Tag`として定義する。

`DatabaseLive`はCloudflare Workersのenvironment bindingからlibSQL clientとDrizzle instanceを生成する。

`TaskService`を`Context.Tag`として定義する。

Task serviceの各operationはPromiseではなく`Effect`を返す。

`TaskServiceLive`は`Database`へ依存する。

Task handlerは`TaskService`へ依存し、DB implementationを参照しない。

production layerは次の順で依存を解決する。

```text
DatabaseLive
  → TaskServiceLive
  → HealthCheckHandlersLive + TaskHandlersLive
  → AppApiLive
  → Web handler
```

testは`TaskService`のtest Layerを提供し、Tursoへ接続せずHTTP behaviorを検証できるようにする。

## Web handler

`HttpApiBuilder.api`とgroup handler Layerを合成し、`HttpApiBuilder.toWebHandler`から標準Web handlerを生成する。

EffectのHTTP logger middlewareを全requestへ適用する。

TanStack Startのcatch-all server routeは、GET、POST、PUT、PATCH、DELETEを同じWeb handlerへ委譲する。

framework境界がPromiseを要求するため、route handlerの戻り値は`Promise<Response>`のままにする。

Effect programの内部ではtyped errorとLayerを維持する。

## Browser client

`HttpApiClient.make`は`AppApi`からbrowser clientを生成する。

clientには`FetchHttpClient.layer`を提供する。

ReactとTanStack Routerのevent handlerまたはloaderは、clientが返すEffectを`Effect.runPromise`で実行する。

Honoの`InferResponseType`と`parseResponse`は使用しない。

Task componentの型はEffect clientまたはshared Schemaから導出する。

client failureはEffectのtyped errorとして処理し、既存のtoast文言と画面遷移を維持する。

## Dependency変更

次のdependencyを追加する。

- `effect`
- `@effect/platform`

次のdependencyを削除する。

- `hono`
- `@hono/zod-validator`
- `drizzle-zod`

frontend form validationがZodを使用しているため、`zod`は残す。

`@libsql/client`は`0.15.15`のpinを維持する。

## Module generator

scaffdog templateはEffect moduleを生成するように書き換える。

CRUD moduleはshared contract、service TagとLive Layer、handler Layerを生成する。

生成物はHono、Zod、`drizzle-zod`をimportしない。

module登録手順は`AppApi`へのgroup追加とproduction Layerへのhandler追加を案内する。

## Test方針

実装はRED、GREEN、REFACTORの順で進める。

production codeを追加する前に、そのbehaviorを示す失敗testを追加する。

### Contract test

- query stringをnumberへdecodeする
- query未指定時にdefault値を使う
- 範囲外のpaginationをrejectする
- CreateとUpdate payloadをvalidationする
- DateをISO stringへencodeし、Dateへdecodeする
- successとerror envelopeをvalidationする

### HTTP integration test

- Health Checkのpath、status、body
- Task CRUDのpath、status、body
- Createの201
- validation failureの400
- Task not foundの404
- DB failureの500
- 未定義endpointの404

### Layer test

- test `TaskService` LayerでHTTP handlerを構築できる
- production Layerの依存が型検査で解決する
- DB rejectionをtyped internal errorへ変換する

### Browser client test

- `AppApi`から生成したclientでTask endpointを呼べる
- responseをshared Schemaでdecodeする
- non-2xx responseをtyped failureとして扱う

## Documentation変更

ShadowのREADMEとAGENTS.mdからHono固有の構成、command、module rule、client説明を削除する。

READMEとAGENTS.mdにはEffect contract、Layer構成、module追加手順、browser client、test方法を記載する。

rootのAGENTS.mdにあるstack比較とshared patternもEffectへ更新する。

## 実装順序

1. 依存関係とpath aliasを更新する。
2. shared API contractの失敗testを追加する。
3. shared API contractを実装する。
4. test Layerを使うHTTP integration testを追加する。
5. Database service、Task service、handler Layer、Web handlerを実装する。
6. TanStack Start bridgeをWeb handlerへ切り替える。
7. browser client testを追加する。
8. browser clientとTask UIをEffect clientへ切り替える。
9. scaffdog templateと文書を更新する。
10. Hono関連fileとdependencyを削除する。
11. formatter、typecheck、lint、test、buildを実行する。
12. Hono参照と禁止importが0件であることを確認する。

## 完了条件

- `rg`でHono packageとHono APIの参照が0件である
- backendのrequest、response、errorがEffect Schemaで定義されている
- server operationがEffectを返す
- DatabaseとTask serviceがLayerで提供される
- browserが`HttpApiClient`を使用する
- 既存APIのpath、status、JSON envelopeが維持される
- 既存Task画面のload、create、toggle、deleteが動作する
- scaffdogがEffect moduleを生成する
- READMEとAGENTS.mdが移行後の構成を説明する
- `bun run test`が成功する
- `bun run lint`が成功する
- `bun run build`が成功する
