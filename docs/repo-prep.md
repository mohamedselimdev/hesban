# Repository preparation (private GitHub repository `hesban`)

Status: PUBLISHED as a private repository on 2026-11-01 after owner approval (`mohamedselimdev/hesban`). See DEVLOG for the first CI runs and the branch-protection result.

## History review (2026-11-01, local repository, branch `main`)

| Check | Method | Result |
|---|---|---|
| Commits reviewed | `git rev-list --all` | 7 commits, one branch, no tags, no stashes |
| Secrets in added lines of every commit | `tools/scan-secrets.ts` rules over all 10,716 added lines (lockfiles skipped) | 0 findings |
| Forbidden files in any commit tree (`.db`, `.key`, `.pem`, `.pfx`, `.hbk`, `.env*`) | `isForbiddenFile` over every tree | 0 |
| Working tree | `pnpm scan:secrets` | clean (101 text files) |
| Authorship | `git log --format` | every commit authored and committed by the owner identity only; no co-author trailers |
| Tool/assistant traces in tracked files and commit messages | case-insensitive search for assistant, vendor and tool names, co-author and "generated with" markers | none, except see below |
| Local usernames, Windows user paths, e-mail addresses in tracked files | `git grep` | none |

Finding: the wording "no AI/vendor-tool traces" appeared in two documentation lines. Reworded in the next commit. The original wording still exists in the root commit `726a7f7` (`docs/06-testing-strategy.md`, `docs/07-roadmap.md`) and the PRD non-goal "AI chatbot or AI features" is a legitimate product statement. Options: (a) leave history as is; (b) rewrite the 7 unpublished commits (changes every hash). Owner decision needed before the first push.

Limit: the scanner is regex-based and weaker than a dedicated tool; secrets in binary files and in the unscanned lockfiles would not be seen. No binary files other than the six PNG screenshots exist.

## Branch protection on a private repository

- The GitHub token scopes are `gist, read:org, repo, workflow`; the API returned `plan: null`, so the account plan could **not** be read. It is not assumed.
- GitHub documentation (plans page) lists "Protected branches" and "Required pull request reviewers" under GitHub Pro's advanced tools for private repositories, and describes Free private repositories as having "a limited feature set" without listing them. This suggests Free private repositories cannot enforce protection, but the page does not state it outright.
- RESULT (probed 2026-11-01): the API returned HTTP 403 "Upgrade to GitHub Pro or make this repository public to enable this feature." for branch protection and rulesets. Enforcement is NOT available on the current plan.
- Test that was run: `gh api -X PUT repos/<owner>/hesban/branches/main/protection` with a required status check `verify`. An error such as "Upgrade to GitHub Pro or make this repository public" means enforcement is unsupported on the current plan.
- If unsupported, fallbacks that are not enforcement: work only through pull requests by convention, run CI on every push, and require green local checks before merge. Upgrading the plan or making the repository public is the owner's decision; nothing will be purchased.

## Planned steps once approved

1. `gh repo create mohamedselimdev/hesban --private --source . --remote origin` (no push).
2. `git push -u origin main`.
3. Watch the first CI run (`gh run watch`); report every failing step honestly and fix by commit, not by bypass.
4. Probe branch protection as above and record the exact API response.
5. Record results in `docs/DEVLOG.md`.
