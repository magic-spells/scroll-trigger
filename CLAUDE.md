# ScrollTrigger - Scroll-based Section Tracking Plugin

This file provides comprehensive guidance to Claude Code when working with the ScrollTrigger plugin.

## Project Overview

ScrollTrigger is a lightweight, performant JavaScript plugin that tracks when sections of a page enter or exit a trigger zone in the viewport. It's designed for building scroll-synchronized navigation (like active navigation items that highlight as you scroll), collection pages with category navigation, documentation sites with table of contents, and any interface that needs to respond to scroll position changes.

**Key Characteristics:**
- **Modern & Performant**: Uses IntersectionObserver API for efficient viewport tracking
- **Zero Dependencies**: Pure vanilla JavaScript with no external libraries
- **Flexible Configuration**: Supports pixel or percentage-based trigger offsets
- **Event-Driven**: Provides callbacks and custom events for easy integration
- **Responsive**: Automatically adapts to viewport changes when using percentage offsets
- **Browser Compatible**: Works in all modern browsers with IntersectionObserver support

## Commands

- `npm run build` - Build all distribution files (ESM, CJS, UMD, minified) using Rollup
- `npm run dev` or `npm run serve` - Start development server with watch mode on port 3003, opens browser automatically
- `npm run lint` - Run ESLint on source files and rollup config
- `npm run format` - Format code with Prettier

## Architecture

### Core Module Structure

```
scroll-trigger/
├── src/
│   ├── scroll-trigger.js     - Main ScrollTrigger class
│   └── scroll-trigger.scss   - Optional utility styles
├── dist/                      - Built files (generated)
│   ├── scroll-trigger.esm.js
│   ├── scroll-trigger.cjs.js
│   ├── scroll-trigger.js     - UMD
│   ├── scroll-trigger.min.js
│   ├── scroll-trigger.css
│   ├── scroll-trigger.min.css
│   └── scroll-trigger.scss
├── demo/
│   └── index.html            - Live demonstration with 6 sections
├── rollup.config.mjs         - Multi-format build configuration
└── package.json
```

### Key Architecture Concepts

#### ScrollTrigger Class

The main export is a pure JavaScript class (not a web component) that provides scroll-based section tracking:

**Private Fields:**
- `#sections` - Array of DOM elements being tracked
- `#currentIndex` - Index of currently active section (-1 if none)
- `#observer` - IntersectionObserver instance
- `#resizeObserver` - ResizeObserver for percentage offsets (optional)
- `#config` - Configuration object with defaults
- `#intersectingMap` - Map tracking which sections are intersecting
- `#throttleTimer` - Timer for throttling updates
- `#isDestroyed` - Flag to prevent operations after cleanup

**Public Methods:**
- `getCurrentIndex()` - Returns current active element index
- `getCurrentElement()` - Returns current active element
- `getElements()` - Returns array of all tracked elements
- `scrollToIndex(index, options)` - Programmatically scroll to an element
- `scrollToElement(element, options)` - Scroll to a specific element
- `refresh()` - Recalculate element positions after DOM changes
- `updateConfig(newConfig)` - Update configuration dynamically
- `destroy()` - Cleanup and remove all observers

#### IntersectionObserver Implementation

The plugin uses IntersectionObserver with a custom rootMargin to create a "trigger zone":

```javascript
const offsetPx = this.#calculateOffset(this.#config.offset);
const rootMargin = `-${offsetPx}px 0px -${window.innerHeight - offsetPx - 1}px 0px`;
```

This creates a horizontal line at the specified offset from the top of the viewport. When a section crosses this line, it becomes "active".

**How it works:**
1. Each section is observed by the IntersectionObserver
2. When a section enters the trigger zone, it's marked as intersecting
3. The first intersecting section becomes the active section
4. If no sections are intersecting, fallback logic finds the closest section above the trigger line
5. When the active index changes, the `onIndexChange` callback fires

#### Offset Calculation (Pixels vs Percentages)

The plugin supports two offset modes:

**Pixel Mode** (default):
```javascript
offset: 100  // Trigger at 100px from bottom of viewport
```

