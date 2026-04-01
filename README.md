# task-tracker

Fresh Turborepo workspace shell for building new apps and packages from scratch.

## Structure

- `apps/` for deployable applications
- `packages/` for shared libraries and config packages

## Commands

- `pnpm install` to install dependencies
- `pnpm run build` to run `turbo run build`
- `pnpm run dev` to run `turbo run dev`
- `pnpm run lint` to run `turbo run lint`
- `pnpm run check-types` to run `turbo run check-types`

## Next Steps

Create new workspaces under `apps/` and `packages/`, then add package-level scripts for the Turbo tasks you want to run.
