# GitHub Repository Management

> Absorbed from `github-repo-management`. Clone, create, fork, configure repos; manage releases, secrets, actions.

## 1. Cloning

```bash
git clone https://github.com/owner/repo.git
git clone --depth 1 https://github.com/owner/repo.git  # Shallow
gh repo clone owner/repo
```

## 2. Creating Repositories

```bash
gh repo create my-project --public --clone
gh repo create my-project --private --source . --push  # From existing dir
gh repo create my-org/repo --public --clone

# With curl
curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/user/repos \
  -d '{"name": "my-project", "private": false}'
```

## 3. Forking

```bash
gh repo fork owner/repo --clone

# With curl + git
curl -s -X POST -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/owner/repo/forks
git clone https://github.com/$GH_USER/repo.git
cd repo && git remote add upstream https://github.com/owner/repo.git

# Sync fork
git fetch upstream && git checkout main && git merge upstream/main && git push origin main
gh repo sync $GH_USER/repo  # Shortcut
```

## 4. Repository Settings

```bash
gh repo edit --description "Updated" --visibility public
gh repo edit --enable-wiki=false --enable-issues=true
gh repo edit --default-branch main
```

## 5. Releases

```bash
gh release create v1.0.0 --title "v1.0.0" --generate-notes
gh release create v1.0.0 ./dist/binary --title "v1.0.0"
gh release list
gh release download v1.0.0 --dir ./downloads
```

## 6. Secrets & CI

```bash
gh secret set API_KEY --body "value"
gh secret list
gh secret delete API_KEY

gh workflow list
gh run list --limit 10
gh run view <RUN_ID> --log-failed
gh run rerun <RUN_ID> --failed
gh workflow run ci.yml --ref main
```

## 7. Branch Protection

```bash
curl -s -X PUT -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/$OWNER/$REPO/branches/main/protection \
  -d '{"required_status_checks": {"strict": true, "contexts": ["ci/test"]}, "required_pull_request_reviews": {"required_approving_review_count": 1}}'
```

## 8. Gists

```bash
gh gist create script.py --public --desc "Useful script"
gh gist list
```
