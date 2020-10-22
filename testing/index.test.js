const fs = require("fs").promises;
const assert = require("assert");
const mochaLib = require("@simpleview/mochalib");
const assertLib = require("@simpleview/assertlib");
const child_process = require("child_process");

const gitTools = require("../src");

const testOrigin = "git@github.com:simpleviewinc/git-tools-test.git";

child_process.execSync(`git config --global user.email "owenallena@gmail.com"`);
child_process.execSync(`git config --global user.name "Owen Allen"`);

describe(__filename, function() {
	this.timeout(5000);

	const checkoutFolder = `/tmp/checkout`;

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

			const result = child_process.execSync("git log --oneline", { cwd : checkoutFolder }).toString().trim();
			const commits = result.split("\n").map(val => {
				const content = val.match(/(\w+) .*/);
				return content[1];
			});
			// shift off the current commit
			commits.shift();

			// reset to the previous commit and ensure we are behind
			child_process.execSync(`git reset ${commits[0]} && git clean -f`, { cwd : checkoutFolder });
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
});