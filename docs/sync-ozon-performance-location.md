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
