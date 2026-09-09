#!/usr/bin/env node
"use strict";

/* MagicMirror²
 * Module: MMM-TMB
 *
 * Talks to the real TMB API once and prints both the raw response and the
 * snapshot the module would build from it. Useful to check credentials, to see
 * which fields a stop actually returns, and to confirm a stop code.
 *
 *   TMB_APP_ID=... TMB_APP_KEY=... npm run smoke -- 001124 [line]
 *
 * By @jaumebosch
 * MIT Licensed.
 */

const { TmbClient } = require("../src/backend/tmb-client.js");
const { ArrivalsService } = require("../src/backend/arrivals-service.js");
const { normalizeConfig, validateConfig } = require("../src/shared/config.js");

function usage(message) {
	console.error(`${message}\n`);
	console.error("Usage: TMB_APP_ID=... TMB_APP_KEY=... npm run smoke -- <busStopCode> [busLine]");
	process.exit(2);
}

async function main() {
	const [busStopCode, busLine] = process.argv.slice(2);
	if (!busStopCode) {
		usage("Missing bus stop code.");
	}

	const rawConfig = {
		appId: process.env.TMB_APP_ID,
		appKey: process.env.TMB_APP_KEY,
		busStops: [{ busStopCode, busLine }]
	};

	const problems = validateConfig(rawConfig);
	if (problems.length > 0) {
		usage(problems.map((problem) => `- ${problem.key} ${JSON.stringify(problem.variables)}`).join("\n"));
	}

	const config = normalizeConfig(rawConfig);
	const client = new TmbClient({ appId: config.appId, appKey: config.appKey, timeoutMs: config.requestTimeout });
	const [stop] = config.busStops;

	console.log(`Stop ${stop.busStopCode} (API code ${stop.apiCode})${stop.busLine ? `, line ${stop.busLine}` : ""}\n`);

	const entries = await client.fetchArrivals(stop.apiCode, stop.busLine);
	console.log("--- raw ibus entries ---");
	console.log(JSON.stringify(entries, null, 2));
	console.log(`\nFields present: ${[...new Set(entries.flatMap(Object.keys))].sort().join(", ") || "(none)"}`);

	const snapshot = await new ArrivalsService({ client, stops: config.busStops }).collect();
	console.log("\n--- snapshot as the module would render it ---");
	console.log(JSON.stringify(snapshot, null, 2));
}

main().catch((error) => {
	console.error(`\n${error.name}: ${error.message}`);
	if (error.fatal) {
		console.error("The credentials were rejected. Check TMB_APP_ID / TMB_APP_KEY.");
	}
	process.exit(1);
});
