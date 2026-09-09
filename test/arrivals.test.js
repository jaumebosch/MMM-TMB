"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { URGENCY, classify, sort, fromApiEntry, project } = require("../src/shared/arrivals.js");

const thresholds = { imminentTime: 60, blinkingTime: 300, warningTime: 600 };
const context = { stopCode: "001124", stopName: "Pl. Catalunya", line: null };

test("classify buckets arrivals on the threshold boundaries", () => {
	assert.equal(classify(0, thresholds), URGENCY.IMMINENT);
	assert.equal(classify(60, thresholds), URGENCY.IMMINENT);
	assert.equal(classify(61, thresholds), URGENCY.BLINKING);
	assert.equal(classify(300, thresholds), URGENCY.BLINKING);
	assert.equal(classify(301, thresholds), URGENCY.WARNING);
	assert.equal(classify(600, thresholds), URGENCY.WARNING);
	assert.equal(classify(601, thresholds), URGENCY.NORMAL);
});

test("classify falls back to normal for non-numeric input", () => {
	assert.equal(classify(Number.NaN, thresholds), URGENCY.NORMAL);
	assert.equal(classify(undefined, thresholds), URGENCY.NORMAL);
});

test("sort orders by time, then line, then stop, without mutating the input", () => {
	const input = [
		{ seconds: 300, line: "H12", stopCode: "2" },
		{ seconds: 60, line: "67", stopCode: "1" },
		{ seconds: 300, line: "7", stopCode: "1" }
	];
	const snapshot = JSON.stringify(input);

	assert.deepEqual(
		sort(input).map((a) => [a.seconds, a.line]),
		[
			[60, "67"],
			[300, "7"],
			[300, "H12"]
		]
	);
	assert.equal(JSON.stringify(input), snapshot);
});

test("fromApiEntry maps the TMB payload to the module shape", () => {
	assert.deepEqual(fromApiEntry({ line: "67", "t-in-s": 125, "t-in-min": 2, destination: "Barceloneta" }, context), {
		line: "67",
		destination: "Barceloneta",
		stopCode: "001124",
		stopName: "Pl. Catalunya",
		seconds: 125,
		minutes: 2
	});
});

test("fromApiEntry prefers the configured line over the one reported by the API", () => {
	const entry = fromApiEntry({ line: undefined, "t-in-s": 60 }, { ...context, line: "H12" });
	assert.equal(entry.line, "H12");
});

test("fromApiEntry derives minutes when the API omits them", () => {
	assert.equal(fromApiEntry({ line: "67", "t-in-s": 100 }, context).minutes, 2);
});

test("fromApiEntry rejects entries without a usable arrival time", () => {
	for (const entry of [null, {}, { "t-in-s": "soon" }, { "t-in-s": -5 }]) {
		assert.equal(fromApiEntry(entry, context), null);
	}
});

test("project counts down from the capture time", () => {
	const capturedAt = 1_700_000_000_000;
	const list = [{ seconds: 300, minutes: 5 }];
	assert.deepEqual(project(list, capturedAt, capturedAt + 120_000), [{ seconds: 180, minutes: 3 }]);
});

test("project keeps buses inside the 30s grace period and drops the stale ones", () => {
	const capturedAt = 1_700_000_000_000;
	const list = [{ seconds: 10 }, { seconds: 100 }];

	// 10s bus is 25s overdue: still within the grace period.
	assert.deepEqual(project(list, capturedAt, capturedAt + 35_000), [
		{ seconds: -25, minutes: 0 },
		{ seconds: 65, minutes: 1 }
	]);

	// 45s later it is 35s overdue and gets dropped.
	assert.deepEqual(project(list, capturedAt, capturedAt + 45_000), [{ seconds: 55, minutes: 1 }]);
});

test("project never reports negative minutes", () => {
	const capturedAt = 1_700_000_000_000;
	assert.equal(project([{ seconds: 5 }], capturedAt, capturedAt + 25_000)[0].minutes, 0);
});
