(function (global, factory) {
  typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
  typeof define === 'function' && define.amd ? define(['exports'], factory) :
  (global = typeof globalThis !== 'undefined' ? globalThis : global || self, factory(global.ScrollTrigger = {}));
})(this, (function (exports) { 'use strict';

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
   *   onIndexChange: (newIndex, oldIndex, newElement, oldElement) => {
   *     console.log('Active section:', newIndex);
   *   }
   * });
   */
  class ScrollTrigger {
    // Private fields
    #sections = [];
    #currentIndex = -1;
    #observer = null;
    #config = {
      offset: 100,
      threshold: 0.1,
      throttle: 100,
      behavior: 'smooth',
      onIndexChange: null,
    };
    #intersectingMap = new Map();
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
     * @param {Function} [options.onIndexChange] - Callback when active section changes (receives newIndex, oldIndex, newElement, oldElement)
     */
    constructor(options = {}) {
      // Merge config
      this.#config = { ...this.#config, ...options };

      // Get sections
      this.#sections = this.#getSections(this.#config.sections);

      if (this.#sections.length === 0) {
        console.warn('ScrollTrigger: No sections found');
        return;
      }

      // Initialize observer
      this.#setupObserver();

      // Watch for viewport resize if any element uses percentage offset
      if (this.#hasPercentageOffsets()) {
        this.#setupResizeObserver();
      }
    }

    /**
     * Get sections from various input types
     */
    #getSections(input) {
      if (typeof input === 'string') {
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
      return typeof offset === 'string' && offset.includes('%');
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
      return typeof offset === 'number' ? offset : 100;
    }

    /**
     * Get the offset for a specific element (custom or default)
     * Checks for data-animate-offset attribute, falls back to config
     */
    #getElementOffset(element) {
      if (!element) return this.#config.offset;

      const customOffset = element.getAttribute('data-animate-offset');
      if (customOffset !== null) {
        // Parse as number if it's just digits, otherwise return as string (for percentages)
        return /^\d+$/.test(customOffset) ? parseInt(customOffset, 10) : customOffset;
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
      return this.#sections.some((section) => {
        const customOffset = section.getAttribute('data-animate-offset');
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
        }
      );

      // Observe all sections
      this.#sections.forEach((section) => {
        this.#observer.observe(section);
        this.#intersectingMap.set(section, false);
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
     * Update the active index based on intersecting sections
     * Supports per-element custom offsets via data-animate-offset attribute
     */
    #updateActiveIndex() {
      if (this.#isDestroyed) return;

      // Check each section against its custom offset
      let newIndex = -1;

      // Find the closest section that has crossed its trigger line
      // Check from bottom to top to find the last one that crossed
      for (let i = this.#sections.length - 1; i >= 0; i--) {
        const section = this.#sections[i];
        const elementOffset = this.#getElementOffset(section);
        const offsetPx = this.#calculateOffset(elementOffset);
        const triggerLine = window.innerHeight - offsetPx;

        const rect = section.getBoundingClientRect();

        // If this section's top is at or above its trigger line, it's active
        if (rect.top <= triggerLine) {
          newIndex = i;
          break;
        }
      }

      // Fire callback if index changed
      if (newIndex !== this.#currentIndex) {
        const oldIndex = this.#currentIndex;
        this.#currentIndex = newIndex;

        const newElement = this.#sections[newIndex] || null;
        const oldElement = this.#sections[oldIndex] || null;

        if (this.#config.onIndexChange && typeof this.#config.onIndexChange === 'function') {
          this.#config.onIndexChange(newIndex, oldIndex, newElement, oldElement);
        }

        // Emit custom event
        this.#emitEvent('scroll-trigger:change', {
          index: newIndex,
          previousIndex: oldIndex,
          section: newElement,
          previousSection: oldElement,
        });
      }
    }

    /**
     * Emit custom event
     */
    #emitEvent(eventName, detail) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent(eventName, {
            bubbles: true,
            detail: detail,
          })
        );
      }
    }

    /**
     * Get the current active index
     * @returns {number} Current active section index (-1 if none)
     */
    getCurrentIndex() {
      return this.#currentIndex;
    }

    /**
     * Get the current active section element
     * @returns {Element|null} Current active section element or null
     */
    getCurrentSection() {
      return this.#sections[this.#currentIndex] || null;
    }

    /**
     * Get all tracked sections
     * @returns {Array<Element>} Array of section elements
     */
    getSections() {
      return [...this.#sections];
    }

    /**
     * Scroll to a specific section by index
     * @param {number} index - Index of section to scroll to
     * @param {Object} [options] - Scroll options
     * @param {string} [options.behavior] - Scroll behavior ('smooth' or 'auto')
     * @param {number} [options.offset] - Additional offset in pixels (positive = section appears higher, negative = section appears lower)
     */
    scrollToIndex(index, options = {}) {
      if (index < 0 || index >= this.#sections.length) {
        console.warn(`ScrollTrigger: Invalid index ${index}`);
        return;
      }

      const section = this.#sections[index];
      const behavior = options.behavior || this.#config.behavior;
      const additionalOffset = options.offset || 0;

      // Calculate offset from bottom in pixels (respects element's custom offset)
      const elementOffset = this.#getElementOffset(section);
      const offsetPx = this.#calculateOffset(elementOffset);
      const triggerLine = window.innerHeight - offsetPx;

      const rect = section.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const targetPosition = rect.top + scrollTop - triggerLine - additionalOffset;

      window.scrollTo({
        top: targetPosition,
        behavior: behavior,
      });
    }

    /**
     * Scroll to a specific section element
     * @param {Element} section - Section element to scroll to
     * @param {Object} [options] - Scroll options (see scrollToIndex)
     */
    scrollToSection(section, options = {}) {
      const index = this.#sections.indexOf(section);
      if (index === -1) {
        console.warn('ScrollTrigger: Section not found in tracked sections');
        return;
      }
      this.scrollToIndex(index, options);
    }

    /**
     * Recalculate section positions (call if DOM changes)
     */
    refresh() {
      if (this.#isDestroyed) return;

      // Re-observe sections to update positions
      this.#sections.forEach((section) => {
        this.#observer.unobserve(section);
        this.#observer.observe(section);
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
        ('offset' in newConfig && newConfig.offset !== this.#config.offset) ||
        ('threshold' in newConfig && newConfig.threshold !== this.#config.threshold);

      this.#config = { ...this.#config, ...newConfig };

      // Handle resize observer for percentage changes
      if ('offset' in newConfig) {
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

      // Clear maps and arrays
      this.#intersectingMap.clear();
      this.#sections = [];
      this.#currentIndex = -1;
    }
  }

  exports.ScrollTrigger = ScrollTrigger;
  exports.default = ScrollTrigger;

  Object.defineProperty(exports, '__esModule', { value: true });

}));
//# sourceMappingURL=scroll-trigger.js.map
