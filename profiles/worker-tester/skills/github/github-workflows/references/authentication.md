# GitHub Authentication

> Absorbed from `github-auth`. Two methods for authenticating with GitHub.

## Method 1: Git-Only (HTTPS with PAT)

```bash
git config --global credential.helper store
# First operation will prompt: username = your GitHub username, password = PAT
git ls-remote https://github.com/<user>/<repo>.git
# Credentials cached in ~/.git-credentials

# Alternative: cache in memory for 8 hours
git config --global credential.helper 'cache --timeout=28800'

# Embed token in remote URL (per-repo)
git remote set-url origin https://<user>:<token>@github.com/<owner>/<repo>.git

git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

## Method 2: SSH

```bash
ssh-keygen -t ed25519 -C "your@email.com" -f ~/.ssh/id_ed25519 -N ""
cat ~/.ssh/id_ed25519.pub  # Add to https://github.com/settings/keys
ssh -T git@github.com
git config --global url."git@github.com:".insteadOf "https://github.com/"
```

## Method 3: gh CLI

```bash
gh auth login  # Interactive browser or token-based
gh auth setup-git
gh auth status
```

## Helper: Extract Token from Git Credentials

```bash
# From git credential store
grep "github.com" ~/.git-credentials | head -1 | sed 's|https://[^:]*:\\([^@]*\\)@.*|\\1|'
# From .env
grep "^GITHUB_TOKEN=*** "$HERMES_HOME/.env" | head -1 | cut -d= -f2 | tr -d '\\n\\r'
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `git push` asks for password | GitHub disabled password auth. Use PAT or SSH |
| `Permission to X denied` | Token may lack `repo` scope |
| `Authentication failed` | Stale cache — `git credential reject` then re-auth |
| `ssh: connect to host github.com port 22: Connection refused` | Use SSH over HTTPS via `~/.ssh/config` with `Hostname ssh.github.com` + `Port 443` |