**Percentage Mode** (NEW feature):
```javascript
offset: '20%'  // Trigger at 20% from bottom (80% down the viewport)
offset: '50%'  // Trigger at middle of viewport
offset: '75%'  // Trigger at 75% from bottom (25% down the viewport)
```

When using percentages:
- The offset is calculated as: `Math.round(window.innerHeight * (percentage / 100))`
- A ResizeObserver watches for viewport changes and recalculates the trigger zone
- This ensures responsive behavior across different screen sizes

#### Throttling & Performance

Updates are throttled to prevent excessive callback firing:

```javascript
#throttleIndexUpdate() {
  if (this.#throttleTimer) return;

  this.#throttleTimer = setTimeout(() => {
    this.#updateActiveIndex();
    this.#throttleTimer = null;
  }, this.#config.throttle);
}
```

Default throttle is 100ms but can be configured. This means the `onIndexChange` callback won't fire more than once per throttle period, even if the user scrolls rapidly.

#### Event System

The plugin provides two ways to respond to section changes:

**1. Callback Function:**
```javascript
new ScrollTrigger({
  sections: '.section',
  onIndexChange: ({ currentIndex, previousIndex }) => {
    console.log(`Changed from ${previousIndex} to ${currentIndex}`);
  }
});
```

**2. Custom Events:**
```javascript
window.addEventListener('scroll-trigger:change', (e) => {
  console.log('Index:', e.detail.index);
  console.log('Previous:', e.detail.previousIndex);
  console.log('Section:', e.detail.section);
  console.log('Previous section:', e.detail.previousSection);
});
```

Both fire simultaneously when the active section changes.

### Build System

Uses Rollup to generate multiple distribution formats:

**Output Formats:**
- **ESM** (`scroll-trigger.esm.js`) - For modern bundlers, tree-shakeable
- **CJS** (`scroll-trigger.cjs.js`) - For Node.js and older bundlers
- **UMD** (`scroll-trigger.js`) - Universal format for direct browser use
- **Minified UMD** (`scroll-trigger.min.js`) - Production-ready, optimized
- **CSS** (`scroll-trigger.css` + minified) - Optional utility styles
- **SCSS** (`scroll-trigger.scss`) - Source styles for customization

**Development Mode:**
When running `npm run dev`, Rollup:
1. Watches source files for changes
2. Rebuilds on save
3. Copies built files to demo folder
4. Serves demo folder on port 3003
5. Opens browser automatically

### Demo Architecture

The demo (`demo/index.html`) showcases a complete implementation:

**Features Demonstrated:**
- 6 tall sections (Cereal, Granola, Snacks, Cookies, Crackers, Protein Bars)
- Horizontal navigation that auto-scrolls to keep active item visible
- Product grids in each section (simulating a collection page)
- Debug panel showing active index, section name, and scroll position
- Click-to-navigate functionality

**Implementation Pattern:**
```javascript
const trigger = new ScrollTrigger({
  sections: '.section',
  offset: 100,
  threshold: 0,
  throttle: 50,
  behavior: 'smooth',
  onIndexChange: ({ currentIndex }) => {
    // Update navigation active state
    updateNavigation(currentIndex);

    // Update debug panel
    updateDebugPanel(currentIndex);
  }
});

// Manual navigation
navItems.forEach((item, index) => {
  item.addEventListener('click', () => {
    trigger.scrollToIndex(index);
  });
});
```

## Configuration Options

### sections (required)
**Type:** `string | NodeList | Array<Element>`
**Description:** Elements to track. Can be:
- CSS selector string: `'.section'`
- NodeList: `document.querySelectorAll('.section')`
- Array of elements: `[el1, el2, el3]`

**Example:**
```javascript
// CSS Selector
new ScrollTrigger({ sections: '.collection-section' });

// NodeList
const sections = document.querySelectorAll('[data-section]');
new ScrollTrigger({ sections });

// Array
new ScrollTrigger({ sections: [section1, section2] });
```

