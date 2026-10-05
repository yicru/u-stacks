---
name: effect-ts
description: Implement or review Effect TypeScript code, and set up or upgrade Effect v4 in this Bun project using the installed version's documentation.
license: MIT
---

# Effect in Shadow

Run commands from the application directory containing `package.json`: `shadow/` in this collection, or the project root after a standalone `degit` checkout. Read the application's `AGENTS.md` for its shared contract, service, client, and testing conventions.

## Choose APIs from the installed version

Before writing Effect code, read `node_modules/effect/AGENTS.md` completely and follow its links when required. If dependencies are missing, install the existing lockfile with `bun install --frozen-lockfile` first.

Read `node_modules/effect/package.json` for the installed version and exports. For APIs not covered by the guide, search `node_modules/effect/src` and inspect their types. Use documentation matching that version; individual modules may retain unstable annotations even in a stable package release.

For upstream examples or tests beyond the installed package, use `.repos/effect` when available. It lives at the Git worktree root, which can differ from the application directory. Check that its tag is `effect@<installed-version>` before treating it as documentation for this application.

## Set up or upgrade when requested

Use Bun and stable Effect v4 releases. Change dependencies only when the task requests setup or an upgrade; ordinary implementation and review use the existing installed version.

For an upgrade, check the registry and official release notes between the installed and target versions. A stable v4 installation uses:

```bash
bun add effect@4
```

Keep `package.json` and `bun.lock` aligned, and inspect the target package's exports when updating imports. When a Git checkout uses the upstream source mirror, refresh it with the existing helper:

```bash
node scripts/prepare-effect.mjs
```

The helper selects the tag matching the installed dependency and preserves local source changes. For a standalone template without a Git repository or source mirror, the installed package remains the documentation source.

Validate changes using the relevant scripts in `package.json`. Effect HTTP or Schema upgrades need contract and client coverage alongside affected service tests, typechecking, and the application build; inspect generated OpenAPI output if schema behavior changes.

## Origin

Adapted from the official [Effect skill](https://github.com/Effect-TS/skills/blob/2309e6f27d9955b434c0e3f394b945c136e89fd2/skills/effect-ts/SKILL.md) for this template's Bun and stable v4 workflow. The upstream license is included in [LICENSE](LICENSE).
