# every-ts

`every-ts` is a utility that can build _any_ version of TypeScript. Yes, that's
right, any version, even back to 1.0.3.

`every-ts` can also be used to bisect TypeScript, without needing to know
anything about TypeScript's build process.

This repo works by making a
["blobless" clone](https://github.blog/2020-12-21-get-up-to-speed-with-partial-clone-and-shallow-clone/)
of TypeScript (to save time and space), switching to the desired version, and
building it. The way to build TypeScript has changed over the years (even places
which don't build with modern Node!), and `every-ts` knows how to build any of
them.

# Switching versions

To switch versions, use `every-ts switch <ref>`. This ref can be anything that
`git` accepts. If `<ref>` isn't found, `origin/<ref>` and `origin/release-<ref>`
will also be tried.

```
$ every-ts switch main         # Switches to `origin/main`
$ every-ts switch release-2.7  # Switches to `origin/release-2.7`
$ every-ts switch 1.8          # Switches to `origin/release-1.8`
$ every-ts switch 1.8~100      # Switches 100 commits before `origin/release-1.8`
$ every-ts switch v1.1         # Switches the tag `v1.1`
```

# Running `tsc`

To invoke `tsc`, run `every-ts tsc`:

```
$ every-ts switch main
Version 5.3.0-dev
$ every-ts switch 1.8~100
Version 1.8.0
$ every-ts switch v1.1
message TS6029: Version 1.1.0.0
```

# Bisecting

`every-ts` wraps `git bisect`, building TypeScript automatically. To use it, run
`every-ts bisect` just like you would `git bisect`:

```
$ every-ts bisect start
status: waiting for both good and bad commits
$ every-ts bisect bad v5.2.2
status: waiting for good commit(s), bad commit known
$ every-ts bisect good v5.1.6
Bisecting: a merge base must be tested
[0aa49c152d37f97e16ad3d166701d0f7166a635e] Update package-lock.json
$ every-ts tsc --version
Version 5.1.0-dev
$ every-ts bisect good
$ every-ts bisect bad
$ every-ts bisect bad
# ...
$ every-ts bisect good
$ every-ts bisect bad
607d96f6dfc6dc557fa370d8ae86f5191608ec91 is the first bad commit
commit 607d96f6dfc6dc557fa370d8ae86f5191608ec91
Author: Jake Bailey <5341706+jakebailey@users.noreply.github.com>
Date:   Thu Aug 3 15:53:30 2023 -0700

    Improve performance of maybe stack in recursiveTypeRelatedTo (#55224)
$ every-ts bisect reset
```

<!-- TODO: need a way to get TS bin into run PATH

`bisect run` is also supported:

```
$ every-ts bisect start
status: waiting for both good and bad commits
$ every-ts bisect old v5.0.3
status: waiting for good commit(s), bad commit known
$ every-ts bisect new v4.9.4
Bisecting: a merge base must be tested
[0aa49c152d37f97e16ad3d166701d0f7166a635e] Update package-lock.json
$ every-ts bisect run tsc --version
``` -->

For more info on `git bisect`, see the
[git docs](https://git-scm.com/docs/git-bisect).