### offset
**Type:** `number | string`
**Default:** `100`
**Description:** Distance from bottom of viewport where sections become "active". Supports:
- Numbers for pixels: `100` = 100px from bottom
- Strings for percentages: `'20%'` = 20% from bottom

**Important:** Percentage is measured from the BOTTOM of the viewport:
- `'0%'` = Bottom of viewport (trigger at very bottom)
- `'20%'` = 20% from bottom (80% down the page)
- `'50%'` = Middle of viewport
- `'75%'` = 75% from bottom (25% down the page)
- `'100%'` = Top of viewport (trigger at very top)

**Example:**
```javascript
// Pixel offset - trigger at 100px from bottom
new ScrollTrigger({ offset: 100 });

// Percentage offset - trigger at 20% from bottom
new ScrollTrigger({ offset: '20%' });

// Trigger near top - 80% from bottom = 20% down from top
new ScrollTrigger({ offset: '80%' });
```

#### Per-Element Custom Offsets

Each tracked element can override the global `offset` using the `data-animate-offset` attribute:

```html
<!-- Elements with custom offsets -->
<div class="product-grid" data-animate-fade-up>
  Uses global offset (from config)
</div>

<div class="product-grid" data-animate-fade-up data-animate-offset="15%">
  Triggers at 15% from bottom
</div>

<div class="product-grid" data-animate-fade-up data-animate-offset="50">
  Triggers at 50px from bottom
</div>

<div class="product-grid" data-animate-fade-up data-animate-offset="20%">
  Triggers at 20% from bottom
</div>
```

```javascript
const scrollAnimation = new ScrollTrigger({
  sections: '[data-animate-fade-up]',
  offset: '10%', // Default for elements without data-animate-offset
  onIndexChange: ({ currentElement }) => {
    if (currentElement && !currentElement.hasAttribute('data-animate-loaded')) {
      currentElement.setAttribute('data-animate-loaded', '');
    }
  }
});
```

**How it works:**
- `#getElementOffset(element)` checks each element for `data-animate-offset` attribute
- If found, uses that value; otherwise falls back to `this.#config.offset`
- `#updateActiveIndex()` calculates trigger line per-element using custom offset
- `scrollToIndex()` respects the target element's custom offset when scrolling
- Supports both pixel values (`100`) and percentages (`'20%'`)
- `#hasPercentageOffsets()` checks if ANY element uses percentage (for ResizeObserver)

**Use cases:**
- Staggered scroll animations with different trigger points
- Different timing for hero sections vs content sections
- Fine-tuned control over when each element becomes active

### threshold
**Type:** `number`
**Default:** `0.1`
**Range:** `0.0` to `1.0`
**Description:** IntersectionObserver threshold. How much of the section must be visible:
- `0` = Any pixel visible triggers
- `0.1` = 10% visible
- `0.5` = 50% visible
- `1.0` = 100% visible

**Recommendation:** Use `0` or low values (0.1-0.2) for best results with scroll-triggered navigation.

### throttle
**Type:** `number`
**Default:** `100`
**Units:** milliseconds
**Description:** Delay between update checks. Higher values = better performance but less responsive. Lower values = more responsive but more CPU usage.

**Recommendations:**
- Smooth animations: `50-100ms`
- Normal use: `100-150ms`
- Performance critical: `200-300ms`

### behavior
**Type:** `string`
**Default:** `'smooth'`
**Options:** `'smooth' | 'auto'`
**Description:** Scroll behavior when using `scrollToIndex()` or `scrollToElement()`.
- `'smooth'` - Animated scroll
- `'auto'` - Instant jump

**Note:** Can be overridden per-scroll via options parameter.

### onIndexChange
**Type:** `Function | null`
**Default:** `null`
**Signature:** `({ currentIndex, previousIndex, currentElement, previousElement }) => void`
**Description:** Callback fired when active section changes.

**Parameters (destructured object):**
- `currentIndex` - Index of currently active element (-1 if none)
- `previousIndex` - Index of previously active element (-1 if none)
- `currentElement` - DOM element of currently active element (null if none)
- `previousElement` - DOM element of previously active element (null if none)

