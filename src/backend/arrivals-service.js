"use strict";

/* MagicMirror²
 * Module: MMM-TMB
 *
 * Collects live arrivals for every configured stop and turns them into the
 * flat, sorted snapshot the front-end renders.
 *
 * By @jaumebosch
 * MIT Licensed.
 */

const arrivals = require("../shared/arrivals.js");

class ArrivalsService {
	#client;
	#stops;
	#logger;
	#stopNames = new Map();

	/**
	 * @param {object} options service dependencies
	 * @param {import("./tmb-client.js").TmbClient} options.client configured API client
	 * @param {Array<{busStopCode: string, apiCode: number, busLine: string|null}>} options.stops normalised stops to poll
	 * @param {{warn: Function}} [options.logger] logger used for non-fatal failures
	 */
	constructor({ client, stops, logger = console }) {
		this.#client = client;
		this.#stops = stops;
		this.#logger = logger;
	}

	/**
	 * Stop names are static, so they are fetched once and cached for the whole
	 * process lifetime. The *promise* is cached rather than the resolved name, so
	 * listing the same stop twice (once per line) still costs a single request.
	 * A failure here is not fatal: the stop code is used as a fallback label.
	 */
	#stopName(stop) {
		let pending = this.#stopNames.get(stop.busStopCode);
		if (!pending) {
			pending = this.#client
				.fetchStop(stop.apiCode)
				.then(({ stopName }) => stopName || stop.busStopCode)
				.catch((error) => {
					this.#logger.warn(
						`[MMM-TMB] Could not resolve name for stop ${stop.busStopCode}: ${error.message}`
					);
					// Do not cache the failure: the next refresh gets to try again.
					this.#stopNames.delete(stop.busStopCode);
					return stop.busStopCode;
				});
			this.#stopNames.set(stop.busStopCode, pending);
		}
		return pending;
	}

	/**
	 * Queries every configured stop in parallel. A stop that fails degrades to
	 * an entry in `errors` instead of taking the whole snapshot down.
	 *
	 * @returns {Promise<{capturedAt: number, arrivals: Array<object>, errors: Array<object>}>} the snapshot to render
	 */
	async collect() {
		const results = await Promise.all(this.#stops.map((stop) => this.#collectStop(stop)));

		// A fatal error (bad credentials) affects every stop, so it is raised to
		// the caller instead of being reported as a per-stop failure.
		const fatal = results.find((result) => result.fatal)?.fatal;
		if (fatal) {
			throw fatal;
		}

		return {
			capturedAt: Date.now(),
			arrivals: arrivals.sort(results.flatMap((result) => result.arrivals)),
			errors: results.filter((result) => result.error !== null).map((result) => result.error)
		};
	}

	async #collectStop(stop) {
		const stopName = await this.#stopName(stop);
		try {
			const entries = await this.#client.fetchArrivals(stop.apiCode, stop.busLine);
			const context = { stopCode: stop.busStopCode, stopName, line: stop.busLine };
			return {
				arrivals: entries.map((entry) => arrivals.fromApiEntry(entry, context)).filter(Boolean),
				error: null,
				fatal: null
			};
		} catch (error) {
			if (error?.fatal) {
				return { arrivals: [], error: null, fatal: error };
			}
			this.#logger.warn(`[MMM-TMB] Could not fetch arrivals for stop ${stop.busStopCode}: ${error.message}`);
			return {
				arrivals: [],
				error: { stopCode: stop.busStopCode, message: error.message },
				fatal: null
			};
		}
	}
}

module.exports = { ArrivalsService };
