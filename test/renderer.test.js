"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const renderer = require("../src/frontend/renderer.js");
const { normalizeConfig } = require("../src/shared/config.js");
const { createDocument, flatten, byClass } = require("./helpers/fake-dom.js");

const config = normalizeConfig({ appId: "i", appKey: "k", busStops: [{ busStopCode: "001124" }] });

/** Echoes the key plus its variables, so assertions stay language-agnostic. */
const translate = (key, variables) =>
	variables && Object.keys(variables).length > 0 ? `${key}:${JSON.stringify(variables)}` : key;

const context = (overrides = {}) => ({ document: createDocument(), translate, config, ...overrides });

const arrival = (overrides = {}) => ({
	line: "67",
	stopCode: "001124",
	stopName: "Pl. Catalunya",
	seconds: 900,
	minutes: 15,
	...overrides
});

const state = (overrides = {}) => ({
	problems: [],
	loaded: true,
	stale: false,
	errorKey: null,
	arrivals: [],
	...overrides
});

test("configuration problems take precedence over everything else", () => {
	const dom = renderer.render(
		context(),
		state({ loaded: false, problems: [{ key: "ERROR_MISSING_APP_ID", variables: {} }] })
	);
	assert.match(dom.textContent, /ERROR_MISSING_APP_ID/);
});

test("every configuration problem is listed", () => {
	const dom = renderer.render(
		context(),
		state({
			problems: [
				{ key: "ERROR_MISSING_APP_ID", variables: {} },
				{ key: "ERROR_MISSING_APP_KEY", variables: {} }
			]
		})
	);
	assert.equal(dom.children.length, 2);
});

test("the loading state is shown until the first snapshot arrives", () => {
	assert.equal(renderer.render(context(), state({ loaded: false })).textContent, "LOADING");
});

test("an empty snapshot renders the friendly empty state", () => {
	assert.equal(renderer.render(context(), state()).textContent, "NO_BUSES");
});

test("an empty snapshot after a transport error says so instead", () => {
	assert.equal(renderer.render(context(), state({ errorKey: "ERROR_UNAVAILABLE" })).textContent, "ERROR_UNAVAILABLE");
});

test("rejected credentials are reported with their own message", () => {
	assert.equal(
		renderer.render(context(), state({ errorKey: "ERROR_CREDENTIALS_REJECTED" })).textContent,
		"ERROR_CREDENTIALS_REJECTED"
	);
});

test("a stale snapshot is called out instead of counting down from old data", () => {
	const dom = renderer.render(context(), state({ stale: true, arrivals: [arrival()] }));
	assert.equal(dom.textContent, "ERROR_STALE");
});

test("a stale snapshot caused by a known error reports that error instead", () => {
	const dom = renderer.render(context(), state({ stale: true, errorKey: "ERROR_CREDENTIALS_REJECTED" }));
	assert.equal(dom.textContent, "ERROR_CREDENTIALS_REJECTED");
});

test("the destination column is off by default and rendered when enabled", () => {
	const withDestination = { ...config, showDestination: true };
	const list = [arrival({ destination: "Barceloneta" })];

	assert.equal(renderer.render(context(), state({ arrivals: list })).children[0].children.length, 3);

	const dom = renderer.render(context({ config: withDestination }), state({ arrivals: list }));
	assert.equal(dom.children[0].children.length, 4);
	assert.equal(byClass(dom, "MMM-TMB-destination")[0].textContent, "Barceloneta");
});

test("a missing destination collapses to an empty cell, keeping the columns aligned", () => {
	const dom = renderer.render(
		context({ config: { ...config, showDestination: true } }),
		state({ arrivals: [arrival({ destination: null })] })
	);

	assert.equal(dom.children[0].children.length, 4);
	assert.equal(byClass(dom, "MMM-TMB-destination")[0].textContent, "");
});

test("arrivals render as line / stop / time", () => {
	const dom = renderer.render(context(), state({ arrivals: [arrival()] }));
	const cells = dom.children[0].children;

	assert.equal(cells.length, 3);
	assert.equal(cells[0].textContent, "67");
	assert.equal(cells[1].textContent, "Pl. Catalunya");
	assert.equal(cells[2].textContent, 'MINUTES:{"minutes":15}');
});

test("showStopName: false drops the stop column", () => {
	const dom = renderer.render(
		context({ config: { ...config, showStopName: false } }),
		state({ arrivals: [arrival()] })
	);
	assert.equal(dom.children[0].children.length, 2);
});

