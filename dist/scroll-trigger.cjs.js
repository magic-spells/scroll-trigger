'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

/**
 * Shared helpers for resolving element inputs and viewport-relative offsets.
 * Pure functions - no state, no DOM writes.
 */

/**
 * Normalize the many shapes an element input can take into an array
 * @param {string|Element|NodeList|HTMLCollection|Array<Element>} input - CSS selector, element, or element collection
 * @returns {Array<Element>} Resolved elements (empty when nothing matches)
 */
function resolveElements(input) {
  if (!input) return [];
  if (typeof input === "string") {
    return Array.from(document.querySelectorAll(input));
  }
  if (input instanceof Element) return [input];
  if (Array.isArray(input)) return input;
  if (typeof input.length === "number") return Array.from(input);
  return [];
}

/**
 * Check whether an offset is expressed as a percentage of the viewport
 * @param {number|string} value - Offset value
 * @returns {boolean} True for values like '20%'
 */
function isPercentageOffset(value) {
  return typeof value === "string" && value.includes("%");
}

/**
 * Convert an offset to pixels, resolving percentages against the viewport height
 * @param {number|string} value - Offset in pixels or as a percentage string
 * @param {number} [fallback=0] - Value returned when the offset can't be parsed
 * @returns {number} Offset in pixels
 */
function offsetToPixels(value, fallback = 0) {
  if (isPercentageOffset(value)) {
    return Math.round((window.innerHeight * parseFloat(value)) / 100);
  }
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const parsed = typeof value === "string" ? parseFloat(value) : NaN;
  return Number.isNaN(parsed) ? fallback : parsed;
}

/**
 * Anchor placements, using AOS's `<element-edge>-<viewport-edge>` naming.
 *
 * Each value is `[elementEdgeFactor, viewportEdgeFactor]`: a fraction of the
 * element's height and a fraction of the viewport height measured down from
 * the viewport's top edge.
 */
const PLACEMENTS = {
  "top-bottom": [0, 1],
  "center-bottom": [0.5, 1],
  "bottom-bottom": [1, 1],
  "top-center": [0, 0.5],
  "bottom-center": [1, 0.5],
  "center-center": [0.5, 0.5],
  "top-top": [0, 0],
  "bottom-top": [1, 0],
  "center-top": [0.5, 0],
};

const DEFAULT_PLACEMENT = "top-bottom";

/**
 * Root margin added above the viewport for every observer.
 *
 * It keeps "intersecting" equivalent to "has crossed the line". Without it an
 * element scrolled past the top of the viewport stops intersecting and reports
 * an exit it never made, and a `*-top` placement shrinks the root to zero
 * height, where intersection is undefined across browsers.
 */
const ROOT_TOP_MARGIN = 100000;

/** Delay before rebuilding observers after a viewport or layout change (ms) */
const RESIZE_DEBOUNCE = 100;

/**
 * Tracks a set of elements against a single trigger line
 */
