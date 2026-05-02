# Local Environment Scripts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add generic local environment setup and teardown scripts that Codex can call while preserving explicit sandbox lifecycle actions.

**Architecture:** Two shell scripts own the worktree lifecycle entry points: setup prepares dependencies and `.env.local`, teardown delegates to the sandbox CLI. A `node:test` suite exercises the shell scripts in temporary git repositories with fake `corepack` and `pnpm` commands so behavior is verified without Docker or real installs.

**Tech Stack:** Bash, Git worktrees, pnpm, Node.js `node:test`, existing sandbox CLI scripts.

---

## File Structure

- Create: `scripts/setup-local-environment.sh` - idempotent local setup entry point.
- Create: `scripts/teardown-local-environment.sh` - safe sandbox teardown entry point.
- Create: `scripts/local-environment.test.mjs` - shell-script behavior tests with temporary git repos and stub commands.
- Modify: `docs/superpowers/specs/2026-05-02-local-environment-scripts-design.md` - design record for the workflow.
- Modify: `docs/superpowers/plans/2026-05-02-local-environment-scripts-implementation.md` - task checklist.

## Task 1: Add Local Environment Script Tests

**Files:**

- Create: `scripts/local-environment.test.mjs`

- [x] **Step 1: Write failing setup and teardown tests**

Create `scripts/local-environment.test.mjs` with tests that:

- create a temporary git repository
- create fake `corepack` and `pnpm` commands in a temporary `bin` directory
- run the shell scripts from the temporary repository
- assert `.env.local` copy, preserve, fallback, and teardown behavior

- [x] **Step 2: Run focused script tests and verify they fail**

Run:

```bash
node --test scripts/local-environment.test.mjs
```

Expected: FAIL because `scripts/setup-local-environment.sh` and
`scripts/teardown-local-environment.sh` do not exist yet.

## Task 2: Implement Generic Setup And Teardown Scripts

**Files:**

- Create: `scripts/setup-local-environment.sh`
- Create: `scripts/teardown-local-environment.sh`
- Test: `scripts/local-environment.test.mjs`

- [x] **Step 1: Add `setup-local-environment.sh`**

Create an executable Bash script that:

- enters the git repository root
- runs `corepack enable`
- runs `pnpm install --frozen-lockfile`
- preserves an existing `.env.local`
- copies `.env.local` from `LOCAL_ENV_SOURCE` when set
- otherwise copies from another git worktree when found
- otherwise writes a minimal noop-email `.env.local`

- [x] **Step 2: Add `teardown-local-environment.sh`**

Create an executable Bash script that enters the repository root, runs
`pnpm sandbox:down`, and exits successfully even if sandbox teardown has
nothing to stop.

- [x] **Step 3: Run focused script tests and verify they pass**

Run:

```bash
node --test scripts/local-environment.test.mjs
```

Expected: PASS.

## Task 3: Verify Repository Quality

**Files:**

- All changed files

- [x] **Step 1: Run formatting check**

Run:

```bash
pnpm format
```

Expected: PASS.

- [x] **Step 2: Run lint**

Run:

```bash
pnpm lint
```

Expected: PASS.

- [x] **Step 3: Run type checks**

Run:

```bash
pnpm check-types
```

Expected: PASS.

- [x] **Step 4: Run tests**

Run:

```bash
pnpm test
node --test scripts/local-environment.test.mjs
```

Expected: PASS.

## Task 4: Commit And Create Pull Request

**Files:**

- All changed files

- [x] **Step 1: Review diff**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors and only intended files changed.

- [x] **Step 2: Commit**

Run:

```bash
git add package.json docs/superpowers/specs/2026-05-02-local-environment-scripts-design.md docs/superpowers/plans/2026-05-02-local-environment-scripts-implementation.md scripts/local-environment.test.mjs scripts/setup-local-environment.sh scripts/teardown-local-environment.sh
git commit -m "chore: add local environment lifecycle scripts"
```

- [x] **Step 3: Push and open PR**

Run:

```bash
git push -u origin codex/generic-local-environment-scripts
gh pr create --title "Add local environment lifecycle scripts" --body-file <generated-pr-body>
```

Expected: PR is created and includes setup instructions for Codex local
environments.

## Self-Review

- Spec coverage: the plan covers generic naming, setup, teardown, `.env.local`
  handling, explicit sandbox startup, tests, verification, commit, push, and PR.
- Placeholder scan: no placeholder tasks or open-ended implementation steps.
- Type consistency: all file names and command names match the design.
