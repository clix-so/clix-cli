# GitHub Actions Setup

This document explains how to configure the automated release workflow.

## npm Trusted Publishing

The release workflow publishes `@clix-so/clix-cli` to npm through OpenID Connect
(OIDC). No `NPM_TOKEN` GitHub Actions secret is required.

Configure the package on npm with a Trusted Publisher:

1. Go to the `@clix-so/clix-cli` package settings on [npmjs.com](https://www.npmjs.com/)
2. Open **Trusted Publisher**
3. Select **GitHub Actions**
4. Set the organization or user to `clix-so`
5. Set the repository to `clix-cli`
6. Set the workflow filename to `release.yml`
7. Allow `npm publish`

The workflow must keep `id-token: write` permissions and use npm `11.5.1` or
newer. Trusted Publishing automatically generates npm provenance for public
packages published from public GitHub repositories.

## Homebrew Formula Update

The Homebrew formula in `clix-so/homebrew-clix-cli` is automatically updated using `GITHUB_TOKEN`. Since both repositories are in the same organization, no additional token configuration is needed.

**Note:** Ensure the repository settings allow GitHub Actions to have write access to other repositories in the organization, or configure a GitHub App for cross-repo access if needed.

## Verification

After setting up Trusted Publishing, you can verify the workflow by:

1. Update the version in `package.json`:
   ```bash
   npm version patch
   ```

2. Commit and push:
   ```bash
   git add package.json package-lock.json
   git commit -m "chore: bump version"
   git push origin main
   ```

3. Check the Actions tab to see the workflow run.

## Troubleshooting

### npm publish fails
- Verify the npm Trusted Publisher points to `clix-so/clix-cli` and `release.yml`
- Verify the workflow has `id-token: write` permission
- Verify the publish job uses npm `11.5.1` or newer
- If npm returns `ENEEDAUTH` or `E404`, check the Trusted Publisher fields exactly

### Homebrew formula update fails
- Verify `GITHUB_TOKEN` has write access to `homebrew-clix-cli` repository
- Check organization settings for cross-repo Actions permissions

### Tag already exists
- The workflow skips if the version tag already exists
- Update to a new version to trigger a release
