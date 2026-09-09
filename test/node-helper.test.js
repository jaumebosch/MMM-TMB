"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createHelper } = require("./helpers/node-helper-harness.js");

const validConfig = { appId: "id", appKey: "key", busStops: [{ busStopCode: "001124" }], refreshInterval: 60000 };
const configFor = (identifier, config = validConfig) => ({ identifier, config });

test("a CONFIG notification starts one poller for the instance", () => {
	const { helper } = createHelper();

	helper.socketNotificationReceived("MMM-TMB_CONFIG", configFor("module_1"));

	assert.equal(helper.instances.size, 1);
	assert.equal(helper.instances.get("module_1").poller.isRunning, true);
	helper.stop();
});

test("each module instance gets its own poller", () => {
	const { helper } = createHelper();

	helper.socketNotificationReceived("MMM-TMB_CONFIG", configFor("module_1"));
	helper.socketNotificationReceived("MMM-TMB_CONFIG", configFor("module_2"));

	assert.deepEqual([...helper.instances.keys()], ["module_1", "module_2"]);
	helper.stop();
});

test("reconfiguring an instance replaces its poller instead of leaking one", () => {
	const { helper } = createHelper();

	helper.socketNotificationReceived("MMM-TMB_CONFIG", configFor("module_1"));
	const first = helper.instances.get("module_1").poller;

	helper.socketNotificationReceived("MMM-TMB_CONFIG", configFor("module_1"));
	const second = helper.instances.get("module_1").poller;

	assert.notEqual(first, second);
	assert.equal(first.isRunning, false);
	assert.equal(helper.instances.size, 1);
	helper.stop();
});

test("an invalid config is rejected and logged, and starts nothing", () => {
	const { helper, logs } = createHelper();

	helper.socketNotificationReceived("MMM-TMB_CONFIG", configFor("module_1", { busStops: [] }));

	assert.equal(helper.instances.size, 0);
	assert.equal(logs.error.length, 1);
	assert.match(logs.error[0], /ERROR_MISSING_APP_ID/);
	helper.stop();
});

test("a config without an identifier is refused", () => {
	const { helper, logs } = createHelper();

	helper.socketNotificationReceived("MMM-TMB_CONFIG", { config: validConfig });

	assert.equal(helper.instances.size, 0);
	assert.match(logs.error[0], /identifier/);
	helper.stop();
});

test("unrelated notifications are ignored", () => {
	const { helper } = createHelper();

	helper.socketNotificationReceived("SOMETHING_ELSE", configFor("module_1"));
	helper.socketNotificationReceived("MMM-TMB_DATA", configFor("module_1"));

	assert.equal(helper.instances.size, 0);
	helper.stop();
});

test("stop tears down every poller", () => {
	const { helper } = createHelper();

	helper.socketNotificationReceived("MMM-TMB_CONFIG", configFor("module_1"));
	helper.socketNotificationReceived("MMM-TMB_CONFIG", configFor("module_2"));
	const pollers = [...helper.instances.values()].map((entry) => entry.poller);

	helper.stop();

	assert.equal(helper.instances.size, 0);
	assert.deepEqual(
		pollers.map((poller) => poller.isRunning),
		[false, false]
	);
});

test("a successful refresh is broadcast as DATA tagged with the identifier", async () => {
	const responses = {
		"/v1/transit/parades/1124": {
			features: [{ properties: { CODI_PARADA: "1124", NOM_PARADA: "Pl. Catalunya" } }]
		},
		"/v1/ibus/stops/1124": { data: { ibus: [{ line: "67", "t-in-s": 120, "t-in-min": 2 }] } }
	};
	const { helper, sent } = createHelper(async (url) => ({
		ok: true,
		status: 200,
		json: async () => responses[new URL(url).pathname] ?? {}
	}));

	helper.socketNotificationReceived("MMM-TMB_CONFIG", configFor("module_1"));
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));

	const data = sent.find((message) => message.notification === "MMM-TMB_DATA");
	assert.ok(data, "no DATA notification was sent");
	assert.equal(data.payload.identifier, "module_1");
	assert.deepEqual(
		data.payload.arrivals.map((arrival) => [arrival.line, arrival.stopName, arrival.seconds]),
		[["67", "Pl. Catalunya", 120]]
	);
	helper.stop();
});

test("a failing refresh is broadcast as ERROR without leaking the credentials", async () => {
	const { helper, sent } = createHelper(async () => {
		throw new Error("ECONNREFUSED");
	});

	helper.socketNotificationReceived("MMM-TMB_CONFIG", configFor("module_1"));
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));

	// Per-stop failures degrade into a DATA snapshot carrying `errors`.
	const data = sent.find((message) => message.notification === "MMM-TMB_DATA");
	assert.ok(data);
	assert.equal(data.payload.arrivals.length, 0);
	assert.equal(data.payload.errors.length, 1);
	assert.doesNotMatch(JSON.stringify(sent), /"key"|app_key/);
	helper.stop();
});

test("rejected credentials stop the poller and are reported as such", async () => {
	const { helper, sent, logs } = createHelper(async () => ({
		ok: false,
		status: 401,
		headers: { get: () => null },
		json: async () => ({})
	}));

	helper.socketNotificationReceived("MMM-TMB_CONFIG", configFor("module_1"));
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));

	const error = sent.find((message) => message.notification === "MMM-TMB_ERROR");
	assert.ok(error, "no ERROR notification was sent");
	assert.equal(error.payload.key, "ERROR_CREDENTIALS_REJECTED");
	assert.equal(error.payload.identifier, "module_1");
	assert.equal(helper.instances.get("module_1").poller.isRunning, false);
	assert.ok(logs.error.some((line) => /Polling stopped/.test(line)));
	helper.stop();
});

test("a recoverable failure keeps the poller alive", async () => {
	const { helper, sent } = createHelper(async () => ({
		ok: false,
		status: 503,
		headers: { get: () => null },
		json: async () => ({})
	}));

	helper.socketNotificationReceived("MMM-TMB_CONFIG", configFor("module_1"));
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));

	// 503 degrades per stop, so it arrives as a DATA snapshot carrying errors.
	assert.ok(sent.some((message) => message.notification === "MMM-TMB_DATA"));
	assert.equal(helper.instances.get("module_1").poller.isRunning, true);
	helper.stop();
});