**Example:**
```javascript
new ScrollTrigger({
  sections: '.section',
  onIndexChange: ({ currentIndex }) => {
    // Remove active class from all nav items
    navItems.forEach(item => item.classList.remove('active'));

    // Add active class to current nav item
    if (currentIndex >= 0) {
      navItems[currentIndex].classList.add('active');

      // Scroll nav item into view
      navItems[currentIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }
});
```

## Usage Patterns

### Basic Setup

```javascript
import ScrollTrigger from '@magic-spells/scroll-trigger';
import '@magic-spells/scroll-trigger/css/min';

const trigger = new ScrollTrigger({
  sections: '.section',
  offset: 100,
  onIndexChange: ({ currentIndex, currentElement }) => {
    console.log('Active section:', currentIndex);
    console.log('Active element:', currentElement);
  }
});
```

### Navigation Synchronization

```javascript
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section');

const trigger = new ScrollTrigger({
  sections: sections,
  offset: '20%',  // Trigger at 20% from bottom
  onIndexChange: ({ currentIndex }) => {
    // Update nav active state
    navItems.forEach((item, i) => {
      item.classList.toggle('active', i === currentIndex);
    });
  }
});

// Click navigation
navItems.forEach((item, index) => {
  item.addEventListener('click', () => {
    trigger.scrollToIndex(index);
  });
});
```

### Dynamic Content

```javascript
const trigger = new ScrollTrigger({
  sections: '.section',
  offset: 100
});

// After adding/removing sections
document.getElementById('add-section').addEventListener('click', () => {
  // Add new section to DOM
  const newSection = document.createElement('section');
  newSection.className = 'section';
  document.body.appendChild(newSection);

  // Recalculate positions
  trigger.refresh();
});
```

### Responsive Offset

```javascript
// Use percentage for responsive behavior
const trigger = new ScrollTrigger({
  sections: '.section',
  offset: window.innerWidth < 768 ? '50%' : '20%'
});

// Or update dynamically
window.addEventListener('resize', () => {
  const newOffset = window.innerWidth < 768 ? '50%' : '20%';
  trigger.updateConfig({ offset: newOffset });
});
```

### Event Listener Alternative

```javascript
// Instead of callback, use event listener
const trigger = new ScrollTrigger({
  sections: '.section',
  offset: 100
});

window.addEventListener('scroll-trigger:change', (e) => {
  console.log('New index:', e.detail.index);
  console.log('Previous index:', e.detail.previousIndex);
  console.log('Current element:', e.detail.section);
  console.log('Previous element:', e.detail.previousSection);

  // Update UI
  updateNavigation(e.detail.index);
});
```

### Manual Control

```javascript
const trigger = new ScrollTrigger({
  sections: '.section'
});

// Programmatic scrolling
document.getElementById('go-to-top').addEventListener('click', () => {
  trigger.scrollToIndex(0);
});

document.getElementById('go-to-end').addEventListener('click', () => {
  const lastIndex = trigger.getElements().length - 1;
  trigger.scrollToIndex(lastIndex);
});

// Get current state
console.log('Current index:', trigger.getCurrentIndex());
console.log('Current element:', trigger.getCurrentElement());
```

### Cleanup

```javascript
const trigger = new ScrollTrigger({
  sections: '.section'
});

// When component unmounts or page changes
function cleanup() {
  trigger.destroy();
}

// Single Page App example
router.on('beforeLeave', cleanup);
```

## Common Use Cases

### Collection Page with Category Navigation

Perfect for Shopify collection pages with product categories:

```javascript
const trigger = new ScrollTrigger({
  sections: '[data-category-section]',
  offset: '15%',  // Trigger when section is 15% from bottom
  throttle: 50,
  onIndexChange: ({ currentIndex }) => {
    const categories = document.querySelectorAll('[data-category-nav]');
    const container = document.querySelector('.category-nav-container');

    categories.forEach((cat, i) => {
      cat.classList.toggle('active', i === currentIndex);
    });

    // Scroll horizontal nav to keep active item visible
    if (currentIndex >= 0) {
      categories[currentIndex].scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }
});
```

### Documentation Table of Contents

