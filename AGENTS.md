# Agent Guidelines & Local Development Workflows

Welcome to the Linkpoint repository. Linkpoint is a Second Life communicator and viewer utility suite featuring a Web/TypeScript web application, Expo React Native support, and a native Android (Kotlin) app.

This document serves as the root guide for local development workflows, code standards, and CI job mappings.

---

## Prerequisites & Environment Setup

- **Node.js**: Version 22.x or higher is required.
- **Package Manager**: Bun (`bun@1.4.2`) is the pinned package manager (`bun.lock`).
- **Environment File**: Local test and build checks require `.env.local` (copied from `.env.example`). Secrets are not required for local validation checks.
- **Bootstrap Script**: Run `./scripts/codex-setup.sh` to install locked dependencies and set up `.env.local`.

---

## Local Development & CI Workflow Mapping

Local verification commands correspond directly to jobs defined in `.github/workflows/ci.yml`:

### 1. Web & TypeScript Validation (`web` job)

The web suite validates TypeScript types, code style, formatting, fake data compliance, unit tests, and production build output.

| Local Command             | Direct Tool Executable                                | Description                             |
| ------------------------- | ----------------------------------------------------- | --------------------------------------- |
| `npm run typecheck`       | `tsc --noEmit`                                        | TypeScript static type checking         |
| `npm run lint`            | `eslint .`                                            | ESLint linting rules                    |
| `npm run format:check`    | `prettier --check .`                                  | Prettier code formatting check          |
| `npm run check:fake-data` | `node scripts/check-fake-data.mjs`                    | Verifies no fabricated mock data exists |
| `npm run test`            | `vitest run`                                          | Unit and component tests                |
| `npm run build`           | `vite build` (+ WASM & imports checks)                | Production build bundle                 |
| **Combined Check**        | `npm run check` or `./scripts/codex-setup.sh --check` | Runs all web CI validation steps        |

### 2. Expo Android Debug APK (`expo-apk` job)

- **Build Command**: `npm run android:build -- --no-daemon`
- **Prerequisites**: Java 21 and Android SDK (platform 35, build-tools 35.0.0).

### 3. Native Kotlin Core & App (`kotlin` job)

- **Subproject Directory**: `android-kotlin/`
- **Unit Tests**: `cd android-kotlin && ./gradlew test --no-daemon`
- **Assemble Debug APK**: `cd android-kotlin && ./gradlew :app:assembleDebug --no-daemon`
- **Subproject Guide**: See [`android-kotlin/AGENTS.md`](./android-kotlin/AGENTS.md) for Kotlin guidelines, live OpenSim test execution, and Android SDK environment notes.

---

## Workspace Conventions & Rules

- **Fake Data Policy**: Unknown or unavailable values must be displayed as `"—"`. Do not invent or introduce mock data in production or shared modules (`FAKE_DATA_POLICY`).
- **Code Quality**: Ensure changes are formatted with `npm run format` (`prettier --write .`) and linted with `npm run lint`.
- **Pre-Commit Verification**: Run `npm run check` or `./scripts/codex-setup.sh --check` before submitting pull requests.
