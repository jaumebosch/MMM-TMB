"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const { createDocument } = require("./fake-dom.js");

const MODULE_PATH = path.join(__dirname, "..", "..", "MMM-TMB.js");
const SOURCE = fs.readFileSync(MODULE_PATH, "utf8");

/**
 * Evaluates `MMM-TMB.js` the way MagicMirror does — against a `Module.register`
 * global — inside a fresh sandbox providing the browser globals it uses.
 *
 * @returns {{definition: object, sandbox: object}} the registered definition and its sandbox
 */
function evaluateModule() {
	let definition = null;
	const sandbox = {
		Module: {
			register(name, moduleDefinition) {
				definition = { name, ...moduleDefinition };
			}
		},
		Log: { info() {}, warn() {}, error() {}, log() {} },
		MMMTMB: {
			config: require("../../src/shared/config.js"),
			arrivals: require("../../src/shared/arrivals.js"),
			renderer: require("../../src/frontend/renderer.js")
		},
		document: createDocument(),
		// `unref()` so that a failing assertion, which skips `dispose()`, cannot
		// leave a live timer holding the test runner open.
		setInterval: (fn, ms) => setInterval(fn, ms).unref(),
		clearInterval,
		console
	};

	vm.runInNewContext(SOURCE, sandbox, { filename: MODULE_PATH });

	if (!definition) {
		throw new Error("MMM-TMB.js did not call Module.register");
	}
	return { definition, sandbox };
}

/** The module definition alone, for tests that do not need an instance. */
const loadDefinition = () => evaluateModule().definition;

/**
 * Instantiates the module with the few MagicMirror behaviours it relies on,
 * and records the side effects the tests care about.
 *
 * @param {object} [userConfig] configuration block from `config/config.js`
 * @returns {object} the live instance, plus `sent` / `domUpdates` spies
 */
function createInstance(userConfig = {}) {
	const { definition } = evaluateModule();
	const sent = [];
	const domUpdates = [];

	// MagicMirror's Module base class, reduced to what MMM-TMB uses.
	const base = {
		file: (relative) => `modules/MMM-TMB/${relative}`,
		translate: (key, variables) =>
			variables && Object.keys(variables).length > 0 ? `${key}:${JSON.stringify(variables)}` : key,
		sendSocketNotification: (notification, payload) => sent.push({ notification, payload }),
		updateDom: (speed) => domUpdates.push(speed)
	};

	const instance = Object.assign(Object.create(base), definition, {
		identifier: "module_1_MMM-TMB",
		data: { header: undefined },
		config: { ...definition.defaults, ...userConfig },
		sent,
		domUpdates,
		dispose() {
			this.stopTicker?.();
		}
	});

	return instance;
}

/** Cross-realm safe structural comparison for values produced inside the vm. */
const plain = (value) => JSON.parse(JSON.stringify(value));

module.exports = { loadDefinition, createInstance, plain };
