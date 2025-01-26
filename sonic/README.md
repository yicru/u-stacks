# Sonic Stack

## Getting Started

```shell
npx degit yicru/u-stacks/sonic my-app
fly launch
fly postgres create
# If you want to use github actions, you need to set a secret named `FLY_API_TOKEN`
fly tokens create deploy -x 999999h
```
