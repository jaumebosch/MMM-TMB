"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ArrivalsService } = require("../src/backend/arrivals-service.js");

const silentLogger = { warn() {}, error() {}, info() {}, log() {} };

/** Minimal TmbClient double, recording the calls it receives. */
function fakeClient({ stops = {}, arrivals = {} } = {}) {
	const calls = { fetchStop: [], fetchArrivals: [] };
	return {
		calls,
		async fetchStop(code) {
			calls.fetchStop.push(code);
			const result = stops[code];
			if (result instanceof Error) {
				throw result;
			}
			return result ?? { stopCode: String(code), stopName: `Stop ${code}` };
		},
		async fetchArrivals(code, line) {
			calls.fetchArrivals.push([code, line]);
			const result = arrivals[code];
			if (result instanceof Error) {
				throw result;
			}
			return result ?? [];
		}
	};
}

const stop = (busStopCode, apiCode, busLine = null) => ({ busStopCode, apiCode, busLine });

test("collect merges every stop into one list sorted by arrival time", async () => {
	const client = fakeClient({
		arrivals: {
			1124: [{ line: "67", "t-in-s": 300, "t-in-min": 5 }],
			2266: [{ line: "H12", "t-in-s": 60, "t-in-min": 1 }]
		}
	});
	const service = new ArrivalsService({
		client,
		stops: [stop("001124", 1124), stop("2266", 2266)],
		logger: silentLogger
	});

	const snapshot = await service.collect();

	assert.deepEqual(
		snapshot.arrivals.map((a) => [a.line, a.seconds, a.stopName]),
		[
			["H12", 60, "Stop 2266"],
			["67", 300, "Stop 1124"]
		]
	);
	assert.deepEqual(snapshot.errors, []);
	assert.ok(Number.isFinite(snapshot.capturedAt));
});

test("collect passes the configured line through to the client", async () => {
	const client = fakeClient();
	await new ArrivalsService({ client, stops: [stop("001124", 1124, "H12")], logger: silentLogger }).collect();
	assert.deepEqual(client.calls.fetchArrivals, [[1124, "H12"]]);
});

test("stop names are fetched once and reused across refreshes", async () => {
	const client = fakeClient();
	const service = new ArrivalsService({ client, stops: [stop("001124", 1124)], logger: silentLogger });

	await service.collect();
	await service.collect();
	await service.collect();

	assert.deepEqual(client.calls.fetchStop, [1124]);
	assert.equal(client.calls.fetchArrivals.length, 3);
});

test("a failing stop lookup degrades to the stop code as label", async () => {
	const client = fakeClient({
		stops: { 1124: new Error("boom") },
		arrivals: { 1124: [{ line: "67", "t-in-s": 60, "t-in-min": 1 }] }
	});
	const snapshot = await new ArrivalsService({
		client,
		stops: [stop("001124", 1124)],
		logger: silentLogger
	}).collect();

	assert.equal(snapshot.arrivals[0].stopName, "001124");
	assert.deepEqual(snapshot.errors, []);
});

test("one failing stop does not take down the other stops", async () => {
	const client = fakeClient({
		arrivals: { 1124: new Error("upstream down"), 2266: [{ line: "H12", "t-in-s": 60, "t-in-min": 1 }] }
	});
	const snapshot = await new ArrivalsService({
		client,
		stops: [stop("001124", 1124), stop("2266", 2266)],
		logger: silentLogger
	}).collect();

	assert.equal(snapshot.arrivals.length, 1);
	assert.deepEqual(snapshot.errors, [{ stopCode: "001124", message: "upstream down" }]);
});

test("malformed API entries are skipped instead of rendering as NaN", async () => {
	const client = fakeClient({ arrivals: { 1124: [{ line: "67" }, { line: "7", "t-in-s": 90 }] } });
	const snapshot = await new ArrivalsService({
		client,
		stops: [stop("001124", 1124)],
		logger: silentLogger
	}).collect();

	assert.deepEqual(
		snapshot.arrivals.map((a) => a.line),
		["7"]
	);
});

test("collect queries every stop concurrently", async () => {
	let inFlight = 0;
	let peak = 0;
	const client = {
		async fetchStop(code) {
			return { stopCode: String(code), stopName: `Stop ${code}` };
		},
		async fetchArrivals() {
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			await new Promise((resolve) => setTimeout(resolve, 10));
			inFlight -= 1;
			return [];
		}
	};

	await new ArrivalsService({
		client,
		stops: [stop("1", 1), stop("2", 2), stop("3", 3)],
		logger: silentLogger
	}).collect();

	assert.equal(peak, 3);
});

test("the same stop listed twice costs a single name lookup", async () => {
	const client = fakeClient();
	const service = new ArrivalsService({
		client,
		stops: [stop("001124", 1124, "H12"), stop("001124", 1124, "67")],
		logger: silentLogger
	});

	await service.collect();

	assert.deepEqual(client.calls.fetchStop, [1124]);
	assert.deepEqual(client.calls.fetchArrivals, [
		[1124, "H12"],
		[1124, "67"]
	]);
});

test("a failed name lookup is retried on the next refresh", async () => {
	let attempt = 0;
	const client = {
		async fetchStop(code) {
			attempt += 1;
			if (attempt === 1) {
				throw new Error("boom");
			}
			return { stopCode: String(code), stopName: "Pl. Catalunya" };
		},
		async fetchArrivals() {
			return [{ line: "67", "t-in-s": 60, "t-in-min": 1 }];
		}
	};
	const service = new ArrivalsService({ client, stops: [stop("001124", 1124)], logger: silentLogger });

	assert.equal((await service.collect()).arrivals[0].stopName, "001124");
	assert.equal((await service.collect()).arrivals[0].stopName, "Pl. Catalunya");
	assert.equal(attempt, 2);
});

test("a fatal error is raised to the caller instead of degrading per stop", async () => {
	const fatal = Object.assign(new Error("TMB API returned 401"), { fatal: true });
	const client = fakeClient({ arrivals: { 1124: fatal, 2266: fatal } });
	const service = new ArrivalsService({
		client,
		stops: [stop("001124", 1124), stop("2266", 2266)],
		logger: silentLogger
	});

	await assert.rejects(service.collect(), (error) => error === fatal);
});

test("a fatal error on one stop still stops the whole refresh", async () => {
	const fatal = Object.assign(new Error("TMB API returned 403"), { fatal: true });
	const client = fakeClient({
		arrivals: { 1124: fatal, 2266: [{ line: "H12", "t-in-s": 60, "t-in-min": 1 }] }
	});
	const service = new ArrivalsService({
		client,
		stops: [stop("001124", 1124), stop("2266", 2266)],
		logger: silentLogger
	});

	await assert.rejects(service.collect(), (error) => error === fatal);
});

test("a fatal error is not logged as a per-stop warning", async () => {
	const warnings = [];
	const fatal = Object.assign(new Error("TMB API returned 401"), { fatal: true });
	const service = new ArrivalsService({
		client: fakeClient({ arrivals: { 1124: fatal } }),
		stops: [stop("001124", 1124)],
		logger: { warn: (message) => warnings.push(message) }
	});

	await assert.rejects(service.collect());
	assert.deepEqual(warnings, []);
});
