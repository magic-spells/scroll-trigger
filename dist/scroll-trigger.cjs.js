'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

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
  #observer = null;
  #config = {
    offset: 100,
    threshold: 0.1,
    throttle: 50,
    behavior: "smooth",
    onIndexChange: null,
  };
  #intersectingMap = new Map();
  #throttleTimer = null;
  #isDestroyed = false;
  #resizeObserver = null;
  #scrollHandler = null;

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
    this.#elements = this.#getElements(this.#config.sections);

    if (this.#elements.length === 0) {
      console.warn("ScrollTrigger: No elements found");
      return;
    }

    // Initialize observer
    this.#setupObserver();

    // Watch for viewport resize if any element uses percentage offset
    if (this.#hasPercentageOffsets()) {
      this.#setupResizeObserver();
    }

    // Add scroll listener as fallback for mobile
    this.#setupScrollListener();
  }

  /**
   * Get elements from various input types
   */
  #getElements(input) {
    if (typeof input === "string") {
      return Array.from(document.querySelectorAll(input));
    } else if (input instanceof NodeList) {
      return Array.from(input);
    } else if (Array.isArray(input)) {
      return input;
    }
    return [];
  }

  /**
   * Check if offset is a percentage value
   */
  #isPercentageOffset(offset) {
    return typeof offset === "string" && offset.includes("%");
  }

  /**
   * Calculate pixel offset from bottom of viewport
   * Converts percentage or pixel value to pixels from bottom
   */
  #calculateOffset(offset) {
    if (this.#isPercentageOffset(offset)) {
      const percentage = parseFloat(offset) / 100;
      return Math.round(window.innerHeight * percentage);
    }
    return typeof offset === "number" ? offset : 100;
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
    if (this.#isPercentageOffset(this.#config.offset)) {
      return true;
    }

    // Check if any element has a custom percentage offset
    return this.#elements.some((element) => {
      const customOffset = element.getAttribute("data-animate-offset");
      return customOffset && this.#isPercentageOffset(customOffset);
    });
  }

  /**
   * Setup ResizeObserver to handle viewport changes with percentage offsets
   */
  #setupResizeObserver() {
    this.#resizeObserver = new ResizeObserver(() => {
      // Recreate observer with new calculated offset
      if (this.#observer) {
        this.#observer.disconnect();
      }
      this.#setupObserver();
    });

    this.#resizeObserver.observe(document.documentElement);
  }

  /**
   * Setup scroll listener as fallback for mobile browsers
   * IntersectionObserver can miss events during momentum scrolling
   */
  #setupScrollListener() {
    this.#scrollHandler = () => {
      this.#throttleIndexUpdate();
    };

    window.addEventListener("scroll", this.#scrollHandler, { passive: true });
  }

  /**
   * Setup IntersectionObserver to track sections
   */
  #setupObserver() {
    // Calculate pixel offset from bottom (handles both px and %)
    const offsetPx = this.#calculateOffset(this.#config.offset);

    // Create observer with offset from bottom
    // Top margin removes everything above, bottom margin creates trigger zone
    const rootMargin = `0px 0px -${offsetPx}px 0px`;

    this.#observer = new IntersectionObserver(
      (entries) => this.#handleIntersection(entries),
      {
        root: null,
        rootMargin: rootMargin,
        threshold: this.#config.threshold,
      },
    );

    // Observe all elements
    this.#elements.forEach((element) => {
      this.#observer.observe(element);
      this.#intersectingMap.set(element, false);
    });
  }

  /**
   * Handle intersection events
   */
  #handleIntersection(entries) {
    if (this.#isDestroyed) return;

    // Update intersecting map
    entries.forEach((entry) => {
      this.#intersectingMap.set(entry.target, entry.isIntersecting);
    });

    // Throttle index calculation
    this.#throttleIndexUpdate();
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
      const offsetPx = this.#calculateOffset(elementOffset);
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
    const offsetPx = this.#calculateOffset(elementOffset);
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

    // Re-observe elements to update positions
    this.#elements.forEach((element) => {
      this.#observer.unobserve(element);
      this.#observer.observe(element);
    });

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
      if (this.#observer) {
        this.#observer.disconnect();
      }
      this.#setupObserver();
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

    // Disconnect observer
    if (this.#observer) {
      this.#observer.disconnect();
      this.#observer = null;
    }

    // Disconnect resize observer
    if (this.#resizeObserver) {
      this.#resizeObserver.disconnect();
      this.#resizeObserver = null;
    }

    // Remove scroll listener
    if (this.#scrollHandler) {
      window.removeEventListener("scroll", this.#scrollHandler);
      this.#scrollHandler = null;
    }

    // Clear maps and arrays
    this.#intersectingMap.clear();
    this.#elements = [];
    this.#currentIndex = -1;
  }
}

exports.default = ScrollTrigger;
//# sourceMappingURL=scroll-trigger.cjs.js.map
