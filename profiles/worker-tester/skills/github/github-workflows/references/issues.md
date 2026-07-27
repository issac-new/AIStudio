# GitHub Issues Management

> Absorbed from `github-issues`. Create, search, triage, and manage issues.

## Viewing Issues

```bash
gh issue list
gh issue list --state open --label "bug"
gh issue view 42

# With curl
curl -s -H "Authorization: token $GITHUB_TOKEN" \
  "https://api.github.com/repos/$OWNER/$REPO/issues?state=open&per_page=20" | \
  python3 -c "import sys,json; [print(f'#{i[\"number\"]:5}  {i[\"state\"]:6}  {i[\"title\"]}') for i in json.load(sys.stdin) if 'pull_request' not in i]"
```

## Creating Issues

```bash
gh issue create --title "Bug title" \
  --body "## Description\nSteps to reproduce..." \
  --label "bug,backend" --assignee "username"
```

**Bug template:**
```
## Bug Description
## Steps to Reproduce
1. ...
## Expected/Actual Behavior
## Environment
```

**Feature template:**
```
## Feature Description
## Motivation
## Proposed Solution
## Alternatives Considered
```

## Managing Issues

| Action | gh | curl endpoint |
|--------|-----|-------------|
| Add labels | `gh issue edit N --add-label "bug"` | `POST /repos/{o}/{r}/issues/N/labels` |
| Assign | `gh issue edit N --add-assignee @me` | `POST /repos/{o}/{r}/issues/N/assignees` |
| Comment | `gh issue comment N --body "..."` | `POST /repos/{o}/{r}/issues/N/comments` |
| Close | `gh issue close N` | `PATCH /repos/{o}/{r}/issues/N` `{\"state\": \"closed\"}` |
| Reopen | `gh issue reopen N` | `PATCH /repos/{o}/{r}/issues/N` `{\"state\": \"open\"}` |
| Search | `gh issue list --search "keyword"` | `GET /search/issues?q=...` |

## Linking Issues to PRs

Add to PR body: `Closes #42`, `Fixes #42`, or `Resolves #42`.

## Triage Workflow

1. List issues with `needs-triage` label
2. Read and categorize each
3. Apply priority labels and assign if clear
4. Comment with triage notes

## Bulk Operations

```bash
gh issue list --label "wontfix" --json number --jq '.[].number' | \
  xargs -I {} gh issue close {} --reason "not planned"
```
