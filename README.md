# ScrollTrigger

Lightweight scroll-spy plugin for tracking section visibility and syncing navigation state. Perfect for collection pages, documentation, and long-form content. **Only 2.6kb gzipped.**

[**Live Demo**](https://magic-spells.github.io/scroll-trigger/demo/)


## Features

- 🪶 **Tiny bundle** - Only 2.6kb gzipped
- 🎯 **IntersectionObserver-based** - Modern, performant section tracking
- 🔄 **Callback system** - Easy integration with custom navigation
- ⚡ **Throttled updates** - Optimized performance with configurable throttling
- 📍 **Precise control** - Customizable trigger offset from viewport bottom
- 🎨 **Zero dependencies** - Pure vanilla JavaScript
- 🔧 **Flexible API** - Supports CSS selectors, NodeList, or element arrays
- 🎬 **`observeCross`** - Standalone viewport-crossing helper with the nine AOS anchor placements
- 📦 **Multiple formats** - ESM, CommonJS, and UMD builds

## Installation

```bash
npm install @magic-spells/scroll-trigger
```

Or use via CDN:

```html
<script type="module">
  import ScrollTrigger from 'https://unpkg.com/@magic-spells/scroll-trigger';
</script>
```

## Basic Usage

```javascript
import ScrollTrigger from '@magic-spells/scroll-trigger';

const trigger = new ScrollTrigger({
  sections: '.collection-section',
  offset: 100,
  onIndexChange: ({ currentIndex, currentElement }) => {
    // Update your navigation
    console.log('Active section:', currentIndex);
    console.log('Trigger element:', currentElement);
  }
});
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `sections` | `string\|NodeList\|Array` | required | Sections to track (CSS selector, NodeList, or Array) |
| `offset` | `number\|string` | `100` | Distance from bottom of viewport to trigger active state (px or percentage like `'50%'`) |
| `threshold` | `number` | `0.1` | IntersectionObserver threshold (0-1) |
| `throttle` | `number` | `100` | Throttle delay for updates (ms) |
| `behavior` | `string` | `'smooth'` | Scroll behavior ('smooth' or 'auto') |
| `onIndexChange` | `function` | `null` | Callback when active section changes (receives object: `{ currentIndex, previousIndex, currentElement, previousElement }`) |

## Per-Element Custom Offsets

Each tracked element can override the global `offset` configuration using the `data-animate-offset` attribute:

```html
<!-- Global offset is 10%, but these have custom offsets -->
<div data-animate-fade-up>Uses global offset (10%)</div>
<div data-animate-fade-up data-animate-offset="20%">Triggers at 20% from bottom</div>
<div data-animate-fade-up data-animate-offset="50">Triggers at 50px from bottom</div>
<div data-animate-fade-up data-animate-offset="15%">Triggers at 15% from bottom</div>
```

```javascript
const scrollAnimation = new ScrollTrigger({
  sections: '[data-animate-fade-up]',
  offset: '10%', // Default offset for all elements
  onIndexChange: ({ currentElement }) => {
    if (currentElement && !currentElement.hasAttribute('data-animate-loaded')) {
      currentElement.setAttribute('data-animate-loaded', '');
    }
  }
});
```

**How it works:**
- Each element is checked against its own trigger line based on its custom offset
- Elements without `data-animate-offset` use the global `offset` from config
- Supports both pixel values (`100`) and percentages (`'20%'`)
- Perfect for staggered animations or different timing for different elements

## API Methods

### `getCurrentIndex()`
Returns the current active section index (-1 if none).

```javascript
const currentIndex = trigger.getCurrentIndex();
```

### `getCurrentElement()`
Returns the current active element (null if none).

```javascript
const element = trigger.getCurrentElement();
```

### `getElements()`
Returns array of all tracked elements.

```javascript
const elements = trigger.getElements();
```

### `scrollToIndex(index, options)`
Scroll to a specific section by index.

```javascript
trigger.scrollToIndex(2, {
  behavior: 'smooth',
  offset: 20 // Additional offset in pixels (positive = section appears higher)
});
```

### `scrollToElement(element, options)`
Scroll to a specific element.

```javascript
const element = document.querySelector('.my-section');
trigger.scrollToElement(element);
```

### `refresh()`
Recalculate section positions (call after DOM changes).

```javascript
trigger.refresh();
```

### `updateConfig(newConfig)`
Update configuration dynamically.

```javascript
trigger.updateConfig({
  offset: 150,
  throttle: 200
});
```

### `destroy()`
Destroy the tracker and cleanup.

```javascript
trigger.destroy();
```

## Events

The tracker emits a custom event on the window:

```javascript
window.addEventListener('scroll-trigger:change', (e) => {
  console.log('New index:', e.detail.index);
  console.log('Previous index:', e.detail.previousIndex);
  console.log('Current element:', e.detail.section);
  console.log('Previous element:', e.detail.previousSection);
});
```

## observeCross

`observeCross` is the viewport-crossing machinery behind ScrollTrigger, exported on its own. Give it elements and a trigger line and it calls you back when they cross it - no index tracking, no scroll-spy, no opinions about what you do next. It is the building block for scroll reveals, lazy loading, sticky headers, analytics impressions, and anything else that needs "this element reached that line."

```javascript
import { observeCross } from '@magic-spells/scroll-trigger';

const reveal = observeCross('.card', {
  offset: '10%',
  placement: 'center-bottom',
  once: true,
  onCross: (el) => el.classList.add('is-visible'),
});

// later
reveal.refresh(); // recompute trigger lines after a layout change
reveal.destroy(); // disconnect everything
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `offset` | `number\|string` | `0` | Distance above the viewport edge to place the trigger line (px, or a percentage of the viewport height like `'20%'`) |
| `placement` | `string` | `'top-bottom'` | Anchor placement - which edge of the element has to reach which edge of the viewport |
| `once` | `boolean` | `false` | Stop observing an element after it crosses |
| `syncOnScroll` | `boolean` | `false` | Also re-check on a passive scroll listener |
| `threshold` | `number` | `0` | IntersectionObserver threshold. Changes only how sensitively the observer wakes up - never where the trigger line sits |
| `onCross` | `function` | - | `(element, entry) => {}` when an element crosses the line |
| `onExit` | `function` | - | `(element, entry) => {}` when an element moves back below the line (never fires under `once: true`) |

`elements` accepts a CSS selector, a single element, a NodeList, an HTMLCollection, or an array.

`entry` is the IntersectionObserverEntry that woke the callback, or `null` when the check came from a scroll re-check or a `refresh()`.

### Returns

| Method | Description |
|--------|-------------|
| `refresh()` | Re-measure element heights, rebuild the trigger lines, and re-check the current state |
| `destroy()` | Disconnect every observer and listener |

### Anchor placements

Placements are named `<element-edge>-<viewport-edge>` and match [AOS](https://github.com/michalsnik/aos) exactly: the first half is the part of the element being measured, the second half is the line in the viewport it has to reach.

| Placement | Fires when |
|-----------|------------|
| `top-bottom` *(default)* | The element's top reaches the bottom of the viewport |
| `center-bottom` | The element's middle reaches the bottom of the viewport |
| `bottom-bottom` | The element's bottom reaches the bottom of the viewport |
| `top-center` | The element's top reaches the middle of the viewport |
| `center-center` | The element's middle reaches the middle of the viewport |
| `bottom-center` | The element's bottom reaches the middle of the viewport |
| `top-top` | The element's top reaches the top of the viewport |
| `center-top` | The element's middle reaches the top of the viewport |
| `bottom-top` | The element's bottom reaches the top of the viewport |

`offset` moves the line further up from whichever viewport edge the placement names.

### Notes

- **Trigger lines are IntersectionObserver root margins**, not scroll math - nothing runs on the main thread until an element actually reaches its line.
- **Positions are re-measured at callback time.** Entry rects are snapshots from when the intersection was computed, which can be frames stale.
- **`syncOnScroll` is a fallback, not the engine.** IntersectionObserver can lag several frames during momentum scrolling on mobile Safari; turn this on for reveals that have to feel instant, and leave it off otherwise (it costs a rect read per element per frame). ScrollTrigger turns it on internally.
- **Element-edge placements measure lazily.** `center-*` and `bottom-*` need the element's height, so a first-stage observer waits for the element's first intersecting pixel before measuring - heights read before stylesheets and layout settle are wrong.
- **Viewport-dependent lines rebuild themselves** on resize, orientation change, and layout shifts (debounced). A pixel offset with the default placement is a constant and never rebuilds.
- **Safe under Node.** Called without a `window` (static prerendering) it returns an inert handle instead of throwing.

Via the UMD build the helper hangs off the global class: `ScrollTrigger.observeCross(...)`.

## Examples

### Navigation Sync Example

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    .nav-item.active {
      background: blue;
      color: white;
    }
  </style>
</head>
<body>
  <!-- Navigation -->
  <nav id="nav">
    <div class="nav-item" data-index="0">Section 1</div>
    <div class="nav-item" data-index="1">Section 2</div>
    <div class="nav-item" data-index="2">Section 3</div>
  </nav>

  <!-- Sections -->
  <section class="section">Content 1</section>
  <section class="section">Content 2</section>
  <section class="section">Content 3</section>

  <script type="module">
    import ScrollTrigger from './scroll-trigger.esm.js';

    const navItems = document.querySelectorAll('.nav-item');

    const trigger = new ScrollTrigger({
      sections: '.section',
      offset: 100,
      onIndexChange: ({ currentIndex }) => {
        // Update nav
        navItems.forEach((item, i) => {
          item.classList.toggle('active', i === currentIndex);
        });

        // Scroll nav item into view
        if (currentIndex >= 0) {
          navItems[currentIndex].scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'center'
          });
        }
      }
    });

    // Handle nav clicks
    navItems.forEach((item, index) => {
      item.addEventListener('click', () => {
        trigger.scrollToIndex(index);
      });
    });
  </script>
