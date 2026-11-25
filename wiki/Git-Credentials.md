# Git Credentials

## Overview

To deploy Node.js applications from **private GitHub repositories**, you need to configure a GitHub token. This is done entirely from the panel UI — no terminal required.

## Setting Up (Step by Step)

### Step 1: Open Git Credentials

Go to **Settings** → scroll to **Git Credentials (Private Repos)** section.

You'll see a guide with 6 steps:

### Step 2: Create a GitHub Token

1. Click the link in the guide (or go to [GitHub Settings → Fine-grained tokens](https://github.com/settings/tokens?type=beta))
2. Click **Generate new token**
3. Give it a name (e.g. "NimbusPanel")
4. Set expiration (90 days, 1 year, or custom)

### Step 3: Configure Repository Access

Under **Repository access**:
- Select **Only select repositories**
- Click **Select repositories** → search and pick your private repos
- Only selected repos will be accessible by this token

### Step 4: Set Permissions

Under **Permissions**:
- Find **Contents** (under Repository permissions)
- Set to **Read-only** — this is the only permission needed

### Step 5: Generate and Copy

1. Click **Generate token**
2. Copy the token (starts with `github_pat_`)
3. **You won't see it again** — store it securely

### Step 6: Paste in Panel

1. Go back to NimbusPanel → Settings → Git Credentials
2. Paste the token in the input field
3. Click **Save Token**

The panel will:
- Validate the token format
- Test it against the GitHub API
- Save it encrypted on the server
- Show a green "configured" badge

## Managing Your Token

### Test Token
Click **Test token** — verifies the token is still valid with GitHub.

### Update Token
Paste a new token in the "Replace with new token" field → click **Update**.

### Remove Token
Click **Remove** → confirm. Private repos will no longer be accessible.

## How It Works

When you deploy from a private repo:

```
1. Panel detects: https://github.com/user/private-repo.git
2. Token is injected automatically:
   https://x-access-token:github_pat_xxx@github.com/user/private-repo.git
3. Git clone succeeds with private access
4. Token is never displayed or logged
```

For **public repos**, the token is not used — cloning works without it.

## Security

| Aspect | Detail |
|---|---|
| Storage | `/opt/panel/etc/git_token` (root:panel, mode 0640) |
| Encryption | File-level permissions (only root + panel user can read) |
| Scope | Limited to repos you selected in GitHub |
| Permissions | Read-only (Contents) — cannot push or delete |
| Audit | All token operations logged in audit trail |

## Supported Token Types

| Type | Format | Notes |
|---|---|---|
| Fine-grained PAT | `github_pat_...` | **Recommended** — scoped per-repo, read-only |
| Classic PAT | `ghp_...` | Works, but has broader scope |
| OAuth | `gho_...` | From GitHub Apps |
| Server-to-server | `ghs_...` | From GitHub App installations |

## Troubleshooting

### "Token saved but could not verify"
The token was saved but the server couldn't reach `api.github.com`. This may be a network issue. The token will still be used during deploy.

### "git clone failed" on private repo
1. Check **Settings → Git Credentials** → Test token
2. Verify the token has access to the specific repository
3. Check token expiration in GitHub

### Deploy works for public but not private
The token may not have access to that specific repo. In GitHub:
- Go to your token's settings
- Check **Repository access** → ensure the repo is selected
