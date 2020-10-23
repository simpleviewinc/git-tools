# git-tools
Helper functions for interfacing with git in Node. Useful for switching between a project's master/develop branch and a developers pull-request for review.

## Installation

```
npm install @simpleview/git-tools
```

# Package Api

### assertIsGit(path)

Asserts if a given path isn't git.

### checkout(args)

Checks out a git repsitory using it's ssh URL. You can use this to checkout this repo from any branch and fork of the repo. Makes it very easy to code-switch to review a Pull Request from another developers fork. This will setup the working copy so that the origin remote using the `args.origin`, and any branches from origin are named using that origin's name. Branches from other remotes are prefixed with the origin, so a branch from "owenallenaz" would be named "owenallenaz-master" and will properly track the remote "owenallenaz/master".

* args
    * origin - The SSH url for the repository.
    * path - The path without trailing / where the repo should be checked out to.
    * branch - optional - default 'master' - What branch to checkout.
    * remote - optional - default 'origin' - Specify if you want to checkout a fork of the origin.
    * github - optional - Specify a github link in format remote/branch, easy copy-pasting from the github UI.
    * silent - optional - default false - Whether or not the git commands should proceed silently or stream their output to the console.
    * interactive - optional - default false - Whether to prompt the user before making destructive actions like cleaning or resetting.

### getBranch(path)

Returns the current active branch for the repo.

### getBranches(path)

Returns an `{ commit, name, tracking }` for each branch.

### getState(path)

Returns `"ahead"` if working copy is ahead of the current remote/branch, `"behind"` if the working copy is behind the remote/branch and `"equal"` if the working copy is equal to the remote/branch.

### getTrackingBranch(path)

Returns the tracking branch in the format remote/branch-name.

### isGitRepo(path)

Returns boolean for whether the path is a git repo.

### isDirty(path)

Returns boolean for whether the path has changes including removals, additions, and untracked changes.