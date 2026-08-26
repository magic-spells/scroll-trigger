import {
  isPercentageOffset,
  offsetToPixels,
  resolveElements,
} from "./utils.js";

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
export function observeCross(elements, options = {}) {
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

export default observeCross;