For documentation sites with auto-highlighting TOC:

```javascript
const trigger = new ScrollTrigger({
  sections: 'h2[id], h3[id]',  // Track headings with IDs
  offset: 80,  // Account for fixed header
  onIndexChange: ({ currentIndex }) => {
    // Update TOC
    document.querySelectorAll('.toc-link').forEach((link, i) => {
      link.classList.toggle('active', i === currentIndex);
    });
  }
});

// TOC click handling
document.querySelectorAll('.toc-link').forEach((link, index) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    trigger.scrollToIndex(index, {
      offset: -20  // Additional offset for breathing room
    });
  });
});
```

### Multi-Step Form Progress

Track form sections and update progress indicator:

```javascript
const trigger = new ScrollTrigger({
  sections: '.form-step',
  offset: '30%',
  onIndexChange: ({ currentIndex }) => {
    // Update progress bar
    const progress = ((currentIndex + 1) / sections.length) * 100;
    document.querySelector('.progress-bar').style.width = `${progress}%`;

    // Update step indicator
    document.querySelectorAll('.step-indicator').forEach((step, i) => {
      step.classList.toggle('active', i === currentIndex);
      step.classList.toggle('completed', i < currentIndex);
    });
  }
});
```

## API Reference

### Constructor

```javascript
new ScrollTrigger(options: Object)
```

Creates a new ScrollTrigger instance and immediately begins tracking sections.

**Returns:** ScrollTrigger instance

**Throws:** None (logs warning if no sections found)

### Methods

#### getCurrentIndex()
```javascript
trigger.getCurrentIndex(): number
```
Returns the index of the currently active section, or -1 if no section is active.

#### getCurrentElement()
```javascript
trigger.getCurrentElement(): Element | null
```
Returns the DOM element of the currently active element, or null if no element is active.

#### getElements()
```javascript
trigger.getElements(): Element[]
```
Returns a new array containing all tracked elements. Modifying this array doesn't affect the tracker.

#### scrollToIndex()
```javascript
trigger.scrollToIndex(index: number, options?: Object): void
```

Scrolls to the section at the specified index.

**Parameters:**
- `index` - Section index to scroll to
- `options.behavior` - Scroll behavior ('smooth' or 'auto'), overrides config
- `options.offset` - Additional pixel offset (positive = more space above section)

**Example:**
```javascript
// Smooth scroll to third section
trigger.scrollToIndex(2);

// Instant jump with extra offset
trigger.scrollToIndex(2, {
  behavior: 'auto',
  offset: 20
});
```

#### scrollToElement()
```javascript
trigger.scrollToElement(element: Element, options?: Object): void
```

Scrolls to a specific element. Options same as `scrollToIndex()`.

**Example:**
```javascript
const element = document.querySelector('#my-section');
trigger.scrollToElement(element, { behavior: 'smooth' });
```

#### refresh()
```javascript
trigger.refresh(): void
```

Recalculates section positions. Call this after:
- Adding or removing sections from the DOM
- Changing section heights
- Any layout changes that affect section positions

#### updateConfig()
```javascript
trigger.updateConfig(newConfig: Object): void
```

Updates configuration dynamically. Accepts same options as constructor. Will recreate observers if offset or threshold changes.

**Example:**
```javascript
// Change to percentage offset
trigger.updateConfig({ offset: '50%' });

// Update throttle for better performance
trigger.updateConfig({ throttle: 200 });

// Change callback
trigger.updateConfig({
  onIndexChange: ({ currentIndex, currentElement }) => {
    // New callback
  }
});
```

#### destroy()
```javascript
trigger.destroy(): void
```

Destroys the instance and cleans up all observers, timers, and event listeners. Call this when:
- Component unmounts
- Page navigation in SPA
- Plugin is no longer needed

After calling `destroy()`, the instance cannot be reused.

## Events

### scroll-trigger:change

Fired on `window` when the active section changes.

**Event Detail:**
```javascript
{
  index: number,                // New active index (-1 if none)
  previousIndex: number,        // Previous active index (-1 if none)
  section: Element | null,      // New active section element (null if none)
  previousSection: Element | null  // Previous active section element (null if none)
}
```

