//@ts-check
const child_process = require("child_process");
const fs = require("fs").promises;
const util = require("util");
const read = require("read");

const execP = util.promisify(child_process.exec);
const readP = util.promisify(read);

function spawnP(command, args, options) {
	const child = child_process.spawn(command, args, options);

	return new Promise(function(resolve, reject) {
		child.on("close", function(code) {
			if (code === 0) {
				return resolve();
			} else {
				return reject(new Error(`Process failed returned exit ${code}. Command ${command}.`));
			}
		});
	});
}

/**
 * Clones a git repo if it isn't already cloned. Ensures it is on the right remote and branch and is up to date.
 * @param {Object} args - Args
 * @param {string} args.origin - The full git url for the origin for the working copy.
 * @param {string} args.path - The path without trailing / to checkout the repository.
 * @param {string} [args.branch] - The branch to checkout. Default "master".
 * @param {string} [args.remote] - The remote to reference. Pass if you want to switch to a different fork. Default "origin".
 * @param {string} [args.github] - remote:branch syntax that github provides with their quick link in the UI.
 * @param {boolean} [args.silent] - Whether to perform the git mechanisms silently or stream to the parent process. Default false.
 * @param {boolean} [args.interactive] - Prompt the user before destructive changes are made to the working copy. Default false.
 */
async function checkout({
	origin,
	path,
	branch = "master",
	remote = "origin",
	github,
	silent = false,
	interactive = false,
}) {
	if (path === undefined) {
		throw new Error(`Must specify a path.`);
	}

	if (origin === undefined) {
		throw new Error(`Must specify an origin.`);
	}

	if (github !== undefined) {
		const match = github.match(/^(.*?):(.*)$/);
		if (match === null || match.length !== 3) {
			throw new Error(`Github flag is invalid, must be in the form copied from github like --github="remote:branch"`);
		}

		remote = match[1];
		branch = match[2];
	}

	const baseOptions = { shell : true };
	const options = silent ? baseOptions : { ...baseOptions, stdio : "inherit" };

	function execPath(command, myOptions = {}) {
		return execP(command, { ...myOptions, cwd : path });
	}

	function spawnPath(command, myOptions = {}) {
		return spawnP(command, { ...options, ...myOptions, cwd : path });
	}

	let exists;
	try {
		await fs.access(path);
		exists = true;
	} catch (e) {
		exists = false;
	}

	if (!exists) {
		await spawnP(`git clone --recurse-submodules ${origin} ${path}`, options);
	}

	const desiredRemoteBranch = `remotes/${remote}/${branch}`;
	const desiredLocalBranch = remote === "origin" ? branch : `${remote}-${branch}`;
	const desiredTracking = `${remote}/${branch}`;
	const name = origin.match(/\/(.*).git/)[1];

	const currentTracking = await getTrackingBranch(path);
	const currentBranch = await getBranch(path);

	if (remote !== "origin") {
		try {
			// check if the remote exists, will throw if it doesn't
			await execPath(`git remote | grep ${remote}$`);
		} catch(e) {
			// remote doesn't exist, add it
			await spawnPath(`git remote add ${remote} git@github.com:${remote}/${name}.git`);
		}
	}

	await spawnPath(`git fetch --recurse-submodules ${remote}`);
	
	const dirty = await isDirty(path);
	if (dirty === true) {
		if (interactive === true) {
			console.log(`Repository at ${path} has uncommited changes. It is necessary to have a clean working copy to proceed. This will revert all pending changes.`);
			await readP({ prompt : "Press [enter] to continue and clean your working copy, or ctrl+c to cancel the operation." });
		}

		// resets tracked files, deletes untracked files, re-adds deleted files
		if (await hasSubmodules(path) === true) {
			// cleans all junk from submodules
			await spawnPath(`git submodule foreach --recursive git reset && git submodule foreach --recursive git clean -ffd && git submodule foreach --recursive git checkout .`);
			// switches all submodules back to their tracked commit
			await spawnPath(`git submodule update`);
		}
		
		await spawnPath(`git reset && git clean -ffd && git checkout .`);
	}

	if (currentTracking !== desiredTracking) {
		try {
			// check if the branch exists already on this repo
			await execPath(`git show-ref $BRANCH`, {
				env : {
					...process.env,
					BRANCH : `refs/heads/${desiredLocalBranch}`
				}
			});
		} catch(e) {
			// branch doesn't exist, add it
			await spawnPath(`git branch $LOCAL_BRANCH --track $REMOTE_BRANCH`, {
				env : {
					...process.env,
					LOCAL_BRANCH : desiredLocalBranch,
					REMOTE_BRANCH : desiredRemoteBranch
				}
			});
		}

		if (await hasSubmodules(path) === true) {
			// deinit the submodules and store the current modules directory under the branch name
			await spawnPath(`git submodule deinit --all`);
			await spawnPath(`mkdir -p .git/git-tools/modules`);
			await spawnPath(`mv .git/modules .git/git-tools/modules/$BRANCH`, {
				env : {
					...process.env,
					BRANCH : currentBranch
				}
			});
		}
		
		await spawnPath(`git checkout $LOCAL_BRANCH`, {
			env : {
				...process.env,
				LOCAL_BRANCH : desiredLocalBranch
			}
		});
	}

	const state = await getState(path);
	if (state === "ahead") {
		if (interactive === true) {
			console.log(`Repository at ${path} is currently ahead of the remote fork/branch. To proceed we need to reset to the state of the working copy. This will cause you to lose your additional commits.`);
			console.log(`If you do not want to lose your work, then either push your commits to the remote/branch, manually pull or rebase.`);
			await readP({ prompt : "Press [enter] to continue and reset or ctrl+c to cancel the operation."});
		}

		await spawnPath(`git reset --hard $BRANCH && git clean -f`, {
			env : {
				...process.env,
				BRANCH : desiredTracking
			}
		});
	}

	await spawnPath(`git pull`);

	if (await hasSubmodules(path) === true) {
		if (await pathExists(`${path}/.git/git-tools/modules/${desiredLocalBranch}`)) {
			// if we have an existing modules folder, but a stored variant, dump the existing
			if (await pathExists(`${path}/.git/modules`)) {
				await spawnPath(`rm -rf .git/modules`);
			}

			// restore the stored modules folder
			await spawnPath(`mv .git/git-tools/modules/$BRANCH .git/modules`, {
				env : {
					...process.env,
					BRANCH : desiredLocalBranch
				}
			});
		}

		await spawnPath(`git submodule sync && git submodule update`);
	}
}

