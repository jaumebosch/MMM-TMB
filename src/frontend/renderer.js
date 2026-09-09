/* MagicMirror²
 * Module: MMM-TMB
 *
 * Builds the module DOM. Every string coming from the API is inserted as text,
 * never as markup.
 *
 * By @jaumebosch
 * MIT Licensed.
 */

(function (root, factory) {
	"use strict";
	const api = factory(root.MMMTMB?.arrivals ?? require("../shared/arrivals.js"));
	if (typeof module === "object" && module.exports) {
		module.exports = api;
	} else {
		root.MMMTMB = Object.assign(root.MMMTMB || {}, { renderer: api });
	}
})(typeof self !== "undefined" ? self : globalThis, function (arrivals) {
	"use strict";

	/**
	 * @typedef {object} RenderContext
	 * @property {Document} document DOM document to build nodes with
	 * @property {(key: string, variables?: object) => string} translate MagicMirror translator
	 * @property {object} config normalised module configuration
	 */

	const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

	const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

	/**
	 * Builds the module header. MagicMirror renders it as markup, so this is the
	 * one place the module emits HTML, and the label is escaped on the way in.
	 *
	 * @param {object} config normalised module configuration
	 * @param {string} label header text, from `header` in config or the translation
	 * @returns {string} the header markup
	 */
	function header(config, label) {
		const text = escapeHtml(label);
		return config.showHeaderIcon ? `<i class="fa fa-fw fa-bus" aria-hidden="true"></i> ${text}` : text;
	}

	function element(context, tag, className, text) {
		const node = context.document.createElement(tag);
		if (className) {
			node.className = className;
		}
		if (text !== undefined) {
			node.textContent = text;
		}
		return node;
	}

	/** A single-cell message, used for loading, errors and the empty state. */
	function message(context, text, className = "dimmed light small") {
		return element(context, "div", className, text);
	}

	/**
	 * Renders the configuration problems reported by `validateConfig`.
	 *
	 * @param {RenderContext} context rendering dependencies
	 * @param {Array<{key: string, variables: object}>} problems problems reported by `validateConfig`
	 * @returns {HTMLElement} a list of translated problem messages
	 */
	function renderProblems(context, problems) {
		const wrapper = element(context, "div", "MMM-TMB-problems dimmed light small");
		for (const problem of problems) {
			wrapper.appendChild(element(context, "div", null, context.translate(problem.key, problem.variables)));
		}
		return wrapper;
	}

	/**
	 * Renders the arrivals table.
	 *
	 * @param {RenderContext} context rendering dependencies
	 * @param {Array<object>} list arrivals, already projected to "now"
	 * @returns {HTMLElement} the arrivals table
	 */
	function renderTable(context, list) {
		const { config, translate } = context;
		const table = element(context, "table", "MMM-TMB-table small");

		for (const arrival of list.slice(0, config.maxEntries)) {
			const row = element(context, "tr", "MMM-TMB-row");

			row.appendChild(element(context, "td", "MMM-TMB-line", arrival.line));

			if (config.showStopName) {
				const stopCell = element(context, "td", "MMM-TMB-stop", arrival.stopName);
				stopCell.title = arrival.stopName;
				row.appendChild(stopCell);
			}

			// The API does not always report a destination; the column collapses
			// to an empty cell rather than shifting the other columns around.
			if (config.showDestination) {
				const destination = arrival.destination ?? "";
				const destinationCell = element(context, "td", "MMM-TMB-destination", destination);
				destinationCell.title = destination;
				row.appendChild(destinationCell);
			}

			const urgency = arrivals.classify(arrival.seconds, config);
			const isImminent = urgency === arrivals.URGENCY.IMMINENT;
			const timeCell = element(
				context,
				"td",
				`MMM-TMB-time MMM-TMB-${urgency}`,
				isImminent ? translate("IMMINENT") : translate("MINUTES", { minutes: arrival.minutes })
			);
			row.appendChild(timeCell);

			table.appendChild(row);
		}

		return table;
	}

	/**
	 * Single entry point: picks the right view for the current module state.
	 *
	 * @param {RenderContext} context rendering dependencies
	 * @param {object} state module state
	 * @param {Array} state.problems configuration problems, if any
	 * @param {boolean} state.loaded whether a first snapshot has arrived
	 * @param {boolean} state.stale whether the snapshot is too old to trust
	 * @param {Array<object>} state.arrivals arrivals projected to "now"
	 * @param {string|null} state.errorKey translation key of the last error, if any
	 * @returns {HTMLElement} the node to mount in the mirror
	 */
	function render(context, state) {
		if (state.problems.length > 0) {
			return renderProblems(context, state.problems);
		}
		if (!state.loaded) {
			return message(context, context.translate("LOADING"));
		}
		// Counting down from a snapshot nobody refreshed would quietly show wrong
		// times, and then an "empty" board that really means "no data".
		if (state.stale) {
			return message(context, context.translate(state.errorKey ?? "ERROR_STALE"));
		}
		if (state.arrivals.length === 0) {
			return message(context, context.translate(state.errorKey ?? "NO_BUSES"));
		}
		return renderTable(context, state.arrivals);
	}

	/**
	 * A compact fingerprint of what the user would actually see. Two states with
	 * the same fingerprint render identically, so the module can skip the DOM
	 * rebuild: most local ticks change nothing, since minutes only roll over
	 * once a minute.
	 *
	 * @param {object} config normalised module configuration
	 * @param {object} state the same state object passed to `render`
	 * @returns {string} a value that changes exactly when the output would
	 */
	function fingerprint(config, state) {
		if (state.problems.length > 0) {
			return `problems\u0000${state.problems.map((problem) => problem.key).join(",")}`;
		}
		if (!state.loaded) {
			return "loading";
		}
		if (state.stale) {
			return `stale\u0000${state.errorKey ?? ""}`;
		}
		if (state.arrivals.length === 0) {
			return `empty\u0000${state.errorKey ?? ""}`;
		}
		return state.arrivals
			.slice(0, config.maxEntries)
			.map((arrival) => {
				const urgency = arrivals.classify(arrival.seconds, config);
				const time = urgency === arrivals.URGENCY.IMMINENT ? "imminent" : arrival.minutes;
				return [
					arrival.line,
					config.showStopName ? arrival.stopName : "",
					config.showDestination ? (arrival.destination ?? "") : "",
					urgency,
					time
				].join("\u0000");
			})
			.join("\n");
	}

	return { render, fingerprint, header };
});