**Example:**
```javascript
window.addEventListener('scroll-trigger:change', (e) => {
  const { index, previousIndex, section } = e.detail;

  console.log(`Changed from section ${previousIndex} to ${index}`);

  if (section) {
    const sectionName = section.dataset.name;
    document.title = `${sectionName} | My Site`;
  }
});
```

## Styling

The plugin includes minimal optional styles:

```scss
// Smooth scroll behavior
html.scroll-trigger-smooth {
  scroll-behavior: smooth;
}

// Respect prefers-reduced-motion
@media (prefers-reduced-motion: reduce) {
  html.scroll-trigger-smooth {
    scroll-behavior: auto;
  }
}
```

**Usage:**
```html
<link rel="stylesheet" href="scroll-trigger.min.css">
```

## Browser Compatibility

**Required APIs:**
- IntersectionObserver (widely supported since 2019)
- ResizeObserver (for percentage offsets, widely supported)
- ES6 Classes and Private Fields
- Map, Set

**Supported Browsers:**
- Chrome 51+
- Firefox 55+
- Safari 12.1+
- Edge 15+

**Polyfills:**
Not included. If targeting older browsers, use IntersectionObserver polyfill.

## Performance Considerations

1. **Throttling** - Default 100ms throttle prevents excessive updates. Adjust based on needs.

2. **Observer Efficiency** - IntersectionObserver is more efficient than scroll event listeners. The plugin only uses scroll calculations as a fallback when no sections are intersecting.

3. **Memory** - Always call `destroy()` when done to prevent memory leaks.

4. **Resize Handling** - ResizeObserver only activates when using percentage offsets. Pixel offsets don't watch for resize.

5. **Section Count** - Performance is excellent even with 50+ sections. The algorithm is O(n) where n is number of sections.

## Troubleshooting

### Sections Not Triggering

**Problem:** Sections aren't becoming active when scrolling.

**Solutions:**
1. Check elements exist: `trigger.getElements()` should return elements
2. Verify offset isn't too high: Try `offset: 0` to test
3. Check threshold: Use `threshold: 0` for maximum sensitivity
4. Inspect console for warnings

### Navigation Not Updating

**Problem:** Callback fires but navigation doesn't update.

**Solutions:**
1. Verify callback receives correct index
2. Check DOM selectors for navigation items
3. Ensure navigation and sections have same count
4. Log callback params to debug

### Percentage Offset Not Responsive

**Problem:** Percentage offset doesn't update on resize.

**Solutions:**
1. Verify offset is a string: `'50%'` not `50%`
2. Check browser supports ResizeObserver
3. Call `refresh()` manually if needed

### Memory Leaks in SPA

**Problem:** Multiple instances created, memory usage grows.

**Solutions:**
1. Always call `destroy()` before creating new instance
2. Store instance reference for cleanup
3. Use framework lifecycle hooks (useEffect, onDestroy, etc.)

## Development Notes

- The plugin is designed to work without any UI framework
- It's intentionally not a web component - just a plain ES6 class for maximum flexibility
- Percentage offsets use `Math.round()` to ensure whole pixel values
- The fallback scroll calculation ensures a section is always active (unless all sections are below the viewport)
- Default exports and named exports both provided for compatibility
- Source maps included in development builds for debugging

## Testing Checklist

When modifying the plugin, test:

- [ ] Basic functionality with pixel offset
- [ ] Percentage offset calculation
- [ ] Viewport resize with percentage offset
- [ ] Callback fires with correct indices
- [ ] Custom events emit correctly
- [ ] `scrollToIndex()` works
- [ ] `scrollToElement()` works
- [ ] `refresh()` recalculates correctly
- [ ] `updateConfig()` updates observers
- [ ] `destroy()` cleans up everything
- [ ] Works with CSS selectors, NodeList, Array
- [ ] Throttling prevents excessive calls
- [ ] Works with 1 section, 100 sections
- [ ] Works when all sections fit in viewport
- [ ] Works when sections are very tall
- [ ] No console errors or warnings
