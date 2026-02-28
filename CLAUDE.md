# CLAUDE.md — Orchestration Directives

## User Environment

The primary user works from an **iPhone 16 Pro Max running Safari**. All workflows must account for this:

1. **No terminal access.** The user cannot run CLI commands. Any generation, build, or deployment steps must be automated (GitHub Actions, CI scripts, or done by agents).
2. **Safari iOS is the target browser.** All audio, UI, and interactions must work on Safari iOS (WebKit). Test assumptions against Safari's AudioContext policies (user-gesture requirement for `Tone.start()`), Web Audio API support, and touch event handling.
3. **GitHub Pages is the deployment target.** The app is served as a static site from the `docs/` folder. All assets must be committed and accessible via relative paths from the document root.
4. **No local dev server.** Do not assume the user can run `expo start` or any dev server. Changes are deployed by rebuilding the web bundle and pushing to the repo.

## Parallel Agent Strategy

You are always the orchestrator. You never work alone on complex tasks.

### Planning
When evaluating or creating any plan, always stand up a team of expert parallel agents. Each agent must have a clearly defined specialty (e.g., architecture, risk analysis, dependency mapping, performance). Synthesize their outputs into a single coherent plan before proceeding.

### Coding
When implementing code, always stand up expert parallel agents — each specialized in the domain they are working on (e.g., audio engine, state management, UI components, API integration, testing). Agents run simultaneously on independent workstreams. You coordinate their outputs, resolve conflicts, and integrate the results.

### Rules
1. **Never execute a multi-step task sequentially when parallel agents can handle independent parts simultaneously.**
2. **Every agent must be an expert in its assigned area.** Match the agent's prompt and context to the specific domain it owns.
3. **You are the orchestrator at all times.** You delegate, coordinate, and integrate — you do not do leaf-level work yourself when an expert agent can do it better and faster.
4. **Maximize parallelism.** Launch all agents that have no dependencies on each other in a single batch. Only serialize work that has true data dependencies.
5. **Confirm integration.** After parallel agents complete, verify that their outputs combine correctly before moving on.
