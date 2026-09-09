/* MagicMirror²
 * Module: MMM-TMB
 *
 * Shared helpers to normalise, sort and classify bus arrivals.
 * Loaded both in the browser (via getScripts) and in Node (via require).
 *
 * By @jaumebosch
 * MIT Licensed.
 */

(function (root, factory) {
	"use strict";
	const api = factory();
	if (typeof module === "object" && module.exports) {
		module.exports = api;
	} else {
		root.MMMTMB = Object.assign(root.MMMTMB || {}, { arrivals: api });
	}
})(typeof self !== "undefined" ? self : globalThis, function () {
	"use strict";

	/** Urgency buckets, ordered from most to least urgent. */
	const URGENCY = Object.freeze({
		IMMINENT: "imminent",
		BLINKING: "blinking",
		WARNING: "warning",
		NORMAL: "normal"
	});

	/**
	 * Buckets an arrival by how soon the bus is due.
	 *
	 * @param {number} seconds seconds until arrival
	 * @param {{imminentTime: number, blinkingTime: number, warningTime: number}} thresholds urgency boundaries, in seconds
	 * @returns {string} one of the `URGENCY` values
	 */
	function classify(seconds, thresholds) {
		if (!Number.isFinite(seconds)) {
			return URGENCY.NORMAL;
		}
		if (seconds <= thresholds.imminentTime) {
			return URGENCY.IMMINENT;
		}
		if (seconds <= thresholds.blinkingTime) {
			return URGENCY.BLINKING;
		}
		if (seconds <= thresholds.warningTime) {
			return URGENCY.WARNING;
		}
		return URGENCY.NORMAL;
	}

	/**
	 * Sorts arrivals by time to arrival, then by line, then by stop, so that the
	 * rendered order is stable across refreshes when two buses tie.
	 *
	 * @param {Array<object>} list arrivals to sort (not mutated)
	 * @returns {Array<object>} a new, sorted array
	 */
	function sort(list) {
		return [...list].sort(
			(a, b) =>
				a.seconds - b.seconds ||
				String(a.line).localeCompare(String(b.line), undefined, { numeric: true }) ||
				String(a.stopCode).localeCompare(String(b.stopCode))
		);
	}

	/**
	 * Turns a raw `ibus` entry from the TMB API into the module's own shape.
	 * Returns `null` for entries that carry no usable arrival time.
	 *
	 * @param {object} entry raw API entry
	 * @param {{stopCode: string, stopName: string, line: string|null}} context stop metadata
	 * @returns {object|null} normalised arrival
	 */
	function fromApiEntry(entry, context) {
		if (!entry || typeof entry !== "object") {
			return null;
		}
		const seconds = Number(entry["t-in-s"]);
		if (!Number.isFinite(seconds) || seconds < 0) {
			return null;
		}
		const minutes = Number(entry["t-in-min"]);
		return {
			line: context.line ?? String(entry.line ?? "").trim(),
			destination: typeof entry.destination === "string" ? entry.destination : null,
			stopCode: context.stopCode,
			stopName: context.stopName,
			seconds,
			minutes: Number.isFinite(minutes) ? minutes : Math.round(seconds / 60)
		};
	}

	/**
	 * Recomputes `seconds`/`minutes` relative to now, so that arrivals stay
	 * accurate between two backend refreshes.
	 *
	 * @param {Array<object>} list arrivals captured at `capturedAt`
	 * @param {number} capturedAt epoch ms when the data was fetched
	 * @param {number} [now] epoch ms to project to
	 * @returns {Array<object>} arrivals with refreshed timings, past ones dropped
	 */
	function project(list, capturedAt, now = Date.now()) {
		const elapsed = Math.max(0, Math.round((now - capturedAt) / 1000));
		return list
			.map((arrival) => {
				const seconds = arrival.seconds - elapsed;
				return { ...arrival, seconds, minutes: Math.max(0, Math.round(seconds / 60)) };
			})
			.filter((arrival) => arrival.seconds > -30);
	}

	return { URGENCY, classify, sort, fromApiEntry, project };
});
