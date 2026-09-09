"use strict";

const path = require("node:path");
const Module = require("node:module");

const HELPER_PATH = path.join(__dirname, "..", "..", "node_helper.js");

/**
 * Loads `node_helper.js` outside MagicMirror by intercepting the two requires
 * that only resolve inside a MagicMirror checkout: `node_helper` and `logger`.
 *
 * The global `fetch` is stubbed for the lifetime of the helper so that starting
 * a poller never reaches the real TMB API; `helper.stop()` restores it.
 *
 * @param {Function} [fetchImpl] fetch double; defaults to an empty iBus response
 * @returns {{helper: object, sent: Array<object>, logs: object}} the helper and its spies
 */
function createHelper(fetchImpl) {
	const sent = [];
	const logs = { info: [], warn: [], error: [] };
	const originalFetch = globalThis.fetch;
	globalThis.fetch = async (url, options) => {
		return fetchImpl
			? fetchImpl(url, options)
			: { ok: true, status: 200, json: async () => ({ features: [], data: { ibus: [] } }) };
	};

	const fakeNodeHelper = {
		create(definition) {
			return {
				name: "MMM-TMB",
				sendSocketNotification: (notification, payload) => sent.push({ notification, payload }),
				...definition
			};
		}
	};

	const fakeLogger = {
		info: (message) => logs.info.push(message),
		warn: (message) => logs.warn.push(message),
		error: (message) => logs.error.push(message),
		log: (message) => logs.info.push(message)
	};

	const originalLoad = Module._load;
	Module._load = function (request, ...rest) {
		if (request === "node_helper") {
			return fakeNodeHelper;
		}
		if (request === "logger") {
			return fakeLogger;
		}
		return originalLoad.call(this, request, ...rest);
	};

	let helper;
	try {
		delete require.cache[require.resolve(HELPER_PATH)];
		helper = require(HELPER_PATH);
	} finally {
		Module._load = originalLoad;
	}

	const stopHelper = helper.stop.bind(helper);
	helper.stop = () => {
		stopHelper();
		globalThis.fetch = originalFetch;
	};

	helper.start();
	return { helper, sent, logs };
}

module.exports = { createHelper };
