"use strict";

/* MagicMirror²
 * Module: MMM-TMB
 *
 * Runs an async task on a fixed interval with exponential back-off on failure.
 * Guarantees a single in-flight run and a single pending timer at any time.
 *
 * By @jaumebosch
 * MIT Licensed.
 */

/** Upper bound on a server-supplied `Retry-After`, so a bad header cannot stall the module. */
const MAX_RETRY_AFTER_MS = 3600000;

class Poller {
	#task;
	#intervalMs;
	#retryDelayMs;
	#onResult;
	#onError;
	#isFatal;
	#timers;
	#timer = null;
	#running = false;
	#inFlight = false;
	#failures = 0;
	#retryAfterMs = null;

	/**
	 * @param {object} options poller settings
	 * @param {Function} options.task async function producing a result
	 * @param {number} options.intervalMs delay between successful runs
	 * @param {number} options.retryDelayMs base delay after a failed run
	 * @param {Function} [options.onResult] called with each successful result
	 * @param {Function} [options.onError] called with each error
	 * @param {Function} [options.isFatal] returns true for errors that must stop the poller
	 * @param {{setTimeout: Function, clearTimeout: Function}} [options.timers] injectable for tests
	 */
	constructor({
		task,
		intervalMs,
		retryDelayMs,
		onResult = () => {},
		onError = () => {},
		isFatal = () => false,
		timers = { setTimeout, clearTimeout }
	}) {
		this.#task = task;
		this.#intervalMs = intervalMs;
		this.#retryDelayMs = retryDelayMs;
		this.#onResult = onResult;
		this.#onError = onError;
		this.#isFatal = isFatal;
		this.#timers = timers;
	}

	get isRunning() {
		return this.#running;
	}

	/** Starts polling and triggers a first run immediately. Idempotent. */
	start() {
		if (this.#running) {
			return;
		}
		this.#running = true;
		this.#failures = 0;
		this.#retryAfterMs = null;
		void this.#run();
	}

	/** Stops polling and cancels any pending timer. Idempotent. */
	stop() {
		this.#running = false;
		if (this.#timer !== null) {
			this.#timers.clearTimeout(this.#timer);
			this.#timer = null;
		}
	}

	/**
	 * Back-off doubles per consecutive failure, capped at the refresh interval.
	 * A `Retry-After` hint from the server always wins: it is the one delay we
	 * were explicitly asked to honour.
	 */
	#nextDelay() {
		if (this.#failures === 0) {
			return this.#intervalMs;
		}
		const backoff = Math.min(this.#retryDelayMs * 2 ** (this.#failures - 1), this.#intervalMs);
		return Math.max(backoff, Math.min(this.#retryAfterMs ?? 0, MAX_RETRY_AFTER_MS));
	}

	async #run() {
		if (!this.#running || this.#inFlight) {
			return;
		}
		this.#inFlight = true;
		try {
			const result = await this.#task();
			this.#failures = 0;
			this.#retryAfterMs = null;
			if (this.#running) {
				this.#onResult(result);
			}
		} catch (error) {
			this.#failures += 1;
			this.#retryAfterMs = Number.isFinite(error?.retryAfterMs) ? error.retryAfterMs : null;
			if (this.#running) {
				this.#onError(error);
			}
			if (this.#isFatal(error)) {
				// Nothing a retry can fix; #schedule() below becomes a no-op.
				this.stop();
			}
		} finally {
			this.#inFlight = false;
			this.#schedule();
		}
	}

	#schedule() {
		if (!this.#running) {
			return;
		}
		this.#timer = this.#timers.setTimeout(() => {
			this.#timer = null;
			void this.#run();
		}, this.#nextDelay());
	}
}

module.exports = { Poller };
