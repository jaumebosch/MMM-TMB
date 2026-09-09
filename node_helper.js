"use strict";

/* MagicMirror²
 * Module: MMM-TMB
 *
 * Node helper: owns the API credentials, polls TMB and pushes snapshots to the
 * front-end. Supports several module instances, each with its own poller.
 *
 * By @jaumebosch
 * MIT Licensed.
 */

const NodeHelper = require("node_helper");

const { TmbClient } = require("./src/backend/tmb-client.js");
const { ArrivalsService } = require("./src/backend/arrivals-service.js");
const { Poller } = require("./src/backend/poller.js");
const { normalizeConfig, validateConfig } = require("./src/shared/config.js");

/** MagicMirror exposes its logger under different paths across versions. */
function resolveLogger() {
	for (const path of ["logger", "../../js/logger"]) {
		try {
			return require(path);
		} catch {
			// try the next candidate
		}
	}
	return console;
}

const Log = resolveLogger();

module.exports = NodeHelper.create({
	start() {
		Log.info(`Starting node helper for: ${this.name}`);
		/** @type {Map<string, {poller: Poller}>} keyed by module instance identifier */
		this.instances = new Map();
	},

	stop() {
		for (const { poller } of this.instances.values()) {
			poller.stop();
		}
		this.instances.clear();
	},

	socketNotificationReceived(notification, payload) {
		if (notification === `${this.name}_CONFIG`) {
			this.configure(payload?.identifier, payload?.config);
		}
	},

	/**
	 * (Re)starts polling for a single module instance. Called again on every
	 * front-end restart, so it must tear down whatever was running before.
	 *
	 * @param {string} identifier MagicMirror module instance identifier
	 * @param {object} rawConfig configuration block from `config/config.js`
	 */
	configure(identifier, rawConfig) {
		if (!identifier) {
			Log.error("[MMM-TMB] Received a config without a module identifier, ignoring it");
			return;
		}

		this.instances.get(identifier)?.poller.stop();
		this.instances.delete(identifier);

		const problems = validateConfig(rawConfig);
		if (problems.length > 0) {
			Log.error(`[MMM-TMB] Invalid configuration: ${problems.map((problem) => problem.key).join(", ")}`);
			return;
		}

		const config = normalizeConfig(rawConfig);
		const service = new ArrivalsService({
			client: new TmbClient({
				appId: config.appId,
				appKey: config.appKey,
				timeoutMs: config.requestTimeout
			}),
			stops: config.busStops,
			logger: Log
		});

		const poller = new Poller({
			task: () => service.collect(),
			intervalMs: config.refreshInterval,
			retryDelayMs: config.retryDelay,
			onResult: (snapshot) => this.sendSocketNotification(`${this.name}_DATA`, { identifier, ...snapshot }),
			isFatal: (error) => error?.fatal === true,
			onError: (error) => {
				const key = error?.fatal ? "ERROR_CREDENTIALS_REJECTED" : "ERROR_UNAVAILABLE";
				Log.error(`[MMM-TMB] Refresh failed: ${error.message}`);
				if (error?.fatal) {
					Log.error(`[MMM-TMB] Polling stopped for ${identifier}; fix the credentials and restart.`);
				}
				this.sendSocketNotification(`${this.name}_ERROR`, { identifier, key, message: error.message });
			}
		});

		this.instances.set(identifier, { poller });
		poller.start();
	}
});
