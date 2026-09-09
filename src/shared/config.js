/* MagicMirror²
 * Module: MMM-TMB
 *
 * Shared configuration defaults, normalisation and validation.
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
		root.MMMTMB = Object.assign(root.MMMTMB || {}, { config: api });
	}
})(typeof self !== "undefined" ? self : globalThis, function () {
	"use strict";

	/** Configuration defaults. Every value here is safe to use as-is. */
	const DEFAULTS = Object.freeze({
		appId: "",
		appKey: "",
		busStops: [],
		maxEntries: 5,
		refreshInterval: 60000,
		retryDelay: 5000,
		requestTimeout: 10000,
		warningTime: 600,
		blinkingTime: 300,
		imminentTime: 60,
		showStopName: true,
		showDestination: false,
		animationSpeed: 500
	});

	/** Hard limits, enforced by `validateConfig`. */
	const LIMITS = Object.freeze({
		maxEntries: { min: 1, max: 50 },
		refreshInterval: { min: 10000, max: 3600000 },
		retryDelay: { min: 1000, max: 600000 },
		requestTimeout: { min: 1000, max: 60000 },
		warningTime: { min: 0, max: 86400 },
		blinkingTime: { min: 0, max: 86400 },
		imminentTime: { min: 0, max: 86400 },
		busStops: { min: 1, max: 25 }
	});

	/** Translation keys used to report validation problems to the user. */
	const ERRORS = Object.freeze({
		MISSING_APP_ID: "ERROR_MISSING_APP_ID",
		MISSING_APP_KEY: "ERROR_MISSING_APP_KEY",
		MISSING_BUS_STOPS: "ERROR_MISSING_BUS_STOPS",
		INVALID_BUS_STOP: "ERROR_INVALID_BUS_STOP",
		INVALID_NUMBER: "ERROR_INVALID_NUMBER",
		INVALID_THRESHOLDS: "ERROR_INVALID_THRESHOLDS"
	});

	const isNonEmptyString = (value) => typeof value === "string" && value.trim().length > 0;

	/**
	 * TMB stop codes are printed with leading zeroes ("001124") but the API
	 * expects the plain number. Returns `null` when the code is not usable.
	 *
	 * @param {string|number} value raw stop code coming from the user config
	 * @returns {{code: string, apiCode: number}|null} the printed code and the API one, or `null` when invalid
	 */
	function normalizeStopCode(value) {
		if (typeof value !== "string" && typeof value !== "number") {
			return null;
		}
		const raw = String(value).trim();
		if (!/^\d{1,7}$/.test(raw)) {
			return null;
		}
		const apiCode = Number.parseInt(raw, 10);
		if (!Number.isSafeInteger(apiCode) || apiCode <= 0) {
			return null;
		}
		return { code: raw, apiCode };
	}

	/**
	 * Bus line identifiers are compared as trimmed upper-case strings ("h12", "H12").
	 *
	 * @param {string|number|null|undefined} value raw line from the user config
	 * @returns {string|null} normalised line, or `null` when not set
	 */
	function normalizeLine(value) {
		if (value === null || value === undefined || value === "") {
			return null;
		}
		const line = String(value).trim().toUpperCase();
		return line.length > 0 ? line : null;
	}

	function clampNumber(value, fallback, limit) {
		const numeric = typeof value === "number" ? value : Number(value);
		if (!Number.isFinite(numeric)) {
			return { value: fallback, valid: value === undefined };
		}
		const clamped = Math.min(Math.max(numeric, limit.min), limit.max);
		return { value: clamped, valid: clamped === numeric };
	}

	/**
	 * Merges the user configuration over the defaults and coerces every value
	 * into the shape the rest of the module expects.
	 *
	 * @param {object} userConfig configuration block from `config/config.js`
	 * @returns {object} a complete, normalised configuration
	 */
	function normalizeConfig(userConfig) {
		const source = userConfig && typeof userConfig === "object" ? userConfig : {};
		const merged = { ...DEFAULTS, ...source };

		for (const key of Object.keys(LIMITS)) {
			if (key === "busStops") {
				continue;
			}
			merged[key] = clampNumber(merged[key], DEFAULTS[key], LIMITS[key]).value;
		}

		merged.appId = isNonEmptyString(merged.appId) ? merged.appId.trim() : "";
		merged.appKey = isNonEmptyString(merged.appKey) ? merged.appKey.trim() : "";
		merged.showStopName = merged.showStopName !== false;
		merged.showDestination = merged.showDestination === true;

		merged.busStops = (Array.isArray(source.busStops) ? source.busStops : [])
			.map((stop) => {
				const raw = stop && typeof stop === "object" ? stop : { busStopCode: stop };
				const normalized = normalizeStopCode(raw.busStopCode);
				if (!normalized) {
					return null;
				}
				return {
					busStopCode: normalized.code,
					apiCode: normalized.apiCode,
					busLine: normalizeLine(raw.busLine)
				};
			})
			.filter(Boolean)
			.slice(0, LIMITS.busStops.max);

		return merged;
	}

	/**
	 * Validates the *raw* user configuration and returns human-facing problems.
	 * Each problem carries a translation key plus interpolation variables, so the
	 * caller can render it with MagicMirror's `translate()`.
	 *
	 * @param {object} userConfig configuration block from `config/config.js`
	 * @returns {Array<{key: string, variables: object}>} empty when valid
	 */
	function validateConfig(userConfig) {
		const source = userConfig && typeof userConfig === "object" ? userConfig : {};
		const problems = [];

		if (!isNonEmptyString(source.appId)) {
			problems.push({ key: ERRORS.MISSING_APP_ID, variables: {} });
		}
		if (!isNonEmptyString(source.appKey)) {
			problems.push({ key: ERRORS.MISSING_APP_KEY, variables: {} });
		}

		if (!Array.isArray(source.busStops) || source.busStops.length === 0) {
			problems.push({ key: ERRORS.MISSING_BUS_STOPS, variables: {} });
		} else {
			source.busStops.forEach((stop) => {
				const raw = stop && typeof stop === "object" ? stop : { busStopCode: stop };
				if (!normalizeStopCode(raw.busStopCode)) {
					problems.push({
						key: ERRORS.INVALID_BUS_STOP,
						variables: { value: String(raw.busStopCode) }
					});
				}
			});
		}

		for (const [key, limit] of Object.entries(LIMITS)) {
			if (key === "busStops" || source[key] === undefined) {
				continue;
			}
			if (!clampNumber(source[key], DEFAULTS[key], limit).valid) {
				problems.push({
					key: ERRORS.INVALID_NUMBER,
					variables: { option: key, min: limit.min, max: limit.max }
				});
			}
		}

		const config = normalizeConfig(source);
		if (!(config.imminentTime <= config.blinkingTime && config.blinkingTime <= config.warningTime)) {
			problems.push({
				key: ERRORS.INVALID_THRESHOLDS,
				variables: {
					imminentTime: config.imminentTime,
					blinkingTime: config.blinkingTime,
					warningTime: config.warningTime
				}
			});
		}

		return problems;
	}

	return { DEFAULTS, ERRORS, normalizeConfig, validateConfig, normalizeStopCode, normalizeLine };
});
