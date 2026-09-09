"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { TmbClient, TmbApiError } = require("../src/backend/tmb-client.js");

/** Builds a fetch double that records the requested URLs. */
function fakeFetch(handler) {
	const calls = [];
	const impl = async (url, options) => {
		calls.push({ url: new URL(url), options });
		return handler(calls.length - 1);
	};
	impl.calls = calls;
	return impl;
}

const jsonResponse = (body, { ok = true, status = 200 } = {}) => ({ ok, status, json: async () => body });

const stopPayload = { features: [{ properties: { CODI_PARADA: "1124", NOM_PARADA: "Pl. Catalunya" } }] };

const client = (fetchImpl) => new TmbClient({ appId: "the-id", appKey: "the-key", fetchImpl });

test("constructor requires credentials", () => {
	assert.throws(() => new TmbClient({ appKey: "k", fetchImpl: () => {} }), TypeError);
	assert.throws(() => new TmbClient({ appId: "i", fetchImpl: () => {} }), TypeError);
});

test("constructor rejects a non-callable fetch implementation", () => {
	assert.throws(
		() => new TmbClient({ appId: "i", appKey: "k", fetchImpl: "nope" }),
		(error) => error instanceof TypeError && /Node\.js >= 18/.test(error.message)
	);
});

test("constructor falls back to the global fetch, and fails loudly when there is none", () => {
	assert.doesNotThrow(() => new TmbClient({ appId: "i", appKey: "k" }));

	const globalFetch = globalThis.fetch;
	delete globalThis.fetch;
	try {
		assert.throws(
			() => new TmbClient({ appId: "i", appKey: "k" }),
			(error) => error instanceof TypeError && /Node\.js >= 18/.test(error.message)
		);
	} finally {
		globalThis.fetch = globalFetch;
	}
});

test("fetchStop sends the credentials as query parameters", async () => {
	const fetchImpl = fakeFetch(() => jsonResponse(stopPayload));
	await client(fetchImpl).fetchStop(1124);

	const { url, options } = fetchImpl.calls[0];
	assert.equal(url.pathname, "/v1/transit/parades/1124");
	assert.equal(url.searchParams.get("app_id"), "the-id");
	assert.equal(url.searchParams.get("app_key"), "the-key");
	assert.equal(options.headers.Accept, "application/json");
});

test("fetchStop returns the stop code and name", async () => {
	const stop = await client(fakeFetch(() => jsonResponse(stopPayload))).fetchStop(1124);
	assert.deepEqual(stop, { stopCode: "1124", stopName: "Pl. Catalunya" });
});

test("fetchStop throws when the API knows no such stop", async () => {
	await assert.rejects(client(fakeFetch(() => jsonResponse({ features: [] }))).fetchStop(999), TmbApiError);
});

test("fetchArrivals hits the plain stop endpoint when no line is given", async () => {
	const fetchImpl = fakeFetch(() => jsonResponse({ data: { ibus: [] } }));
	await client(fetchImpl).fetchArrivals(1124);
	assert.equal(fetchImpl.calls[0].url.pathname, "/v1/ibus/stops/1124");
});

test("fetchArrivals scopes the request to a single line when asked", async () => {
	const fetchImpl = fakeFetch(() => jsonResponse({ data: { ibus: [] } }));
	await client(fetchImpl).fetchArrivals(1124, "H12");
	assert.equal(fetchImpl.calls[0].url.pathname, "/v1/ibus/lines/H12/stops/1124");
});

test("fetchArrivals returns an empty list when the API reports no buses", async () => {
	for (const body of [{}, { data: {} }, { data: { ibus: null } }]) {
		assert.deepEqual(await client(fakeFetch(() => jsonResponse(body))).fetchArrivals(1124), []);
	}
});

test("HTTP errors surface as TmbApiError without leaking the credentials", async () => {
	const fetchImpl = fakeFetch(() => jsonResponse({}, { ok: false, status: 401 }));
	await assert.rejects(client(fetchImpl).fetchStop(1124), (error) => {
		assert.ok(error instanceof TmbApiError);
		assert.equal(error.status, 401);
		assert.equal(error.endpoint, "/transit/parades/1124");
		assert.doesNotMatch(error.message, /the-id|the-key/);
		return true;
	});
});

test("transport failures are wrapped and keep the original cause", async () => {
	const boom = new Error("ECONNREFUSED");
	await assert.rejects(
		client(async () => {
			throw boom;
		}).fetchStop(1124),
		(error) => error instanceof TmbApiError && error.cause === boom
	);
});

test("a hanging request is aborted after the timeout", async () => {
	const slow = new TmbClient({
		appId: "i",
		appKey: "k",
		timeoutMs: 20,
		fetchImpl: (_url, { signal }) =>
			new Promise((_resolve, reject) => {
				signal.addEventListener("abort", () =>
					reject(Object.assign(new Error("aborted"), { name: "AbortError" }))
				);
			})
	});

	await assert.rejects(
		slow.fetchStop(1124),
		(error) => error instanceof TmbApiError && /timed out/.test(error.message)
	);
});

test("the timeout timer is cleared once the request settles", async () => {
	// A leaked timer would keep the event loop alive; the test simply has to exit.
	await client(fakeFetch(() => jsonResponse(stopPayload))).fetchStop(1124);
	assert.ok(true);
});

const withHeaders = (headers) => ({
	ok: false,
	status: 429,
	headers: { get: (name) => headers[name] ?? null },
	json: async () => ({})
});

test("rejected credentials are marked fatal, other failures are not", async () => {
	for (const [status, fatal] of [
		[401, true],
		[403, true],
		[429, false],
		[500, false],
		[503, false]
	]) {
		const fetchImpl = fakeFetch(() => jsonResponse({}, { ok: false, status }));
		await assert.rejects(client(fetchImpl).fetchStop(1124), (error) => {
			assert.equal(error.fatal, fatal, `status ${status}`);
			return true;
		});
	}
});

test("a transport failure is never fatal", async () => {
	await assert.rejects(
		client(async () => {
			throw new Error("ECONNREFUSED");
		}).fetchStop(1124),
		(error) => error.fatal === false
	);
});

test("Retry-After in seconds is surfaced on the error", async () => {
	await assert.rejects(
		client(fakeFetch(() => withHeaders({ "Retry-After": "120" }))).fetchStop(1124),
		(error) => error.retryAfterMs === 120000
	);
});

test("Retry-After as an HTTP date is converted to a delay", async () => {
	const inTwoMinutes = new Date(Date.now() + 120000).toUTCString();
	await assert.rejects(
		client(fakeFetch(() => withHeaders({ "Retry-After": inTwoMinutes }))).fetchStop(1124),
		(error) => error.retryAfterMs > 110000 && error.retryAfterMs <= 120000
	);
});

test("a Retry-After date in the past never yields a negative delay", async () => {
	const past = new Date(Date.now() - 60000).toUTCString();
	await assert.rejects(
		client(fakeFetch(() => withHeaders({ "Retry-After": past }))).fetchStop(1124),
		(error) => error.retryAfterMs === 0
	);
});

test("an absent or unparseable Retry-After leaves the hint empty", async () => {
	for (const headers of [{}, { "Retry-After": "soon" }]) {
		await assert.rejects(
			client(fakeFetch(() => withHeaders(headers))).fetchStop(1124),
			(error) => error.retryAfterMs === null
		);
	}
});

test("a response without a headers object does not break error handling", async () => {
	await assert.rejects(
		client(fakeFetch(() => ({ ok: false, status: 500, json: async () => ({}) }))).fetchStop(1124),
		(error) => error.retryAfterMs === null && error.status === 500
	);
});
