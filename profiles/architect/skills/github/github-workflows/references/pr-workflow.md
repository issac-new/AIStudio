# GitHub PR Workflow

> Absorbed from `github-pr-workflow`. Complete PR lifecycle: branch → commit → open → CI → merge.

## 1. Branch and Commit

```bash
git checkout main && git pull origin main
git checkout -b feat/description
# Make changes, then:
git add <files>
git commit -m "feat: short description\n\nLonger explanation.\n\nCloses #42"
```

Conventional commit types: `feat`, `fix`, `refactor`, `docs`, `test`, `ci`, `chore`, `perf`

## 2. Push and Create PR

```bash
git push -u origin HEAD

# With gh
gh pr create --title "feat: ..." --body "## Summary\n..." --label "enhancement"

# With curl
BRANCH=$(git branch --show-current)
curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls \
  -d "{\"title\": \"feat: ...\", \"body\": \"## Summary\", \"head\": \"$BRANCH\", \"base\": \"main\"}"
```

Options: `--draft`, `--reviewer user1`, `--label "enhancement"`

## 3. CI Status

```bash
gh pr checks --watch
gh run list --branch $(git branch --show-current) --limit 5
gh run view <RUN_ID> --log-failed
```

## 4. Auto-Fix CI Failures Loop

1. Check CI → identify failures
2. Read logs → understand error
3. Fix code → `git add && git commit -m "fix: ..." && git push`
4. Re-check status
5. Repeat up to 3 attempts

## 5. Merging

```bash
gh pr merge --squash --delete-branch

# Enable auto-merge
gh pr merge --auto --squash --delete-branch

# With curl
curl -s -X PUT -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/$PR/merge \
  -d "{\"merge_method\": \"squash\", \"commit_title\": \"feat: desc (#$PR)\"}"
```

Merge methods: `"merge"`, `"squash"`, `"rebase"`

## Complete Workflow Example

```bash
git checkout main && git pull origin main
git checkout -b fix/login-redirect-bug
# [make code changes]
git add src/auth/login.py tests/test_login.py
git commit -m "fix: correct redirect URL after login\n\nPreserves ?next= parameter."
git push -u origin HEAD
gh pr create --title "fix: correct login redirect" --body "Fixes #42"
gh pr checks --watch
gh pr merge --squash --delete-branch
```
