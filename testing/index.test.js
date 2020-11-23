//@ts-check
const fs = require("fs").promises;
/** @type {import("./assert")} */
const assert = require("assert");
const mochaLib = require("@simpleview/mochalib");
const assertLib = require("@simpleview/assertlib");
const child_process = require("child_process");
const crypto = require("crypto");

const gitTools = require("../src");
const pathExists = gitTools.pathExists;

const checkoutFolder = `/tmp/checkout`;
const testOrigin = "git@github.com:simpleviewinc/git-tools-test.git";

async function checkout(args = {}) {
	return gitTools.checkout({ origin : testOrigin, path : checkoutFolder, silent : true, ...args });
}

describe(__filename, function() {
	this.timeout(5000);

	const cleanup = async function() {
		await fs.rmdir(checkoutFolder, { recursive : true })
	}

	before(cleanup);
	afterEach(cleanup);

	describe("checkout", function() {
		const tests = [
			{
				name : "checkout master",
				args : {
					checkoutArgs : { origin : testOrigin, path : checkoutFolder, silent : true },
					branch : "master",
					trackingBranch : "origin/master",
					branches : [
						{
							name : "master",
							tracking : "origin/master"
						}
					]
				}
			},
			{
				name : "checkout develop",
				args : {
					checkoutArgs : { origin : testOrigin, path : checkoutFolder, silent : true, branch : "develop" },
					branch : "develop",
					trackingBranch : "origin/develop",
					branches : [
						{
							name : "develop",
							tracking : "origin/develop"
						},
						{
							name : "master",
							tracking : "origin/master"
						}
					]
				}
			},
			{
				name : "checkout another remote",
				args : {
					checkoutArgs : { origin : testOrigin, path : checkoutFolder, silent : true, remote : "owenallenaz" },
					branch : "owenallenaz-master",
					trackingBranch : "owenallenaz/master",
					branches : [
						{
							name : "master",
							tracking : "origin/master"
						},
						{
							name : "owenallenaz-master",
							tracking : "owenallenaz/master"
						}
					]
				}
			},
			{
				name : "checkout with special chars in branch name",
				args : {
					checkoutArgs : { origin : testOrigin, path : checkoutFolder, silent : true, branch : `with-special-chars-,'"!@#$_` },
					branch : `with-special-chars-,'"!@#$_`,
					trackingBranch : `origin/with-special-chars-,'"!@#$_`,
					branches : [
						{
							name : "master",
							tracking : "origin/master"
						},
						{
							name : `with-special-chars-,'"!@#$_`,
							tracking : `origin/with-special-chars-,'"!@#$_`
						}
					]
				}
			},
			{
				name : "checkout with github flag",
				args : {
					checkoutArgs : { origin : testOrigin, path : checkoutFolder, silent : true, github : "owenallenaz:develop" },
					branch : "owenallenaz-develop",
					trackingBranch : `owenallenaz/develop`,
					branches : [
						{
							name : "master",
							tracking : "origin/master"
						},
						{
							name : `owenallenaz-develop`,
							tracking : `owenallenaz/develop`
						}
					]
				}
			},
			{
				name : "checkout with preserveBranch",
				args : {
					checkoutArgs : { origin : testOrigin, path : checkoutFolder, silent : true, preserveBranch : true },
					branch : "master",
					trackingBranch : "origin/master",
					branches : [
						{
							name : "master",
							tracking : "origin/master"
						}
					]
				}
			}
		];

		mochaLib.testArray(tests, async function(test) {
			await gitTools.checkout(test.checkoutArgs);

			const text = await fs.readFile(`${test.checkoutArgs.path}/test.txt`);
			assert.strictEqual(text.toString().trim(), "one");

			const trackingBranch = await gitTools.getTrackingBranch(test.checkoutArgs.path);
			assert.strictEqual(trackingBranch, test.trackingBranch);

			const branch = await gitTools.getBranch(test.checkoutArgs.path);
			assert.strictEqual(branch, test.branch);

			const branches = await gitTools.getBranches(test.checkoutArgs.path);
			assertLib.deepCheck(branches, test.branches);
		});

		it("should checkout with special characters and switch off it", async function() {
			this.timeout(10000);

			await gitTools.checkout({ origin : testOrigin, path : checkoutFolder, silent : true, branch : `with-special-chars-,'"!@#$_` });

			await gitTools.checkout({ origin : testOrigin, path : checkoutFolder, silent : true });
		});

		it("should clean the working copy", async function() {
			this.timeout(10000);

			await checkout();
			await fs.writeFile(`${checkoutFolder}/untrackedFile.txt`, "content");
			await fs.writeFile(`${checkoutFolder}/addedFile.txt`, "content");
			await fs.mkdir(`${checkoutFolder}/newFolder`);
			await fs.writeFile(`${checkoutFolder}/newFolder/nestedFile.txt`, "content");
			await fs.access(`${checkoutFolder}/test.txt`);

			child_process.execSync(`git add addedFile.txt && rm test.txt`, { cwd : checkoutFolder });
			
			await checkout();
			
			await assert.rejects(fs.access(`${checkoutFolder}/untrackedFile.txt`), {
				name : "Error",
				message : "ENOENT: no such file or directory, access '/tmp/checkout/untrackedFile.txt'"
			});

			await assert.rejects(fs.access(`${checkoutFolder}/addedFile.txt`), {
				name : "Error",
				message : "ENOENT: no such file or directory, access '/tmp/checkout/addedFile.txt'"
			});

			await assert.rejects(fs.access(`${checkoutFolder}/newFolder/nestedFile.txt`), {
				name : "Error",
				message : "ENOENT: no such file or directory, access '/tmp/checkout/newFolder/nestedFile.txt'"
			});

			await fs.access(`${checkoutFolder}/test.txt`);
		});

		it("should reset the working copy if ahead", async function() {
			this.timeout(10000);
			
			await checkout();
			await fs.writeFile(`${checkoutFolder}/addedFile.txt`, "content");
			child_process.execSync(`git add addedFile.txt && git commit -m 'new file'`, { cwd : checkoutFolder });

			await fs.writeFile(`${checkoutFolder}/untrackedFile.txt`, "content");

			const dirty1 = await gitTools.isDirty(checkoutFolder);
			assert.strictEqual(dirty1, true);

			const state1 = await gitTools.getState(checkoutFolder);
			assert.strictEqual(state1, "ahead");

			await checkout();

			const dirty2 = await gitTools.isDirty(checkoutFolder);
			assert.strictEqual(dirty2, false);

			const state2 = await gitTools.getState(checkoutFolder);
			assert.strictEqual(state2, "equal");
		});

		it("should checkout interactively", async function() {
			this.timeout(30000);

			await checkout();
			await fs.writeFile(`${checkoutFolder}/addedFile.txt`, "content");
			await fs.writeFile(`${checkoutFolder}/untrackedFile.txt`, "content");
			child_process.execSync(`git add addedFile.txt && git commit -m 'new change'`, { cwd : checkoutFolder });

			const command = `/app/src/cli checkout --origin=${testOrigin} --path=${checkoutFolder} --interactive --silent`;
			const child = child_process.spawn(command, { shell : true });
			const lines = [];
			child.stdout.on("data", function(d) {
				const newLines = d.toString().trim().split("\n");
				lines.push(...newLines);

				if (lines.length === 2) {
					assert.deepStrictEqual(lines, [
						"Repository at /tmp/checkout has uncommited changes. It is necessary to have a clean working copy to proceed. This will revert all pending changes.",
						"Press [enter] to continue and clean your working copy, or ctrl+c to cancel the operation."
					]);
					child.stdin.write("\n");
				} else if (lines.length === 5) {
					assert.deepStrictEqual(lines.slice(2, 5), [
						"Repository at /tmp/checkout is currently ahead of the remote fork/branch. To proceed we need to reset to the state of the working copy. This will cause you to lose your additional commits.",
						"If you do not want to lose your work, then either push your commits to the remote/branch, manually pull or rebase.",
						"Press [enter] to continue and reset or ctrl+c to cancel the operation."
					]);
					child.stdin.write("\n");
					child.stdin.end();
				}
			});

			await new Promise(function(resolve, reject) {
				child.on("close", function(code) {
					assert.strictEqual(code, 0);
					resolve();
				});
			});

			const dirty = await gitTools.isDirty(checkoutFolder);
			assert.strictEqual(dirty, false);

			const state = await gitTools.getState(checkoutFolder);
			assert.strictEqual(state, "equal");
		});

		it("should preserveBranch", async function() {
			this.timeout(10000);

			await checkout({ branch : "develop" });
			child_process.execSync(`git reset HEAD~1 && git clean -f`, { cwd : checkoutFolder });
			const state1 = await gitTools.getState(checkoutFolder);
			assert.strictEqual(state1, "behind");

			await checkout({ preserveBranch : true });
			const branch = await gitTools.getBranch(checkoutFolder);
			assert.strictEqual(branch, "develop");
			const state2 = await gitTools.getState(checkoutFolder);
			assert.strictEqual(state2, "equal");
		});

		describe("submodules", function() {
			this.timeout(20000);

			it("should checkout including submodules", async function() {
				// checkout normal
				await checkout();
				assert.strictEqual(await pathExists(`${checkoutFolder}/submodule`), false);

				// checkout with a submodule
				await checkout({ branch : "submodule-test" });
				assert.strictEqual(await pathExists(`${checkoutFolder}/submodule/test.txt`), true);

				// check off the submodule make sure it's gone
				await checkout();
				assert.strictEqual(await pathExists(`${checkoutFolder}/submodule`), false);
			});

			it("should checkout and switch from submodules with different remotes", async function() {
				await checkout();
				assert.strictEqual(await pathExists(`${checkoutFolder}/submodule`), false);

				await checkout({ branch : "submodule-test" });
				assert.strictEqual(await pathExists(`${checkoutFolder}/submodule/test.txt`), true);

				await checkout({ branch : "submodule-test2" });
				const readmeContent = await fs.readFile(`${checkoutFolder}/submodule/readme.md`);
				const hash = crypto.createHash("md5").update(readmeContent).digest("hex");
				assert.strictEqual(hash, "0c36921f42e7d8387eb800f4f463da2e");
				assert.strictEqual(await pathExists(`${checkoutFolder}/.git/git-tools/modules/submodule-test`), true);

				await checkout();
				assert.strictEqual(await pathExists(`${checkoutFolder}/submodule/readme.md`), false);
				assert.strictEqual(await pathExists(`${checkoutFolder}/.git/git-tools/modules/submodule-test2`), true);
			});

			it("should preserve branches on submodules", async function() {
				await checkout({ branch : "submodule-test" });
				child_process.execSync(`git branch new-branch && git checkout new-branch 2>&1 && touch new.txt && git add new.txt && git commit -m 'test'`, {
					cwd : `${checkoutFolder}/submodule`
				});
				await checkout();
				assert.strictEqual(await pathExists(`${checkoutFolder}/submodule/new.txt`), false);
				await checkout({ branch : "submodule-test" });
				child_process.execSync(`git checkout new-branch 2>&1`, {
					cwd : `${checkoutFolder}/submodule`
				});
				assert.strictEqual(await pathExists(`${checkoutFolder}/submodule/new.txt`), true);
			});
		});
	});

	describe("getState", function() {
		it("should getState", async function() {
			this.timeout(10000);

			await gitTools.checkout({
				origin : testOrigin,
				path : checkoutFolder,
				silent : true
			});

			const state = await gitTools.getState(checkoutFolder);
			assert.strictEqual(state, "equal");

			// reset to the previous commit and ensure we are behind
			child_process.execSync(`git reset HEAD~1 && git clean -f`, { cwd : checkoutFolder });
			const state2 = await gitTools.getState(checkoutFolder);
			assert.strictEqual(state2, "behind");

			await gitTools.checkout({
				origin : testOrigin,
				path : checkoutFolder,
				silent : true
			});

			// add a file and commit it
			await fs.writeFile(`${checkoutFolder}/newFile.txt`, "content");
			child_process.execSync(`git add newFile.txt`, { cwd : checkoutFolder });
			child_process.execSync(`git commit -m "added"`, { cwd : checkoutFolder });

			// ensure we are now ahead
			const state3 = await gitTools.getState(checkoutFolder);
			assert.strictEqual(state3, "ahead");
		});
	});

	describe("assertIsGit", function() {
		it("should succeed", async function() {
			await gitTools.checkout({
				origin : testOrigin,
				path : checkoutFolder,
				silent : true
			});

			await gitTools.assertIsGit(checkoutFolder);
		});

		it("should throw on invalid", async function() {
			await assert.rejects(async function () {
				return gitTools.assertIsGit("/app");
			}, function(err) {
				assert.strictEqual(err.message, "Repository at /app is not a git repo.");
				return true;
			});
		});
	});

	describe("isDirty", function() {
		it("should work", async function() {
			await gitTools.checkout({
				origin : testOrigin,
				path : checkoutFolder,
				silent : true
			});

			const dirty1 = await gitTools.isDirty(checkoutFolder);
			assert.strictEqual(dirty1, false);

			// ensure untracked add triggers dirty
			await fs.writeFile(`${checkoutFolder}/newFile.txt`, "content");
			const dirty2 = await gitTools.isDirty(checkoutFolder);
			assert.strictEqual(dirty2, true);

			// ensure tracked add triggers dirty
			child_process.execSync("git add newFile.txt", { cwd : checkoutFolder });
			const dirty3 = await gitTools.isDirty(checkoutFolder);
			assert.strictEqual(dirty3, true);

			// ensure a commited change removes dirty state
			child_process.execSync("git commit -m 'new change'", { cwd : checkoutFolder });
			const dirty4 = await gitTools.isDirty(checkoutFolder);
			assert.strictEqual(dirty4, false);

			// ensure a normal remove triggers dirty
			child_process.execSync("rm test.txt", { cwd : checkoutFolder });
			const dirty5 = await gitTools.isDirty(checkoutFolder);
			assert.strictEqual(dirty5, true);

			// ensure a tracked remove triggers dirty
			child_process.execSync("git rm test.txt", { cwd : checkoutFolder });
			const dirty6 = await gitTools.isDirty(checkoutFolder);
			assert.strictEqual(dirty6, true);
		});
	});
});