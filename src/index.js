//@ts-check
const child_process = require("child_process");
const fs = require("fs").promises;
const util = require("util");

const execP = util.promisify(child_process.exec);

function spawnP(command, args, options) {
	const child = child_process.spawn(command, args, options);

	return new Promise(function(resolve, reject) {
		child.on("close", function(code) {
			if (code === 0) {
				return resolve();
			} else {
				return reject(new Error(`Process failed returned exit ${code}`));
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
 * @param {boolean} [args.silent] - Whether to perform the git mechanisms silently or stream to the parent process. Default false.
 * @param {boolean} [args.clean] - Whether to clean-up the working copy prior to pulling in new changes. Default true.
 */
async function checkout({
	origin,
	path,
	branch = "master",
	remote = "origin",
	silent = false,
	clean = true,
}) {
	const baseOptions = { shell : true };
	const options = silent ? baseOptions : { ...baseOptions, stdio : "inherit" };

	function execPath(command) {
		return execP(command, { cwd : path });
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

	if (clean === true) {
		// clean current branch
		await spawnPath(`git reset --hard ${currentTracking} && git clean -f`);
	}

	if (currentTracking !== desiredTracking) {
		try {
			// check if the branch exists already on this repo
			await execPath(`git show-ref "refs/heads/${desiredLocalBranch}"`);
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
		
		await spawnPath(`git checkout $LOCAL_BRANCH`, {
			env : {
				...process.env,
				LOCAL_BRANCH : desiredLocalBranch
			}
		});
	}

	await spawnPath(`git pull`);
}

/**
 * Checks if a path is a git repository
 * @param {string} path - Path to git repo without trailing /.
 */
async function isGitRepo(path) {
	try {
		await fs.access(path + "/.git");
	} catch (e) {
		return false;
	}

	return true;
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

async function getBranch(path) {
	assertIsGit(path);

	const branch = (await execP(`git rev-parse --abbrev-ref HEAD`, { cwd : path })).stdout.trim();
	return branch;
}

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

exports.assertIsGit = assertIsGit;
exports.checkout = checkout;
exports.getBranch = getBranch;
exports.getBranches = getBranches;
exports.getState = getState;
exports.getTrackingBranch = getTrackingBranch;
exports.isGitRepo = isGitRepo;