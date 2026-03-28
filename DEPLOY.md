# Deploying SWNTD

This document describes the current staging and production deployment setup for SWNTD on exe.dev.

## Environments

### Production

- GitHub Actions environment: `production`
- exe.dev VM: `swntd`
- Default URL:
  - `https://swntd.exe.xyz`

### Staging

- GitHub Actions environment: `staging`
- exe.dev VM: `swntd-staging`
- Default URL:
  - `https://swntd-staging.exe.xyz`

## Runtime Shape

- `caddy` listens on port `8000` inside the VM.
- The public site serves the built SPA from `apps/web/dist`.
- `/api/*` and `/healthz` are reverse-proxied to the Node API on `127.0.0.1:3001`.
- The SPA is public and shows an in-app login screen that redirects to exe.dev auth.
- The API runs with `SWNTD_AUTH_MODE=trusted_header` and trusts `X-ExeDev-Email`.
- First-run ownership claim is only available while the household still contains placeholder bootstrap admins, and only for emails listed in `SWNTD_BOOTSTRAP_OWNER_EMAILS`.
- SQLite and uploaded files live on the VM disk under the deploy path's `shared/` directory.

## VM Paths

- Production deploy path: `/home/exedev/swntd`
- Staging deploy path: `/home/exedev/swntd-staging`
- Shared environment file on each VM: `/etc/swntd/swntd.env`

## Required GitHub Environment Secrets

Both `production` and `staging` environments use the same secret names:

- `EXE_SSH_DEST`
- `EXE_DEPLOY_PRIVATE_KEY`
- `EXE_KNOWN_HOSTS`
- `EXE_DEPLOY_PATH`

Use values that match each VM.

## Bootstrapping a VM

From a local checkout, run the bootstrap script over SSH with environment-specific values. Example staging bootstrap:

```bash
ssh swntd-staging.exe.xyz \
  "mkdir -p /home/exedev/swntd-staging-bootstrap"
rsync -az --delete ./ swntd-staging.exe.xyz:/home/exedev/swntd-staging-bootstrap/repo/
ssh swntd-staging.exe.xyz \
  "cd /home/exedev/swntd-staging-bootstrap/repo && \
   SWNTD_DEPLOY_PATH=/home/exedev/swntd-staging \
   SWNTD_BOOTSTRAP_ADMIN_EMAILS=owner@bootstrap.invalid \
   SWNTD_BOOTSTRAP_OWNER_EMAILS=you@example.com \
   ./scripts/deploy/bootstrap-vm.sh"
```

Production follows the same pattern with `/home/exedev/swntd`, `swntd.exe.xyz`, and the production environment values.

Recommended bootstrap pattern:

- `SWNTD_BOOTSTRAP_ADMIN_EMAILS` should use placeholder `.invalid` addresses.
- `SWNTD_BOOTSTRAP_OWNER_EMAILS` should list the real emails allowed to claim the household the first time.
- After claim, add any long-term admins in Settings and remove the placeholder bootstrap admin.

The bootstrap script:

1. Installs Node.js 24, `caddy`, `git`, and `rsync`.
2. Creates the deploy directories.
3. Seeds `/etc/swntd/swntd.env` if it does not already exist.
4. Installs the `caddy` config and `swntd-api` systemd service.

## Production Deploys

Production deploys automatically on push to `main` via:

- [deploy-production.yml](/Users/joshse/repos/swntd/.github/workflows/deploy-production.yml)

The workflow:

1. Checks out the target commit.
2. Packages the repo with `git archive`.
3. Uploads the release tarball to the production VM over SSH.
4. Runs [`deploy-release.sh`](/Users/joshse/repos/swntd/scripts/deploy/deploy-release.sh) on the VM.
5. Verifies `GET /healthz` returns `{ "status": "ok" }`.

## Staging Deploys

Staging deploys run via:

- [deploy-staging.yml](/Users/joshse/repos/swntd/.github/workflows/deploy-staging.yml)

Automatic staging deploys:

- trigger on pull requests for:
  - `opened`
  - `reopened`
  - `synchronize`
  - `ready_for_review`
- only run automatically when the PR author is one of:
  - `archedark-ada`
  - `archedark`
  - `archedark-gavlan[bot]`

Manual staging deploys:

- use `workflow_dispatch`
- provide either:
  - `ref`, or
  - `pr_number`

Examples:

```bash
gh workflow run deploy-staging.yml --ref issue-77-staging-deploy -f ref=issue-77-staging-deploy
```

```bash
gh workflow run deploy-staging.yml -f pr_number=123
```

## Custom Domains

Point your custom domains at the exe.dev VM URLs:

- staging domain `CNAME` -> `swntd-staging.exe.xyz`
- production domain `CNAME` or provider-specific ALIAS/flattened CNAME -> `swntd.exe.xyz`

If you use Cloudflare, set records to `DNS only` instead of proxied mode.

Docs:

- https://exe.dev/docs/cnames.md

## Emergency Redeploy

If GitHub Actions is unavailable, you can redeploy directly over SSH:

```bash
scp ./release.tgz swntd-staging.exe.xyz:/tmp/swntd-manual.tgz
ssh swntd-staging.exe.xyz \
  "DEPLOY_PATH=/home/exedev/swntd-staging RELEASE_ID=manual-$(date +%s) \
   /home/exedev/swntd/current/scripts/deploy/deploy-release.sh /tmp/swntd-manual.tgz"
```