</body>
</html>
```

### Scroll Animations Example

You can use multiple ScrollTrigger instances to create different effects. Here's how to add scroll-triggered fade-up animations:

```html
<!DOCTYPE html>
<html>
<head>
  <style>
    /* Animation states */
    [data-animate-fade-up] {
      opacity: 0;
      transform: translateY(60px);
      filter: blur(3px);
      transition:
        opacity 0.5s ease-out,
        transform 0.5s ease-out,
        filter 0.5s ease-out;
    }

    [data-animate-fade-up][data-animate-loaded] {
      opacity: 1;
      transform: translateY(0);
      filter: blur(0);
    }

    .product-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 1rem;
    }
  </style>
</head>
<body>
  <!-- Content with animation triggers -->
  <section>
    <h2>Featured Products</h2>
    <div class="product-grid" data-animate-fade-up data-animate-offset="15%">
      <div class="product">Product 1</div>
      <div class="product">Product 2</div>
      <div class="product">Product 3</div>
    </div>
  </section>

  <section>
    <h2>More Products</h2>
    <div class="product-grid" data-animate-fade-up data-animate-offset="20%">
      <div class="product">Product 4</div>
      <div class="product">Product 5</div>
      <div class="product">Product 6</div>
    </div>
  </section>

  <script type="module">
    import ScrollTrigger from './scroll-trigger.esm.js';

    // Scroll animations - triggers once per element
    const scrollAnimation = new ScrollTrigger({
      sections: '[data-animate-fade-up]',
      offset: '10%', // Trigger when 10% from bottom of viewport
      threshold: 0.1,
      onIndexChange: ({ currentElement }) => {
        // Only animate once - check if already loaded
        if (currentElement && !currentElement.hasAttribute('data-animate-loaded')) {
          currentElement.setAttribute('data-animate-loaded', '');
        }
      }
    });
  </script>
