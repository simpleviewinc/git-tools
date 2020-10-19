const gitTools = require("./");

async function run() {
	// await gitTools.clone({
	// 	origin : "git@github.com:simpleviewinc/cms-client-base.git",
	// 	branch : "owen-test",
	// 	path : "/app/src/cms-client-base"
	// });

	// await gitTools.checkout({
		
	// })

	// const state = await gitTools.getState("/app/src/cms-client-base");
	// console.log('state', state);

	const result = await gitTools.getBranches("/app/testing/checkout");
	console.log("result", result);
}

run();