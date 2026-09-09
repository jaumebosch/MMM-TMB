"use strict";

/**
 * A DOM double small enough to keep the test suite dependency-free.
 * Assigning `innerHTML` throws, so any regression back to markup injection
 * fails the tests instead of shipping an XSS hole.
 */
function createDocument() {
	function createElement(tagName) {
		return {
			tagName,
			className: "",
			title: undefined,
			children: [],
			_text: null,
			appendChild(child) {
				this.children.push(child);
				return child;
			},
			get textContent() {
				return this._text ?? this.children.map((child) => child.textContent).join("");
			},
			set textContent(value) {
				this._text = String(value);
				this.children = [];
			},
			set innerHTML(value) {
				throw new Error(`innerHTML assigned on <${tagName}>: "${value}" - render text, not markup`);
			}
		};
	}

	return { createElement };
}

/** Depth-first list of every node in the tree, root included. */
function flatten(node) {
	return [node, ...node.children.flatMap(flatten)];
}

/** All nodes carrying the given class name. */
function byClass(root, className) {
	return flatten(root).filter((node) => node.className.split(/\s+/).includes(className));
}

module.exports = { createDocument, flatten, byClass };
