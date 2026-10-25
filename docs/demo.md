# Release checklist

Everything that has to happen before **v2.0** ships. Run `make check` first; it catches most problems.

| Step | Owner | Status | Notes |
|------|-------|:------:|-------|
| Update the changelog | Ana | done | Group entries by area, newest first |
| Bump versions | Kai | done | `package.json` and the Homebrew formula |
| Run the full test suite | CI | running | Includes the slow integration tests, so expect about ten minutes |
| Publish the release notes | Ana | todo | Link the migration guide from the first paragraph |

## Before tagging

1. Merge the open pull requests
   - [x] Fix the config loader on Windows
   - [ ] Add the `--json` output flag
2. Tag the release and push it

```ts
export async function release(version: string): Promise<void> {
  const notes = await changelog.since(lastTag);
  await git.tag(`v${version}`, { message: notes }); // signed
}
```

> Don't tag on a Friday afternoon.
