"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { Poller } = require("../src/backend/poller.js");

/** Lets pending promise callbacks run without advancing real time. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

/**
 * A deterministic `setTimeout` replacement: timers are recorded and only fire
 * when the test calls `tick()`.
 */
function createClock() {
	const pending = new Map();
	const delays = [];
	let nextId = 1;
	let cleared = 0;

	return {
		delays,
		get cleared() {
			return cleared;
		},
		get pendingCount() {
			return pending.size;
		},
		timers: {
			setTimeout(fn, delay) {
				const id = nextId++;
				pending.set(id, fn);
				delays.push(delay);
				return id;
			},
			clearTimeout(id) {
				if (pending.delete(id)) {
					cleared += 1;
				}
			}
		},
		/** Fires every pending timer, then drains the microtask queue. */
		async tick() {
			for (const [id, fn] of [...pending]) {
				pending.delete(id);
				fn();
			}
			await flush();
		}
	};
}

function build(task, overrides = {}) {
	const clock = createClock();
	const results = [];
	const errors = [];
	const poller = new Poller({
		task,
		intervalMs: 60000,
		retryDelayMs: 5000,
		onResult: (value) => results.push(value),
		onError: (error) => errors.push(error),
		timers: clock.timers,
		...overrides
	});
	return { poller, clock, results, errors };
}

test("start runs the task immediately and schedules the next run", async () => {
	const { poller, clock, results } = build(async () => "snapshot");

	poller.start();
	await flush();

	assert.deepEqual(results, ["snapshot"]);
	assert.deepEqual(clock.delays, [60000]);
	poller.stop();
});

test("start is idempotent and does not double-schedule", async () => {
	const { poller, clock } = build(async () => "x");

	poller.start();
	poller.start();
	await flush();

	assert.equal(clock.pendingCount, 1);
	assert.deepEqual(clock.delays, [60000]);
	poller.stop();
});

test("consecutive failures back off exponentially, capped at the interval", async () => {
	const { poller, clock, errors } = build(async () => {
		throw new Error("nope");
	});

	poller.start();
	await flush();
	for (let i = 0; i < 5; i += 1) {
		await clock.tick();
	}

	assert.equal(errors.length, 6);
	assert.deepEqual(clock.delays, [5000, 10000, 20000, 40000, 60000, 60000]);
	poller.stop();
});

test("a successful run resets the back-off", async () => {
	let shouldFail = true;
	const { poller, clock } = build(async () => {
		if (shouldFail) {
			throw new Error("nope");
		}
		return "ok";
	});

	poller.start();
	await flush();
	await clock.tick();
	shouldFail = false;
	await clock.tick();

	assert.deepEqual(clock.delays, [5000, 10000, 60000]);
	poller.stop();
});

test("no timer is pending while a run is in flight, so runs cannot overlap", async () => {
	let release;
	const { poller, clock } = build(
		() =>
			new Promise((resolve) => {
				release = resolve;
			})
	);

	poller.start();
	await flush();
	assert.equal(clock.pendingCount, 0, "a timer was armed before the run finished");

	release("done");
	await flush();
	assert.equal(clock.pendingCount, 1);
	poller.stop();
});

test("stop cancels the pending timer and silences a late result", async () => {
	let release;
	const { poller, clock, results } = build(
		() =>
			new Promise((resolve) => {
				release = resolve;
			})
	);

	poller.start();
	await flush();
	poller.stop();
	release("late");
	await flush();

	assert.deepEqual(results, []);
	assert.equal(clock.pendingCount, 0);
	assert.equal(poller.isRunning, false);
});

test("stop clears an armed timer", async () => {
	const { poller, clock } = build(async () => "x");

	poller.start();
	await flush();
	assert.equal(clock.pendingCount, 1);

	poller.stop();
	assert.equal(clock.cleared, 1);
	assert.equal(clock.pendingCount, 0);
});

test("stop is safe to call when nothing is running", () => {
	const { poller } = build(async () => "x");
	assert.doesNotThrow(() => poller.stop());
	assert.doesNotThrow(() => poller.stop());
	assert.equal(poller.isRunning, false);
});

test("restarting after a stop resumes polling from a clean back-off", async () => {
	let shouldFail = true;
	const { poller, clock, results } = build(async () => {
		if (shouldFail) {
			throw new Error("nope");
		}
		return "ok";
	});

	poller.start();
	await flush();
	poller.stop();

	shouldFail = false;
	poller.start();
	await flush();

	assert.deepEqual(results, ["ok"]);
	assert.deepEqual(clock.delays, [5000, 60000]);
	poller.stop();
});

test("a fatal error stops the poller instead of retrying forever", async () => {
	const fatal = Object.assign(new Error("401"), { fatal: true });
	const { poller, clock, errors } = build(
		async () => {
			throw fatal;
		},
		{ isFatal: (error) => error?.fatal === true }
	);

	poller.start();
	await flush();

	assert.deepEqual(errors, [fatal]);
	assert.equal(poller.isRunning, false);
	assert.equal(clock.pendingCount, 0, "a retry was scheduled for an unrecoverable error");
});

test("a Retry-After hint wins over the exponential back-off", async () => {
	let hint = 90000;
	const { poller, clock } = build(async () => {
		throw Object.assign(new Error("429"), { retryAfterMs: hint });
	});

	poller.start();
	await flush();
	hint = 1000;
	await clock.tick();

	// First failure: 90s hint beats the 5s back-off. Second: the 10s back-off
	// beats the 1s hint.
	assert.deepEqual(clock.delays, [90000, 10000]);
	poller.stop();
});

test("an absurd Retry-After is capped at an hour", async () => {
	const { poller, clock } = build(async () => {
		throw Object.assign(new Error("429"), { retryAfterMs: 99999999 });
	});

	poller.start();
	await flush();

	assert.deepEqual(clock.delays, [3600000]);
	poller.stop();
});

test("a Retry-After hint does not survive the next failure", async () => {
	let hint = 90000;
	const { poller, clock } = build(async () => {
		throw Object.assign(new Error("boom"), { retryAfterMs: hint });
	});

	poller.start();
	await flush();
	hint = undefined;
	await clock.tick();

	assert.deepEqual(clock.delays, [90000, 10000]);
	poller.stop();
});