/**
 * Checks if a path is a git repository
 * @param {string} path - Path to git repo without trailing /.
 */
async function isGitRepo(path) {
	return pathExists(`${path}/.git`);
}

/**
 * Returns the tracking branch for the git path in the format of remote/branch-name.
 * @param {string} path - Path to git repo without trailing /.
 */
async function getTrackingBranch(path) {
	assertIsGit(path);

	const result = await execP(`git rev-parse --abbrev-ref --symbolic-full-name @{u}`, { cwd : path });

	return result.stdout.trim();
}

/**
 * Returns whether the working copy is "equal", "ahead", or "behind" the current remote/branch.
 * @param {string} path - Path to git repo without trailing /.
 */
async function getState(path) {
	assertIsGit(path);

	const localCommit = (await execP(`git rev-parse @`, { cwd : path })).stdout.trim();
	const remoteCommit = (await execP(`git rev-parse @{u}`, { cwd : path })).stdout.trim();
	const baseCommit = (await execP(`git merge-base @ @{u}`, { cwd : path })).stdout.trim();

	// check the status of our remote working copy versus the remote to see if we have changes
	if (localCommit === remoteCommit) {
		return "equal";
	} else if (baseCommit !== localCommit) {
		return "ahead";
	} else {
		return "behind";
	}
}

/**
 * Throws an error if the path isn't a git repository.
 * @param {string} path - Path to git repo without trailing /.
*/
async function assertIsGit(path) {
	const isGit = await isGitRepo(path);
	if (!isGit) {
		throw new Error(`Repository at ${path} is not a git repo.`)
	}
}

/**
 * Returns the current branch name for the git repository.
 * @param {string} path - Path to git repo without trailing /.
 */
async function getBranch(path) {
	assertIsGit(path);

	const branch = (await execP(`git rev-parse --abbrev-ref HEAD`, { cwd : path })).stdout.trim();
	return branch;
}

/**
 * Returns the commit, name, tracking of all branches on the git repository.
 * @param {string} path - Path to git repo without trailing /.
*/
async function getBranches(path) {
	assertIsGit(path);

	const branches = (await execP(`git for-each-ref --format='%(objectname):%(refname:short):%(upstream:short)' refs/heads`, { cwd : path })).stdout.trim();
	const lines = branches.split("\n");
	return lines.map(val => {
		const parts = val.split(":");
		return {
			commit : parts[0],
			name : parts[1],
			tracking : parts[2]
		}
	});
}

async function isDirty(path) {
	const result = await execP(`git status --porcelain`, { cwd : path });

	if (result.stdout === "") {
		return false;
	} else {
		return true;
	}
}

async function hasSubmodules(path) {
	return pathExists(`${path}/.gitmodules`);
}

async function pathExists(path) {
	try {
		await fs.access(path);
	} catch(e) {
		return false;
	}

	return true;
}

exports.assertIsGit = assertIsGit;
exports.checkout = checkout;
exports.getBranch = getBranch;
exports.getBranches = getBranches;
exports.getState = getState;
exports.getTrackingBranch = getTrackingBranch;
exports.isDirty = isDirty;
exports.isGitRepo = isGitRepo;
exports.pathExists = pathExists;