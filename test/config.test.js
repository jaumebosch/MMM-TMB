"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
	DEFAULTS,
	ERRORS,
	normalizeConfig,
	validateConfig,
	normalizeStopCode,
	normalizeLine
} = require("../src/shared/config.js");

const validConfig = { appId: "id", appKey: "key", busStops: [{ busStopCode: "001124" }] };
const keysOf = (config) => validateConfig(config).map((problem) => problem.key);

test("normalizeStopCode strips leading zeroes and keeps the printed code", () => {
	assert.deepEqual(normalizeStopCode("001124"), { code: "001124", apiCode: 1124 });
	assert.deepEqual(normalizeStopCode(2266), { code: "2266", apiCode: 2266 });
});

test("normalizeStopCode rejects anything that is not a positive stop code", () => {
	for (const value of ["", "  ", "12a", "-5", "0", "12345678", null, undefined, {}]) {
		assert.equal(normalizeStopCode(value), null, `expected ${JSON.stringify(value)} to be rejected`);
	}
});

test("normalizeLine upper-cases and trims, mapping empty values to null", () => {
	assert.equal(normalizeLine(" h12 "), "H12");
	assert.equal(normalizeLine(67), "67");
	assert.equal(normalizeLine(""), null);
	assert.equal(normalizeLine(undefined), null);
});

test("validateConfig reports every missing required option", () => {
	assert.deepEqual(keysOf({}), [ERRORS.MISSING_APP_ID, ERRORS.MISSING_APP_KEY, ERRORS.MISSING_BUS_STOPS]);
});

test("validateConfig accepts a minimal valid configuration", () => {
	assert.deepEqual(validateConfig(validConfig), []);
});

test("validateConfig reports each malformed bus stop individually", () => {
	const problems = validateConfig({ ...validConfig, busStops: [{ busStopCode: "nope" }, { busStopCode: "" }] });
	assert.deepEqual(
		problems.map((problem) => problem.key),
		[ERRORS.INVALID_BUS_STOP, ERRORS.INVALID_BUS_STOP]
	);
	assert.equal(problems[0].variables.value, "nope");
});

test("validateConfig reports out-of-range numeric options", () => {
	const problems = validateConfig({ ...validConfig, refreshInterval: 10 });
	assert.equal(problems.length, 1);
	assert.equal(problems[0].key, ERRORS.INVALID_NUMBER);
	assert.equal(problems[0].variables.option, "refreshInterval");
});

test("validateConfig enforces imminentTime <= blinkingTime <= warningTime", () => {
	assert.ok(keysOf({ ...validConfig, blinkingTime: 900 }).includes(ERRORS.INVALID_THRESHOLDS));
	assert.ok(keysOf({ ...validConfig, imminentTime: 400 }).includes(ERRORS.INVALID_THRESHOLDS));
	assert.deepEqual(keysOf({ ...validConfig, imminentTime: 300, blinkingTime: 300, warningTime: 300 }), []);
});

test("normalizeConfig clamps numbers into their allowed range", () => {
	const config = normalizeConfig({ ...validConfig, refreshInterval: 10, maxEntries: 999 });
	assert.equal(config.refreshInterval, 10000);
	assert.equal(config.maxEntries, 50);
});

test("normalizeConfig drops invalid stops and keeps the valid ones", () => {
	const config = normalizeConfig({
		...validConfig,
		busStops: [{ busStopCode: "001124", busLine: "h12" }, { busStopCode: "x" }]
	});
	assert.deepEqual(config.busStops, [{ busStopCode: "001124", apiCode: 1124, busLine: "H12" }]);
});

test("normalizeConfig accepts bare stop codes as array entries", () => {
	assert.deepEqual(normalizeConfig({ ...validConfig, busStops: ["2266"] }).busStops, [
		{ busStopCode: "2266", apiCode: 2266, busLine: null }
	]);
});

test("normalizeConfig tolerates a missing or non-object config", () => {
	for (const value of [undefined, null, "nope"]) {
		assert.deepEqual(normalizeConfig(value).busStops, []);
		assert.equal(normalizeConfig(value).refreshInterval, DEFAULTS.refreshInterval);
	}
});

test("normalizeConfig is idempotent", () => {
	// The config is normalised in the browser, sent over the socket, and
	// normalised again by the node helper. The second pass must be a no-op.
	const once = normalizeConfig({ ...validConfig, busStops: [{ busStopCode: "001124", busLine: "h12" }] });
	assert.deepEqual(normalizeConfig(once), once);
});

test("validateConfig accepts its own normalised output", () => {
	assert.deepEqual(validateConfig(normalizeConfig(validConfig)), []);
});
