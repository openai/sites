# Changesets

Add a changeset to any pull request that changes a published package:

```bash
pnpm changeset
```

Use `pnpm changeset add --empty` when a package changes without requiring a
release. The release workflow combines pending changesets into a reviewed
version pull request.
