# Where to find the updated `sync-ozon-performance` function

The current version of the `sync-ozon-performance` cloud function is checked into this repository at:

```
supabase/functions/sync-ozon-performance/index.ts
```

To view it without diff markers:

1. Make sure you are in the repository root (`/workspace/standalone-spark`).
2. Open the file directly:
   ```bash
   cat supabase/functions/sync-ozon-performance/index.ts
   ```
3. Or open it in an editor (e.g., VS Code) at the same path.

If you need to download just this file, you can use `git show` to print the latest committed version and redirect it to a new file:

```bash
git show HEAD:supabase/functions/sync-ozon-performance/index.ts > sync-ozon-performance.ts
```

That command saves the exact committed contents to `sync-ozon-performance.ts` in your current directory.

## Branch notes

- The current repository only has a local branch named `work` (visible via `git status -sb`).
- If your remote repository does **not** have a `work` branch, you can still inspect the latest committed file from whatever branch you have checked out by using `git show HEAD:supabase/functions/sync-ozon-performance/index.ts`.
- To copy the file onto another branch, check out that branch and re-run the `git show` redirection above to export the file, then commit it on that branch.
