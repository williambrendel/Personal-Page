#!/usr/bin/env bash
# Lets npm ci install the private shared libraries. Each library has its own
# fine-grained, read-only token, kept as a repo secret named after it:
#
#   LLMS_READ_TOKEN            williambrendel/llms            (this repo uses it)
#   AUTH_READ_TOKEN            williambrendel/auth            (optional here)
#   NATIVE_WRAPPER_READ_TOKEN  williambrendel/Native-Wrapper   (optional here)
#
# One token per library rather than one for all of them: a token wide enough to
# rewrite every williambrendel/ URL is a token that can read every private repo,
# and a deploy only needs what it installs.
#
# The lockfile resolves these over ssh, which the runner has no key for, so each
# library's URL is rewritten to https with its own token, inline. (A credential
# helper was tried first and failed in the worst way: it exits 0 when it cannot
# see the token, git then asks anonymously, and GitHub answers "Repository not
# found" — which is what it says for a private repo you are not authorised for.
# The result looked like a bad token and was not.) Actions masks the secrets in
# logs, and the runner is thrown away.
#
# Each token is checked here so a missing or wrong one fails now, with git's own
# words, instead of three minutes later inside npm ci.
#
# Adapted from Pagebeat's .github/scripts/library-tokens.sh, with one change:
# a library this repo does not install cannot fail the deploy. See `library`.
set -uo pipefail

failed=0

# library <repo> <secret name> <required: yes|no>
#
# required=yes  the secret must be set and must work, or the deploy stops.
# required=no   a missing secret is skipped silently; a secret that is set but
#               does not work is a warning, not an error. This repo does not
#               install that library, so a token it does not need must not be
#               able to block a deploy — while still saying something, because
#               a token that has quietly stopped working is worth knowing about
#               before the day you add the dependency.
library() {
  local repo=$1 name=$2 required=$3 token=${!2:-}

  if [ -z "$token" ]; then
    if [ "$required" = yes ]; then
      echo "::error::The $name secret is not set. Add the read-only token for williambrendel/$repo in Settings › Secrets and variables › Actions."
      failed=1
    fi
    return
  fi

  local to="https://x-access-token:${token}@github.com/williambrendel/${repo}"
  git config --global --add url."$to".insteadOf "ssh://git@github.com/williambrendel/${repo}"
  git config --global --add url."$to".insteadOf "git@github.com:williambrendel/${repo}"

  local out code
  if out=$(git ls-remote "$to.git" HEAD 2>&1); then
    echo "$repo is reachable with $name"
    return
  fi

  # Does the token work at all, outside git? Separates "wrong token" from
  # "git cannot reach GitHub", which an exit code alone cannot tell apart.
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Authorization: Bearer ${token}" "https://api.github.com/repos/williambrendel/${repo}")
  if [ "$required" = yes ]; then
    echo "::error::$name cannot read williambrendel/$repo (GitHub API: HTTP $code; 200 means the token is fine and git is the problem). git said:"
    failed=1
  else
    echo "::warning::$name cannot read williambrendel/$repo (GitHub API: HTTP $code). Not installed here, so this does not stop the deploy. git said:"
  fi
  echo "$out"
}

echo "git $(git --version | awk '{print $3}')"

# Only llms is installed here (server/package.json). The other two are listed
# so that adding the dependency is the only step needed later — and so a token
# that has gone stale is reported before it matters.
library llms           LLMS_READ_TOKEN           yes
library auth           AUTH_READ_TOKEN           no
library Native-Wrapper NATIVE_WRAPPER_READ_TOKEN no

exit $failed