test("maxEntries caps the number of rendered rows", () => {
	const arrivals = Array.from({ length: 12 }, (_, i) => arrival({ seconds: 60 * i }));
	const dom = renderer.render(context({ config: { ...config, maxEntries: 3 } }), state({ arrivals }));
	assert.equal(dom.children.length, 3);
});

test("urgency drives the CSS class of the time cell", () => {
	const cases = [
		[30, "MMM-TMB-imminent"],
		[200, "MMM-TMB-blinking"],
		[500, "MMM-TMB-warning"],
		[900, "MMM-TMB-normal"]
	];

	for (const [seconds, expected] of cases) {
		const dom = renderer.render(context(), state({ arrivals: [arrival({ seconds })] }));
		assert.equal(byClass(dom, expected).length, 1, `expected ${expected} for ${seconds}s`);
	}
});

test("an imminent bus shows the word instead of a countdown", () => {
	const dom = renderer.render(context(), state({ arrivals: [arrival({ seconds: 20, minutes: 0 })] }));
	assert.equal(byClass(dom, "MMM-TMB-time")[0].textContent, "IMMINENT");
});

test("stop names from the API are rendered as text, never as markup", () => {
	const hostile = '<img src=x onerror="alert(1)">';
	const dom = renderer.render(context(), state({ arrivals: [arrival({ stopName: hostile, line: hostile })] }));

	// The fake DOM throws on innerHTML, so reaching this point already proves it;
	// assert the payload survives verbatim as text too.
	assert.equal(byClass(dom, "MMM-TMB-stop")[0].textContent, hostile);
	assert.equal(byClass(dom, "MMM-TMB-line")[0].textContent, hostile);
});

test("every rendered node is a real element with a class we own", () => {
	const dom = renderer.render(context(), state({ arrivals: [arrival()] }));
	assert.equal(dom.tagName, "table");
	assert.ok(flatten(dom).every((node) => typeof node.tagName === "string"));
});

test("fingerprint is stable while nothing visible changes", () => {
	const now = arrival({ seconds: 300, minutes: 5 });
	const twoSecondsLater = arrival({ seconds: 298, minutes: 5 });

	assert.equal(
		renderer.fingerprint(config, state({ arrivals: [now] })),
		renderer.fingerprint(config, state({ arrivals: [twoSecondsLater] }))
	);
});

test("fingerprint changes when the displayed minutes roll over", () => {
	assert.notEqual(
		renderer.fingerprint(config, state({ arrivals: [arrival({ seconds: 300, minutes: 5 })] })),
		renderer.fingerprint(config, state({ arrivals: [arrival({ seconds: 240, minutes: 4 })] }))
	);
});

test("fingerprint changes when only the urgency crosses a threshold", () => {
	// Same displayed minute, different colour: the DOM still has to be rebuilt.
	assert.notEqual(
		renderer.fingerprint(config, state({ arrivals: [arrival({ seconds: 301, minutes: 5 })] })),
		renderer.fingerprint(config, state({ arrivals: [arrival({ seconds: 300, minutes: 5 })] }))
	);
});

test("fingerprint ignores rows beyond maxEntries and hidden stop names", () => {
	const capped = { ...config, maxEntries: 1 };
	const first = arrival({ seconds: 60 });

	assert.equal(
		renderer.fingerprint(capped, state({ arrivals: [first, arrival({ seconds: 900, line: "H12" })] })),
		renderer.fingerprint(capped, state({ arrivals: [first] }))
	);
	assert.equal(
		renderer.fingerprint({ ...config, showStopName: false }, state({ arrivals: [arrival({ stopName: "A" })] })),
		renderer.fingerprint({ ...config, showStopName: false }, state({ arrivals: [arrival({ stopName: "B" })] }))
	);
});

test("fingerprint does not collide when fields shift across the separator", () => {
	assert.notEqual(
		renderer.fingerprint(config, state({ arrivals: [arrival({ line: "6", stopName: "7 Pl." })] })),
		renderer.fingerprint(config, state({ arrivals: [arrival({ line: "67", stopName: " Pl." })] }))
	);
});

test("the header escapes its label, since MagicMirror renders it as markup", () => {
	assert.equal(
		renderer.header(config, '<img src=x onerror="alert(1)">'),
		'<i class="fa fa-fw fa-bus" aria-hidden="true"></i> &lt;img src=x onerror=&quot;alert(1)&quot;&gt;'
	);
});

test("the header escapes the label with the icon turned off too", () => {
	assert.equal(renderer.header({ ...config, showHeaderIcon: false }, "A & B"), "A &amp; B");
});