</body>
</html>
```

**Key Points:**
- Elements start hidden with `opacity: 0`, `translateY(60px)`, and `blur(3px)`
- When they enter the trigger zone, `data-animate-loaded` is added
- CSS transitions animate them to visible state
- The `hasAttribute` check ensures animations only trigger once
- Each element can have a custom `data-animate-offset` to trigger at different positions
- You can combine multiple ScrollTrigger instances for different purposes

## Accessibility

**Note:** ScrollTrigger does not automatically manage ARIA attributes. You must implement accessibility features yourself in your `onIndexChange` callback.

### Recommended Implementation

For accessible navigation that works with screen readers and keyboard navigation:

```html
<!-- Use semantic nav with aria-label -->
<nav aria-label="Product categories">
  <a href="#cereal" class="nav-item">Cereal</a>
  <a href="#granola" class="nav-item">Granola</a>
  <a href="#snacks" class="nav-item">Snacks</a>
</nav>

<!-- Add IDs and aria-labelledby to sections -->
<section id="cereal" aria-labelledby="cereal-heading">
  <h2 id="cereal-heading" data-section-trigger>Cereal</h2>
  <!-- content -->
</section>

<section id="granola" aria-labelledby="granola-heading">
  <h2 id="granola-heading" data-section-trigger>Granola</h2>
  <!-- content -->
</section>
```

```javascript
const navItems = document.querySelectorAll('.nav-item');

const trigger = new ScrollTrigger({
  sections: '[data-section-trigger]',
  offset: '50%',
  onIndexChange: ({ currentIndex }) => {
    navItems.forEach((item, i) => {
      if (i === currentIndex) {
        item.classList.add('active');
        // Use aria-current to indicate current location
        item.setAttribute('aria-current', 'location');
      } else {
        item.classList.remove('active');
        item.removeAttribute('aria-current');
      }
    });
  }
});

// Prevent default, use smooth scroll, and update URL
navItems.forEach((item, index) => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    trigger.scrollToIndex(index);

    // Update URL for bookmarking/sharing
    history.pushState(null, '', item.getAttribute('href'));
  });
});
```

### Best Practices

1. **Use `aria-current="location"`** instead of `aria-selected` for navigation
2. **Use `<a>` tags with `href`** for keyboard navigation and right-click support
3. **Add `aria-label`** to the `<nav>` element to describe its purpose
4. **Use `aria-labelledby`** to connect sections with their headings
5. **Add IDs to sections** to enable direct linking and browser history
6. **Update the URL** on navigation for bookmarking and sharing

See the `/demo/index.html` file for a complete accessible implementation.

## Browser Support

- Modern browsers with IntersectionObserver support
- Chrome 51+
- Firefox 55+
- Safari 12.1+
- Edge 15+

## License

MIT © Cory Schulz