class CrossObserver {
  // Private fields
  #config = {
    offset: 0,
    placement: DEFAULT_PLACEMENT,
    once: false,
    syncOnScroll: false,
    threshold: 0,
    onCross: null,
    onExit: null,
  };
  #factors = PLACEMENTS[DEFAULT_PLACEMENT];
  #states = new Map();
  #observers = new Map();
  #measureObserver = null;
  #resizeObserver = null;
  #resizeHandler = null;
  #resizeTimer = null;
  #scrollHandler = null;
  #scrollFrame = null;
  #isDestroyed = false;

  constructor(elements, options) {
    this.#config = { ...this.#config, ...options };

    if (!PLACEMENTS[this.#config.placement]) {
      console.warn(
        `observeCross: unknown placement "${this.#config.placement}", falling back to "${DEFAULT_PLACEMENT}"`,
      );
      this.#config.placement = DEFAULT_PLACEMENT;
    }
    this.#factors = PLACEMENTS[this.#config.placement];

    resolveElements(elements).forEach((element) => {
      if (!(element instanceof Element)) return;
      this.#states.set(element, {
        crossed: false,
        done: false,
        height: null,
        margin: null,
      });
    });

    this.#build();
    this.#setupResizeWatchers();

    if (this.#config.syncOnScroll) {
      this.#setupScrollListener();
    }
  }

  /**
   * Distance in pixels from the bottom of the viewport to the trigger line for
   * an element of the given height.
   *
   * This doubles as the observer's negative bottom root margin, so the
   * observer boundary and the geometry check in #evaluate are the same number
   * and can never disagree by a rounding error.
   */
  #marginFor(height) {
    const [elementEdge, viewportEdge] = this.#factors;
    return Math.round(
      offsetToPixels(this.#config.offset, 0) +
        window.innerHeight * (1 - viewportEdge) +
        height * elementEdge,
    );
  }

  /**
   * Get (or lazily create) the observer for a given trigger line
   */
  #observerFor(margin) {
    let observer = this.#observers.get(margin);
    if (observer) return observer;

    observer = new IntersectionObserver(
      (entries) => this.#handleEntries(entries),
      {
        root: null,
        rootMargin: `${ROOT_TOP_MARGIN}px 0px ${-margin}px 0px`,
        threshold: this.#config.threshold,
      },
    );

    this.#observers.set(margin, observer);
    return observer;
  }

  /**
   * Get (or lazily create) the first-stage observer.
   *
   * Element-edge placements need the element's height, and heights measured
   * before stylesheets and layout settle are wrong. This observer waits for an
   * element's first intersecting pixel - guaranteed to be at or before its real
   * trigger line - and measures the height there.
   */
  #getMeasureObserver() {
    if (this.#measureObserver) return this.#measureObserver;

    const base = this.#marginFor(0);
    const bottom = base < 0 ? -base : 0;

    this.#measureObserver = new IntersectionObserver(
      (entries) => this.#handleMeasureEntries(entries),
      {
        root: null,
        rootMargin: `${ROOT_TOP_MARGIN}px 0px ${bottom}px 0px`,
        threshold: 0,
      },
    );

    return this.#measureObserver;
  }

  /**
   * Attach every tracked element to an observer
   */
  #build() {
    const [elementEdge] = this.#factors;

    this.#states.forEach((state, element) => {
      if (state.done) return;

      if (elementEdge === 0) {
        state.margin = this.#marginFor(0);
        this.#observerFor(state.margin).observe(element);
        return;
      }

      if (state.height === null) {
        state.margin = null;
        this.#getMeasureObserver().observe(element);
        return;
      }

      state.margin = this.#marginFor(state.height);
      this.#observerFor(state.margin).observe(element);
    });
  }

  /**
   * Move an element off the measuring observer and onto its real trigger line
   */
  #promote(element, state, height) {
    state.height = height;
    state.margin = this.#marginFor(height);

    if (this.#measureObserver) {
      this.#measureObserver.unobserve(element);
    }

    this.#observerFor(state.margin).observe(element);
  }

  #handleMeasureEntries(entries) {
    if (this.#isDestroyed) return;

    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const state = this.#states.get(entry.target);
      if (!state || state.done || state.height !== null) return;
      this.#promote(
        entry.target,
        state,
        entry.target.getBoundingClientRect().height,
      );
    });
  }

  #handleEntries(entries) {
    if (this.#isDestroyed) return;
    entries.forEach((entry) => this.#evaluate(entry.target, entry));
  }

  /**
   * Decide whether an element has crossed its trigger line and fire callbacks
   *
   * The rect is re-measured here instead of read from the entry: entry rects
   * are snapshots from when the intersection was computed, which can be several
   * frames stale during momentum scrolling.
   */
  #evaluate(element, entry) {
    const state = this.#states.get(element);
    if (!state || state.done || state.margin === null) return;

    const rect = element.getBoundingClientRect();
    const crossed = rect.top < window.innerHeight - state.margin;
    if (crossed === state.crossed) return;

    state.crossed = crossed;

    if (crossed) {
      if (typeof this.#config.onCross === "function") {
        this.#config.onCross(element, entry);
      }
      if (this.#config.once) {
        this.#retire(element, state);
      }
      return;
    }

    if (typeof this.#config.onExit === "function") {
      this.#config.onExit(element, entry);
    }
  }

  /**
   * Re-check every tracked element against the current layout
   */
  #evaluateAll() {
    this.#states.forEach((state, element) => {
      if (state.done) return;

      if (state.margin === null) {
        const height = element.getBoundingClientRect().height;
        if (height <= 0) return;
        this.#promote(element, state, height);
      }

      this.#evaluate(element, null);
    });
  }

  /**
   * Stop tracking an element that has fired under `once`
   */
  #retire(element, state) {
    state.done = true;
    this.#observers.forEach((observer) => observer.unobserve(element));
    if (this.#measureObserver) {
      this.#measureObserver.unobserve(element);
    }
  }

  #teardownObservers() {
    this.#observers.forEach((observer) => observer.disconnect());
    this.#observers.clear();

    if (this.#measureObserver) {
      this.#measureObserver.disconnect();
      this.#measureObserver = null;
    }
  }

  /**
   * Passive scroll re-check.
   *
   * IntersectionObserver can lag by several frames during momentum scrolling on
   * mobile Safari, which shows up as callbacks that fire late or not until the
   * next touch. Off by default - it costs a rect read per element per frame.
   */
  #setupScrollListener() {
    this.#scrollHandler = () => {
      if (this.#scrollFrame !== null) return;
      this.#scrollFrame = requestAnimationFrame(() => {
        this.#scrollFrame = null;
        if (this.#isDestroyed) return;
        this.#evaluateAll();
      });
    };

    window.addEventListener("scroll", this.#scrollHandler, { passive: true });
  }

  /**
   * Whether the trigger line depends on anything that can change at runtime.
   * A pixel offset with the default placement resolves to a constant margin
   * and never needs a rebuild.
   */
  #needsResizeRebuild() {
    const [elementEdge, viewportEdge] = this.#factors;
    return (
      isPercentageOffset(this.#config.offset) ||
      viewportEdge !== 1 ||
      elementEdge !== 0
    );
  }

  #setupResizeWatchers() {
    if (!this.#needsResizeRebuild()) return;

    this.#resizeHandler = () => this.#scheduleRefresh();
    window.addEventListener("resize", this.#resizeHandler, { passive: true });
    window.addEventListener("orientationchange", this.#resizeHandler, {
      passive: true,
    });

    if (typeof ResizeObserver === "undefined") return;

    // Catches layout changes that never resize the window - images loading,
    // fonts swapping, content expanding - which move element heights.
    let primed = false;
    this.#resizeObserver = new ResizeObserver(() => {
      // observe() always delivers one callback immediately; ignore it.
      if (!primed) {
        primed = true;
        return;
      }
      this.#scheduleRefresh();
    });
    this.#resizeObserver.observe(document.documentElement);
  }

  #scheduleRefresh() {
    if (this.#isDestroyed) return;
    clearTimeout(this.#resizeTimer);
    this.#resizeTimer = setTimeout(() => {
      this.#resizeTimer = null;
      this.refresh();
    }, RESIZE_DEBOUNCE);
  }

  /**
   * Rebuild every trigger line and re-check the current state
   */
  refresh() {
    if (this.#isDestroyed) return;

    this.#teardownObservers();

    const [elementEdge] = this.#factors;
    this.#states.forEach((state, element) => {
      if (state.done) return;
      if (elementEdge === 0) {
        state.height = 0;
        return;
      }
      // Layout has settled by refresh time, so heights can be read directly.
      // A zero height means the element is still hidden and has to go back
      // through the deferred measurement path.
      const height = element.getBoundingClientRect().height;
      state.height = height > 0 ? height : null;
    });

    this.#build();
    this.#evaluateAll();
  }

  /**
   * Disconnect every observer and listener
   */
  destroy() {
    if (this.#isDestroyed) return;
    this.#isDestroyed = true;

    this.#teardownObservers();

    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
      this.#resizeObserver = null;
    }

    if (this.#resizeHandler) {
      window.removeEventListener("resize", this.#resizeHandler);
      window.removeEventListener("orientationchange", this.#resizeHandler);
      this.#resizeHandler = null;
    }

    if (this.#resizeTimer) {
      clearTimeout(this.#resizeTimer);
      this.#resizeTimer = null;
    }

    if (this.#scrollHandler) {
      window.removeEventListener("scroll", this.#scrollHandler);
      this.#scrollHandler = null;
    }

    if (this.#scrollFrame !== null) {
      cancelAnimationFrame(this.#scrollFrame);
      this.#scrollFrame = null;
    }

    this.#states.clear();
  }
}

/**
 * Fire a callback when elements cross a trigger line in the viewport
 *
 * The line sits `offset` pixels above the viewport edge named by `placement`,
 * and each element is measured against it at the edge named by `placement`
 * (see the nine AOS anchor placements).
 *
 * @example
 * const cross = observeCross('.card', {
 *   offset: '10%',
 *   placement: 'center-bottom',
 *   once: true,
 *   onCross: (el) => el.classList.add('is-visible'),
 * });
 *
 * @param {string|Element|NodeList|Array<Element>} elements - Elements to watch
 * @param {Object} [options] - Configuration options
 * @param {number|string} [options.offset=0] - Distance above the viewport edge to place the trigger line (px or percentage like '20%')
 * @param {string} [options.placement='top-bottom'] - Anchor placement, `<element-edge>-<viewport-edge>`: top/center/bottom paired with bottom/center/top
 * @param {boolean} [options.once=false] - Stop tracking an element after it crosses
 * @param {boolean} [options.syncOnScroll=false] - Re-check on a passive scroll listener, covering IntersectionObserver lag during momentum scrolling
 * @param {number} [options.threshold=0] - IntersectionObserver threshold; affects only how sensitively the observer wakes up, not where the trigger line sits
 * @param {Function} [options.onCross] - Called as (element, entry) when an element crosses the line; entry is null when the check came from a scroll or refresh
 * @param {Function} [options.onExit] - Called as (element, entry) when an element moves back below the line (never fires with `once: true`)
 * @returns {{refresh: Function, destroy: Function}} Handle for recalculating or tearing down
 */
function observeCross(elements, options = {}) {
  // Runs under Node during static prerendering
  if (typeof window === "undefined") {
    return { refresh() {}, destroy() {} };
  }

  const instance = new CrossObserver(elements, options);

  return {
    refresh: () => instance.refresh(),
    destroy: () => instance.destroy(),
  };
}

/**
 * ScrollTrigger - Scroll spy plugin for tracking section visibility
 *
 * Monitors when sections cross a configurable trigger line in the viewport
 * (measured from the bottom) and provides callbacks for navigation synchronization.
 *
 * @example
 * const trigger = new ScrollTrigger({
 *   sections: '.collection-section',
 *   offset: 100, // 100px from bottom of viewport
 *   onIndexChange: ({ currentIndex, currentElement }) => {
 *     console.log('Active section:', currentIndex);
 *   }
 * });
 */
class ScrollTrigger {
  // Private fields
  #elements = [];
  #currentIndex = -1;
  #crossObservers = [];
  #config = {
    offset: 100,
    threshold: 0.1,
    throttle: 50,
    behavior: "smooth",
    onIndexChange: null,
  };
  #throttleTimer = null;
  #isDestroyed = false;
  #resizeObserver = null;

  /**
   * Create a new ScrollTrigger instance
   * @param {Object} options - Configuration options
   * @param {string|NodeList|Array} options.sections - Sections to track (CSS selector, NodeList, or Array of elements)
   * @param {number|string} [options.offset=100] - Distance from bottom of viewport to trigger active state (px or percentage like '20%')
   * @param {number} [options.threshold=0.1] - IntersectionObserver threshold (0-1)
   * @param {number} [options.throttle=100] - Throttle delay for scroll events (ms)
   * @param {string} [options.behavior='smooth'] - Scroll behavior ('smooth' or 'auto')
   * @param {Function} [options.onIndexChange] - Callback when active section changes (receives object: { currentIndex, previousIndex, currentElement, previousElement })
   */
  constructor(options = {}) {
    // Merge config
    this.#config = { ...this.#config, ...options };

    // Get elements
    this.#elements = resolveElements(this.#config.sections);

    if (this.#elements.length === 0) {
      console.warn("ScrollTrigger: No elements found");
      return;
    }

    // Initialize observers
    this.#setupObservers();

    // Watch for viewport resize if any element uses percentage offset
    if (this.#hasPercentageOffsets()) {
      this.#setupResizeObserver();
    }
  }

  /**
   * Get the offset for a specific element (custom or default)
   * Checks for data-animate-offset attribute, falls back to config
   */
  #getElementOffset(element) {
    if (!element) return this.#config.offset;

    const customOffset = element.getAttribute("data-animate-offset");
    if (customOffset !== null) {
      // Parse as number if it's just digits, otherwise return as string (for percentages)
      return /^\d+$/.test(customOffset)
        ? parseInt(customOffset, 10)
        : customOffset;
    }

    return this.#config.offset;
  }

  /**
   * Check if any element (or config) uses a percentage offset
   */
  #hasPercentageOffsets() {
    // Check global config
    if (isPercentageOffset(this.#config.offset)) {
      return true;
    }

    // Check if any element has a custom percentage offset
    return this.#elements.some((element) => {
      const customOffset = element.getAttribute("data-animate-offset");
      return customOffset && isPercentageOffset(customOffset);
    });
  }

  /**
   * Setup ResizeObserver to handle viewport changes with percentage offsets
   * The trigger lines themselves rebuild inside observeCross - this only forces
   * the index to be recomputed against the new viewport height.
   */
  #setupResizeObserver() {
    this.#resizeObserver = new ResizeObserver(() => {
      this.#throttleIndexUpdate();
    });

    this.#resizeObserver.observe(document.documentElement);
  }

  /**
   * Watch every element against its own trigger line
   * Elements are grouped by effective offset so a crossing is reported at the
   * exact scroll position where the active index can change.
   */
  #setupObservers() {
    const groups = new Map();

    this.#elements.forEach((element) => {
      const offset = this.#getElementOffset(element);
      const key = String(offset);
      if (!groups.has(key)) groups.set(key, { offset, elements: [] });
      groups.get(key).elements.push(element);
    });

    groups.forEach(({ offset, elements }) => {
      this.#crossObservers.push(
        observeCross(elements, {
          offset,
          placement: "top-bottom",
          threshold: this.#config.threshold,
          syncOnScroll: true,
          onCross: () => this.#throttleIndexUpdate(),
          onExit: () => this.#throttleIndexUpdate(),
        }),
      );
    });
  }

  /**
   * Disconnect every trigger-line observer
   */
  #teardownObservers() {
    this.#crossObservers.forEach((observer) => observer.destroy());
    this.#crossObservers = [];
  }

  /**
   * Throttle index updates to prevent excessive calls
   */
  #throttleIndexUpdate() {
    if (this.#throttleTimer) return;

    this.#throttleTimer = setTimeout(() => {
      this.#updateActiveIndex();
      this.#throttleTimer = null;
    }, this.#config.throttle);
  }

  /**
   * Update the active index based on intersecting elements
   * Supports per-element custom offsets via data-animate-offset attribute
   */
  #updateActiveIndex() {
    if (this.#isDestroyed) return;

    // Check each element against its custom offset
    let newIndex = -1;

    // Find the closest element that has crossed its trigger line
    // Check from bottom to top to find the last one that crossed
    for (let i = this.#elements.length - 1; i >= 0; i--) {
      const element = this.#elements[i];
      const elementOffset = this.#getElementOffset(element);
      const offsetPx = offsetToPixels(elementOffset, 100);
      const triggerLine = window.innerHeight - offsetPx;

      const rect = element.getBoundingClientRect();

      // If this element's top is at or above its trigger line, it's active
      if (rect.top <= triggerLine) {
        newIndex = i;
        break;
      }
    }

    // Fire callback if index changed
    if (newIndex !== this.#currentIndex) {
      const previousIndex = this.#currentIndex;
      this.#currentIndex = newIndex;

      const currentElement = this.#elements[newIndex] || null;
      const previousElement = this.#elements[previousIndex] || null;

      if (
        this.#config.onIndexChange &&
        typeof this.#config.onIndexChange === "function"
      ) {
        this.#config.onIndexChange({
          currentIndex: newIndex,
          previousIndex,
          currentElement,
          previousElement,
        });
      }

      // Emit custom event
      this.#emitEvent("scroll-trigger:change", {
        index: newIndex,
        previousIndex,
        section: currentElement,
        previousSection: previousElement,
      });
    }
  }

  /**
   * Emit custom event
   */
  #emitEvent(eventName, detail) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(eventName, {
          bubbles: true,
          detail: detail,
        }),
      );
    }
  }

  /**
   * Get the current active index
   * @returns {number} Current active element index (-1 if none)
   */
  getCurrentIndex() {
    return this.#currentIndex;
  }

  /**
   * Get the current active element
   * @returns {Element|null} Current active element or null
   */
  getCurrentElement() {
    return this.#elements[this.#currentIndex] || null;
  }

  /**
   * Get all tracked elements
   * @returns {Array<Element>} Array of tracked elements
   */
  getElements() {
    return [...this.#elements];
  }

  /**
   * Scroll to a specific element by index
   * @param {number} index - Index of element to scroll to
   * @param {Object} [options] - Scroll options
   * @param {string} [options.behavior] - Scroll behavior ('smooth' or 'auto')
   * @param {number} [options.offset] - Additional offset in pixels (positive = element appears higher, negative = element appears lower)
   */
  scrollToIndex(index, options = {}) {
    if (index < 0 || index >= this.#elements.length) {
      console.warn(`ScrollTrigger: Invalid index ${index}`);
      return;
    }

    const element = this.#elements[index];
    const behavior = options.behavior || this.#config.behavior;
    const additionalOffset = options.offset || 0;

    // Calculate offset from bottom in pixels (respects element's custom offset)
    const elementOffset = this.#getElementOffset(element);
    const offsetPx = offsetToPixels(elementOffset, 100);
    const triggerLine = window.innerHeight - offsetPx;

    const rect = element.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const targetPosition =
      rect.top + scrollTop - triggerLine - additionalOffset;

    window.scrollTo({
      top: targetPosition,
      behavior: behavior,
    });
  }

  /**
   * Scroll to a specific element
   * @param {Element} element - Element to scroll to
   * @param {Object} [options] - Scroll options (see scrollToIndex)
   */
  scrollToElement(element, options = {}) {
    const index = this.#elements.indexOf(element);
    if (index === -1) {
      console.warn("ScrollTrigger: Element not found in tracked elements");
      return;
    }
    this.scrollToIndex(index, options);
  }

  /**
   * Recalculate element positions (call if DOM changes)
   */
  refresh() {
    if (this.#isDestroyed) return;

    // Rebuild trigger lines - per-element offsets may have changed too
    this.#teardownObservers();
    this.#setupObservers();

    // Force index update
    this.#updateActiveIndex();
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig = {}) {
    if (this.#isDestroyed) return;

    const needsObserverUpdate =
      ("offset" in newConfig && newConfig.offset !== this.#config.offset) ||
      ("threshold" in newConfig &&
        newConfig.threshold !== this.#config.threshold);

    this.#config = { ...this.#config, ...newConfig };

    // Handle resize observer for percentage changes
    if ("offset" in newConfig) {
      const hasPercentages = this.#hasPercentageOffsets();

      if (hasPercentages && !this.#resizeObserver) {
        this.#setupResizeObserver();
      } else if (!hasPercentages && this.#resizeObserver) {
        this.#resizeObserver.disconnect();
        this.#resizeObserver = null;
      }
    }

    if (needsObserverUpdate) {
      this.#teardownObservers();
      this.#setupObservers();
    }
  }

  /**
   * Destroy the tracker and cleanup
   */
  destroy() {
    if (this.#isDestroyed) return;

    this.#isDestroyed = true;

    // Clear throttle timer
    if (this.#throttleTimer) {
      clearTimeout(this.#throttleTimer);
      this.#throttleTimer = null;
    }

    // Disconnect trigger-line observers and their scroll listeners
    this.#teardownObservers();

    // Disconnect resize observer
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
      this.#resizeObserver = null;
    }

    // Clear arrays
    this.#elements = [];
    this.#currentIndex = -1;
  }
}

exports.default = ScrollTrigger;
exports.observeCross = observeCross;
//# sourceMappingURL=scroll-trigger.cjs.js.map
