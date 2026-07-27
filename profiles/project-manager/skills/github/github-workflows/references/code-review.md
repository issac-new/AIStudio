# GitHub Code Review

> Absorbed from `github-code-review`. Review local changes or GitHub PRs.

## 1. Reviewing Local Changes

```bash
git diff main...HEAD --stat     # Big picture
git diff main...HEAD            # Full diff
git diff main...HEAD -- src/auth/login.py  # Per file
```

Common git-grep checks:
```bash
git diff main...HEAD | grep -n "print(\\|console\\.log\\|TODO\\|debugger"
git diff main...HEAD --stat | sort -t'|' -k2 -rn | head -10
git diff main...HEAD | grep -in "password\\|secret\\|api_key\\|private_key"
git diff main...HEAD | grep -n "<<<<<<\\|>>>>>>\\|======="
```

## 2. Reviewing a Pull Request

```bash
# With gh
gh pr view 123
gh pr diff 123
gh pr diff 123 --name-only
gh pr checkout 123

# With git (no gh needed)
git fetch origin pull/123/head:pr-123 && git checkout pr-123
git diff main...pr-123

# With curl
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/pulls/123/files | \
  python3 -c "import sys,json; [print(f\\\"{f['status']:10} +{f['additions']:-4} -{f['deletions']:-4}  {f['filename']}\\\") for f in json.load(sys.stdin)]"
```

## 3. Leaving Comments & Reviews

**General comment:**
```bash
gh pr comment 123 --body "Overall looks good."
```

**Inline comment:**
```bash
HEAD_SHA=$(gh pr view 123 --json headRefOid --jq '.headRefOid')
gh api repos/$OWNER/$REPO/pulls/123/comments --method POST \
  -f body="Suggestion: use list comprehension." \
  -f path="src/auth/login.py" -f commit_id="$HEAD_SHA" -f line=45 -f side="RIGHT"
```

**Formal review:**
```bash
gh pr review 123 --approve --body "LGTM!"
gh pr review 123 --request-changes --body "See inline comments."
```

## 4. Review Output Format

```
## Code Review Summary

### Critical
- **file.py:45** — SQL injection: raw SQL concat. Use parameterized queries.

### Warnings
- **file.py:23** — Password stored in plaintext.

### Suggestions
- **file.py:8** — Duplicates logic in core/utils.py:34.

### Looks Good
- Clean separation of concerns in the middleware layer
```
