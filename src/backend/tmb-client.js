"use strict";

/* MagicMirror²
 * Module: MMM-TMB
 *
 * Thin, dependency-free client for the public TMB API.
 * https://developer.tmb.cat/
 *
 * By @jaumebosch
 * MIT Licensed.
 */

const DEFAULT_BASE_URL = "https://api.tmb.cat/v1";
const DEFAULT_TIMEOUT_MS = 10000;

/** Statuses that mean the credentials are wrong: retrying cannot fix them. */
const FATAL_STATUSES = new Set([401, 403]);

/** Error carrying enough context to debug, and never the API credentials. */
class TmbApiError extends Error {
	constructor(message, { status = null, endpoint = null, cause = null, retryAfterMs = null } = {}) {
		super(message, cause ? { cause } : undefined);
		this.name = "TmbApiError";
		this.status = status;
		this.endpoint = endpoint;
		this.retryAfterMs = retryAfterMs;
	}

	/** True when polling should stop rather than retry: the caller is at fault. */
	get fatal() {
		return FATAL_STATUSES.has(this.status);
	}
}

/**
 * Reads a `Retry-After` header, which is either a number of seconds or an
 * HTTP date.
 *
 * @param {string|null|undefined} value raw header value
 * @returns {number|null} milliseconds to wait, or `null` when unusable
 */
function parseRetryAfter(value) {
	if (!value) {
		return null;
	}
	const seconds = Number(value);
	if (Number.isFinite(seconds)) {
		return Math.max(0, seconds * 1000);
	}
	const date = Date.parse(value);
	return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

class TmbClient {
	#appId;
	#appKey;
	#baseUrl;
	#timeoutMs;
	#fetch;

	/**
	 * @param {object} options client settings
	 * @param {string} options.appId TMB application id
	 * @param {string} options.appKey TMB application key
	 * @param {string} [options.baseUrl] API root, overridable for tests
	 * @param {number} [options.timeoutMs] per-request timeout
	 * @param {Function} [options.fetchImpl] fetch implementation, injectable for tests
	 */
	constructor({ appId, appKey, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = {}) {
		if (!appId || !appKey) {
			throw new TypeError("TmbClient requires both appId and appKey");
		}
		const impl = fetchImpl ?? globalThis.fetch;
		if (typeof impl !== "function") {
			throw new TypeError("No fetch implementation available; Node.js >= 18 is required");
		}
		this.#appId = appId;
		this.#appKey = appKey;
		this.#baseUrl = String(baseUrl).replace(/\/+$/, "");
		this.#timeoutMs = timeoutMs;
		this.#fetch = impl;
	}

	/**
	 * Fetches the static metadata (code, name) of a bus stop.
	 *
	 * @param {number|string} stopCode numeric stop code
	 * @returns {Promise<{stopCode: string, stopName: string}>} the stop code and its display name
	 * @throws {TmbApiError} when the stop is unknown or the API misbehaves
	 */
	async fetchStop(stopCode) {
		const endpoint = `/transit/parades/${encodeURIComponent(stopCode)}`;
		const payload = await this.#request(endpoint);
		const properties = payload?.features?.[0]?.properties;
		if (!properties) {
			throw new TmbApiError(`No stop found for code ${stopCode}`, { endpoint });
		}
		return {
			stopCode: String(properties.CODI_PARADA ?? stopCode),
			stopName: String(properties.NOM_PARADA ?? "").trim()
		};
	}

	/**
	 * Fetches the live arrivals (iBus) for a stop, optionally for a single line.
	 *
	 * @param {number|string} stopCode numeric stop code
	 * @param {string|null} [line] bus line to filter on
	 * @returns {Promise<Array<object>>} raw `ibus` entries, empty when none are due
	 * @throws {TmbApiError} when the API misbehaves
	 */
	async fetchArrivals(stopCode, line = null) {
		const linePath = line ? `/lines/${encodeURIComponent(line)}` : "";
		const endpoint = `/ibus${linePath}/stops/${encodeURIComponent(stopCode)}`;
		const payload = await this.#request(endpoint);
		const entries = payload?.data?.ibus;
		return Array.isArray(entries) ? entries : [];
	}

	/**
	 * Performs an authenticated GET and returns the parsed JSON body.
	 * Credentials are attached here and never included in thrown messages.
	 */
	async #request(endpoint) {
		const url = new URL(`${this.#baseUrl}${endpoint}`);
		url.searchParams.set("app_id", this.#appId);
		url.searchParams.set("app_key", this.#appKey);

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), this.#timeoutMs);

		try {
			const response = await this.#fetch(url, {
				signal: controller.signal,
				headers: { Accept: "application/json" }
			});

			if (!response.ok) {
				throw new TmbApiError(`TMB API returned ${response.status} for ${endpoint}`, {
					status: response.status,
					endpoint,
					retryAfterMs: parseRetryAfter(response.headers?.get?.("Retry-After"))
				});
			}
			return await response.json();
		} catch (error) {
			if (error instanceof TmbApiError) {
				throw error;
			}
			if (error?.name === "AbortError") {
				throw new TmbApiError(`Request to ${endpoint} timed out after ${this.#timeoutMs} ms`, {
					endpoint,
					cause: error
				});
			}
			throw new TmbApiError(`Request to ${endpoint} failed: ${error?.message ?? error}`, {
				endpoint,
				cause: error
			});
		} finally {
			clearTimeout(timer);
		}
	}
}

module.exports = { TmbClient, TmbApiError };
