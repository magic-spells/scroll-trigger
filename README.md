# ScrollTrigger

Lightweight scroll-spy plugin for tracking section visibility and syncing navigation state. Perfect for collection pages, documentation, and long-form content. **Only 1.5kb gzipped.**

[**Live Demo**](https://magic-spells.github.io/scroll-trigger/demo/)


## Features

- 🪶 **Tiny bundle** - Only 1.5kb gzipped
- 🎯 **IntersectionObserver-based** - Modern, performant section tracking
- 🔄 **Callback system** - Easy integration with custom navigation
- ⚡ **Throttled updates** - Optimized performance with configurable throttling
- 📍 **Precise control** - Customizable trigger offset from viewport bottom
- 🎨 **Zero dependencies** - Pure vanilla JavaScript
- 🔧 **Flexible API** - Supports CSS selectors, NodeList, or element arrays
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
  onIndexChange: (newIndex, previousIndex, newElement, oldElement) => {
    // Update your navigation
    console.log('Active section:', newIndex);
    console.log('Trigger element:', newElement);
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
| `onIndexChange` | `function` | `null` | Callback when active section changes (receives: newIndex, previousIndex, newElement, oldElement) |

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
  onIndexChange: (newIndex, previousIndex, newElement, oldElement) => {
    if (newElement && !newElement.hasAttribute('data-animate-loaded')) {
      newElement.setAttribute('data-animate-loaded', '');
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

### `getCurrentSection()`
Returns the current active section element (null if none).

```javascript
const section = trigger.getCurrentSection();
```

### `getSections()`
Returns array of all tracked section elements.

```javascript
const sections = trigger.getSections();
```

### `scrollToIndex(index, options)`
Scroll to a specific section by index.

```javascript
trigger.scrollToIndex(2, {
  behavior: 'smooth',
  offset: 20 // Additional offset in pixels (positive = section appears higher)
});
```

### `scrollToSection(element, options)`
Scroll to a specific section element.

```javascript
const section = document.querySelector('.my-section');
trigger.scrollToSection(section);
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
  console.log('Section element:', e.detail.section);
  console.log('Previous section element:', e.detail.previousSection);
});
```

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
      onIndexChange: (newIndex, previousIndex, newElement, oldElement) => {
        // Update nav
        navItems.forEach((item, i) => {
          item.classList.toggle('active', i === newIndex);
        });

        // Scroll nav item into view
        if (newIndex >= 0) {
          navItems[newIndex].scrollIntoView({
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
      onIndexChange: (newIndex, previousIndex, newElement, oldElement) => {
        // Only animate once - check if already loaded
        if (newElement && !newElement.hasAttribute('data-animate-loaded')) {
          newElement.setAttribute('data-animate-loaded', '');
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
  onIndexChange: (newIndex, previousIndex, newElement, oldElement) => {
    navItems.forEach((item, i) => {
      if (i === newIndex) {
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
