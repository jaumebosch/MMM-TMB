"use strict";

const globals = require("globals");
const jsdoc = require("eslint-plugin-jsdoc");

/** MagicMirror globals injected into the front-end module at runtime. */
const magicMirrorGlobals = {
	Module: "readonly",
	Log: "readonly",
	MM: "readonly",
	MMMTMB: "readonly",
	config: "readonly"
};

const sharedRules = {
	"no-console": "warn",
	"no-var": "error",
	"prefer-const": "error",
	"object-shorthand": "error",
	eqeqeq: ["error", "always"],
	curly: ["error", "all"],
	"no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
	"no-return-await": "error",
	"require-await": "error",
	"jsdoc/require-param-description": "warn",
	"jsdoc/require-returns-description": "warn",
	"jsdoc/check-alignment": "warn"
};

module.exports = [
	{
		ignores: ["node_modules/**", "coverage/**"]
	},
	{
		files: ["**/*.js"],
		plugins: { jsdoc },
		languageOptions: {
			ecmaVersion: 2022,
			sourceType: "commonjs",
			globals: { ...globals.node }
		},
		rules: sharedRules
	},
	{
		// Front-end code: runs in the browser, inside MagicMirror.
		files: ["MMM-TMB.js", "src/frontend/**/*.js", "src/shared/**/*.js"],
		languageOptions: {
			globals: { ...globals.browser, ...globals.node, ...magicMirrorGlobals }
		}
	},
	{
		// A command-line tool: the console is its output.
		files: ["tools/**/*.js"],
		rules: { "no-console": "off" }
	},
	{
		files: ["test/**/*.js"],
		rules: {
			"no-console": "off",
			// Test doubles are `async` to match the shape of the real API, even
			// when the body has nothing to await.
			"require-await": "off"
		}
	}
];
