"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { DEFAULTS } = require("../src/shared/config.js");
const { loadDefinition, createInstance, plain } = require("./helpers/module-harness.js");

const validConfig = { appId: "id", appKey: "key", busStops: [{ busStopCode: "001124" }] };

test("the inline defaults stay in sync with src/shared/config.js", () => {
	// MagicMirror reads `defaults` before getScripts() dependencies load, so the
	// literal cannot be imported. This test is what keeps the copy honest.
	assert.deepEqual(plain(loadDefinition().defaults), plain(DEFAULTS));
});

test("declared scripts, styles and translations point at files that exist", () => {
	const fs = require("node:fs");
	const path = require("node:path");
	const definition = loadDefinition();
	const instance = createInstance(validConfig);

	const referenced = [
		...definition.getScripts.call(instance),
		...definition.getStyles.call(instance).filter((file) => file.startsWith("modules/")),
		...Object.values(definition.getTranslations.call(instance))
	].map((file) => file.replace(/^modules\/MMM-TMB\//, ""));

	for (const file of referenced) {
		assert.ok(fs.existsSync(path.join(__dirname, "..", file)), `missing file: ${file}`);
	}
	instance.dispose();
});

test("a valid config is sent to the node helper, tagged with the instance identifier", () => {
	const instance = createInstance(validConfig);
	instance.start();

	assert.equal(instance.sent.length, 1);
	assert.equal(instance.sent[0].notification, "MMM-TMB_CONFIG");
	assert.equal(instance.sent[0].payload.identifier, "module_1_MMM-TMB");
	assert.deepEqual(plain(instance.sent[0].payload.config.busStops), [
		{ busStopCode: "001124", apiCode: 1124, busLine: null }
	]);
	instance.dispose();
});

test("an invalid config never reaches the node helper", () => {
	const instance = createInstance({});
	instance.start();

	assert.deepEqual(instance.sent, []);
	assert.equal(instance.problems.length, 3);
	assert.match(instance.getDom().textContent, /ERROR_MISSING_APP_ID/);
	instance.dispose();
});

test("snapshots addressed to another instance are ignored", () => {
	const instance = createInstance(validConfig);
	instance.start();

	instance.socketNotificationReceived("MMM-TMB_DATA", {
		identifier: "module_9_MMM-TMB",
		capturedAt: Date.now(),
		arrivals: [{ line: "67", stopCode: "001124", stopName: "X", seconds: 60, minutes: 1 }],
		errors: []
	});

	assert.equal(instance.loaded, false);
	assert.deepEqual(instance.domUpdates, []);
	instance.dispose();
});

test("a snapshot for this instance is stored and rendered", () => {
	const instance = createInstance(validConfig);
	instance.start();

	instance.socketNotificationReceived("MMM-TMB_DATA", {
		identifier: instance.identifier,
		capturedAt: Date.now(),
		arrivals: [{ line: "H12", stopCode: "001124", stopName: "Pl. Catalunya", seconds: 120, minutes: 2 }],
		errors: []
	});

	assert.equal(instance.loaded, true);
	assert.deepEqual(instance.domUpdates, [instance.config.animationSpeed]);
	assert.match(instance.getDom().textContent, /H12/);
	instance.dispose();
});

test("per-stop errors reported alongside data surface only when there is nothing to show", () => {
	const instance = createInstance(validConfig);
	instance.start();

	instance.socketNotificationReceived("MMM-TMB_DATA", {
		identifier: instance.identifier,
		capturedAt: Date.now(),
		arrivals: [],
		errors: [{ stopCode: "001124", message: "upstream down" }]
	});

	assert.equal(instance.errorKey, "ERROR_UNAVAILABLE");
	assert.match(instance.getDom().textContent, /ERROR_UNAVAILABLE/);
	instance.dispose();
});

test("countdowns are projected forward between backend refreshes", () => {
	const instance = createInstance(validConfig);
	instance.start();

	instance.socketNotificationReceived("MMM-TMB_DATA", {
		identifier: instance.identifier,
		capturedAt: Date.now() - 120_000,
		arrivals: [{ line: "67", stopCode: "001124", stopName: "X", seconds: 300, minutes: 5 }],
		errors: []
	});

	assert.match(instance.getDom().textContent, /"minutes":3/);
	instance.dispose();
});

test("suspend stops the local ticker and resume restarts it", () => {
	const instance = createInstance(validConfig);
	instance.start();
	assert.notEqual(instance.ticker, null);

	instance.suspend();
	assert.equal(instance.ticker, null);

	instance.resume();
	assert.notEqual(instance.ticker, null);
	instance.dispose();
});

test("the header falls back to the translated default and honours a user override", () => {
	const instance = createInstance(validConfig);
	assert.equal(instance.getHeader(), "HEADER");

	instance.data.header = "Mi parada";
	assert.equal(instance.getHeader(), "Mi parada");
	instance.dispose();
});

test("a tick that changes nothing visible does not rebuild the DOM", () => {
	const instance = createInstance(validConfig);
	instance.start();
	instance.socketNotificationReceived("MMM-TMB_DATA", {
		identifier: instance.identifier,
		capturedAt: Date.now(),
		arrivals: [{ line: "67", stopCode: "001124", stopName: "X", seconds: 900, minutes: 15 }],
		errors: []
	});
	instance.getDom();
	const before = instance.domUpdates.length;

	instance.tick();
	instance.tick();

	assert.equal(instance.domUpdates.length, before);
	instance.dispose();
});

test("a tick that rolls the countdown over rebuilds the DOM", () => {
	const instance = createInstance(validConfig);
	instance.start();
	instance.socketNotificationReceived("MMM-TMB_DATA", {
		identifier: instance.identifier,
		// Captured 45s ago: the displayed minute has moved since the last render.
		capturedAt: Date.now() - 45_000,
		arrivals: [{ line: "67", stopCode: "001124", stopName: "X", seconds: 900, minutes: 15 }],
		errors: []
	});
	instance.getDom();
	instance.snapshot = { ...instance.snapshot, capturedAt: Date.now() - 105_000 };
	const before = instance.domUpdates.length;

	instance.tick();

	assert.equal(instance.domUpdates.length, before + 1);
	instance.dispose();
});

test("no DOM rebuild is attempted while still loading", () => {
	const instance = createInstance(validConfig);
	instance.start();
	instance.getDom(); // MagicMirror renders once at start-up

	instance.tick();
	instance.tick();

	assert.deepEqual(instance.domUpdates, []);
	instance.dispose();
});

test("a snapshot older than three refresh intervals is treated as stale", () => {
	const instance = createInstance(validConfig);
	instance.start();
	const arrivals = [{ line: "67", stopCode: "001124", stopName: "X", seconds: 3600, minutes: 60 }];

	instance.socketNotificationReceived("MMM-TMB_DATA", {
		identifier: instance.identifier,
		capturedAt: Date.now() - 2 * instance.config.refreshInterval,
		arrivals,
		errors: []
	});
	assert.equal(instance.isStale(), false);
	assert.match(instance.getDom().textContent, /67/);

	instance.snapshot = { ...instance.snapshot, capturedAt: Date.now() - 4 * instance.config.refreshInterval };
	assert.equal(instance.isStale(), true);
	assert.match(instance.getDom().textContent, /ERROR_STALE/);
	instance.dispose();
});

test("going stale rebuilds the DOM on the next tick", () => {
	const instance = createInstance(validConfig);
	instance.start();
	instance.socketNotificationReceived("MMM-TMB_DATA", {
		identifier: instance.identifier,
		capturedAt: Date.now(),
		arrivals: [{ line: "67", stopCode: "001124", stopName: "X", seconds: 3600, minutes: 60 }],
		errors: []
	});
	instance.getDom();
	const before = instance.domUpdates.length;

	instance.snapshot = { ...instance.snapshot, capturedAt: Date.now() - 4 * instance.config.refreshInterval };
	instance.tick();

	assert.equal(instance.domUpdates.length, before + 1);
	instance.dispose();
});

test("nothing is stale before the first snapshot arrives", () => {
	const instance = createInstance(validConfig);
	instance.start();
	instance.snapshot = { capturedAt: 0, arrivals: [] };

	assert.equal(instance.isStale(), false);
	assert.equal(instance.getDom().textContent, "LOADING");
	instance.dispose();
});

test("a fatal error from the helper is shown and ends the loading state", () => {
	const instance = createInstance(validConfig);
	instance.start();

	instance.socketNotificationReceived("MMM-TMB_ERROR", {
		identifier: instance.identifier,
		key: "ERROR_CREDENTIALS_REJECTED",
		message: "TMB API returned 401"
	});

	assert.equal(instance.errorKey, "ERROR_CREDENTIALS_REJECTED");
	assert.match(instance.getDom().textContent, /ERROR_CREDENTIALS_REJECTED/);
	instance.dispose();
});
