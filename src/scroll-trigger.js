import "./scroll-trigger.css";
import { observeCross } from "./observe-cross.js";
import {
  isPercentageOffset,
  offsetToPixels,
  resolveElements,
} from "./utils.js";

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

// Export for external use
export default ScrollTrigger;
export { observeCross };
