# Releasing npm packages

Published packages in this repository use Changesets for versioning and npm
Trusted Publishing for releases. No npm token is stored in GitHub.

## Prepare a release

Add a changeset to any pull request that changes a published package:

```bash
pnpm changeset
```

After the pull request merges, the Release PR workflow creates or updates a
`chore: version packages` pull request. Review and merge that pull request once
its Linux and Windows checks pass.

## Publish

Run the `Publish packages` workflow from `main`. A different member of the
Codex Cloud Apps team must approve the `npm-publish` environment before GitHub
can request an npm OIDC credential, run the repository checks, and publish.

Rerunning a failed multi-package release is safe: Changesets skips versions
that already exist and publishes the remainder.

## Bootstrap a package

npm requires a package to exist before it can have a trusted publisher. For a
new package, merge its code and the publishing workflow first, then publish its
initial version once from a clean `main` checkout with an npm account protected
by 2FA:

```bash
pnpm check
cd packages/sites-vite-plugin
npm pack --dry-run
npm publish --access public --registry=https://registry.npmjs.org
```

Configure all later versions to use the workflow:

```bash
npm install --global npm@11.16.0
PACKAGE_NAME=@openai/sites-vite-plugin
npm trust github "$PACKAGE_NAME" \
  --repo openai/sites \
  --file publish.yml \
  --env npm-publish \
  --allow-publish
npm trust list "$PACKAGE_NAME"
```

In the package's npm settings, require 2FA and disallow traditional automation
tokens. Every publishable package must live under `packages/*`, must not set
`private: true`, and must declare public npm and `openai/sites` repository
metadata. The release workflows require no package-specific changes.
