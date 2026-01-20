# GitHub Actions Setup

This document explains how to configure the required secrets for the automated release workflow.

## Required Secrets

The release workflow requires the following secret:

### NPM_TOKEN

An npm access token with publish permissions for `@clix-so/clix-cli`.

**How to create:**
1. Go to [npmjs.com](https://www.npmjs.com/) and log in
2. Click your profile icon > Access Tokens
3. Generate New Token > Classic Token
4. Select "Automation" type
5. Copy the token

**How to add to GitHub:**
1. Go to your repository Settings > Secrets and variables > Actions
2. Click "New repository secret"
3. Name: `NPM_TOKEN`
4. Value: paste your npm token
5. Click "Add secret"

## Homebrew Formula Update

The Homebrew formula in `clix-so/homebrew-clix-cli` is automatically updated using `GITHUB_TOKEN`. Since both repositories are in the same organization, no additional token configuration is needed.

**Note:** Ensure the repository settings allow GitHub Actions to have write access to other repositories in the organization, or configure a GitHub App for cross-repo access if needed.

## Verification

After setting up the secrets, you can verify the workflow by:

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
- Verify `NPM_TOKEN` is correct and has publish permissions
- Ensure you're logged into the npm organization

### Homebrew formula update fails
- Verify `GITHUB_TOKEN` has write access to `homebrew-clix-cli` repository
- Check organization settings for cross-repo Actions permissions

### Tag already exists
- The workflow skips if the version tag already exists
- Update to a new version to trigger a release
