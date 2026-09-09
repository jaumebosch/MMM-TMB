/* global Module, Log, MMMTMB */

/* MagicMirror²
 * Module: MMM-TMB
 *
 * Front-end module: validates the user configuration, keeps the latest
 * snapshot received from the node helper and renders it.
 *
 * By @jaumebosch
 * MIT Licensed.
 */

Module.register("MMM-TMB", {
	// Keep in sync with `src/shared/config.js`; enforced by the test suite.
	// This literal cannot reference the shared module: MagicMirror reads
	// `defaults` before `getScripts()` dependencies are loaded.
	defaults: {
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
		showHeaderIcon: true,
		animationSpeed: 500
	},

	requiresVersion: "2.15.0",

	/** How often the countdowns are recomputed locally, between API refreshes. */
	tickInterval: 15000,

	/** A snapshot older than this many refresh intervals is no longer trusted. */
	staleAfterRefreshes: 3,

	getScripts() {
		return [
			this.file("src/shared/config.js"),
			this.file("src/shared/arrivals.js"),
			this.file("src/frontend/renderer.js")
		];
	},

	getStyles() {
		return ["font-awesome.css", this.file("MMM-TMB.css")];
	},

	getTranslations() {
		return {
			en: "translations/en.json",
			ca: "translations/ca.json",
			es: "translations/es.json"
		};
	},

	getHeader() {
		return MMMTMB.renderer.header(this.config, this.data.header ?? this.translate("HEADER"));
	},

	start() {
		Log.info(`Starting module: ${this.name}`);

		this.problems = MMMTMB.config.validateConfig(this.config);
		this.config = MMMTMB.config.normalizeConfig(this.config);
		this.snapshot = { capturedAt: Date.now(), arrivals: [] };
		this.loaded = false;
		this.errorKey = null;
		this.ticker = null;
		this.rendered = null;

		if (this.problems.length > 0) {
			Log.error(`${this.name}: ${this.problems.map((problem) => problem.key).join(", ")}`);
			return;
		}

		this.sendSocketNotification(`${this.name}_CONFIG`, {
			identifier: this.identifier,
			config: this.config
		});
		this.startTicker();
	},

	suspend() {
		this.stopTicker();
	},

	resume() {
		if (this.problems.length === 0) {
			this.startTicker();
			this.updateDom(this.config.animationSpeed);
		}
	},

	/**
	 * Recomputes the countdowns locally so the display keeps counting down
	 * between two node-helper refreshes.
	 */
	startTicker() {
		if (this.ticker !== null) {
			return;
		}
		this.ticker = setInterval(() => this.tick(), this.tickInterval);
	},

	stopTicker() {
		if (this.ticker !== null) {
			clearInterval(this.ticker);
			this.ticker = null;
		}
	},

	/**
	 * Rebuilds the DOM only when the output would actually look different:
	 * minutes roll over once a minute, so most ticks are a no-op.
	 */
	tick() {
		if (MMMTMB.renderer.fingerprint(this.config, this.viewState()) !== this.rendered) {
			this.updateDom();
		}
	},

	/** Everything the renderer needs, derived from the current module state. */
	viewState() {
		return {
			problems: this.problems,
			loaded: this.loaded,
			stale: this.isStale(),
			errorKey: this.errorKey,
			arrivals: MMMTMB.arrivals.project(this.snapshot.arrivals, this.snapshot.capturedAt)
		};
	},

	/**
	 * True once the node helper has gone quiet for several refresh intervals.
	 * Without this the module would keep counting a frozen snapshot down to zero
	 * and then claim there are no buses.
	 */
	isStale() {
		const maxAge = this.config.refreshInterval * this.staleAfterRefreshes;
		return this.loaded && Date.now() - this.snapshot.capturedAt > maxAge;
	},

	socketNotificationReceived(notification, payload) {
		// The helper broadcasts to every instance of the module; ignore the
		// snapshots that belong to a sibling instance.
		if (payload?.identifier !== this.identifier) {
			return;
		}

		if (notification === `${this.name}_DATA`) {
			this.snapshot = payload;
			this.errorKey = payload.errors?.length > 0 ? "ERROR_UNAVAILABLE" : null;
			this.loaded = true;
			this.updateDom(this.config.animationSpeed);
		} else if (notification === `${this.name}_ERROR`) {
			this.errorKey = payload.key ?? "ERROR_UNAVAILABLE";
			this.loaded = true;
			this.updateDom(this.config.animationSpeed);
		}
	},

	getDom() {
		const state = this.viewState();
		this.rendered = MMMTMB.renderer.fingerprint(this.config, state);

		return MMMTMB.renderer.render(
			{
				document,
				translate: (key, variables) => this.translate(key, variables),
				config: this.config
			},
			state
		);
	}
});
