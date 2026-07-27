# Multi-Page Product Suite: Shared Architecture Pattern

## Problem

When building a product with multiple pages (dashboard, settings, profile, etc.), the default approach of embedding all CSS/JS in each HTML file leads to:

- **85%+ code duplication** across pages
- **Inconsistent styling** when changes are made to one page but not others
- **Maintenance nightmare** — updating a button style requires editing 8+ files
- **Large file sizes** — each page loads hundreds of lines of redundant CSS

## Solution: Shared Component Architecture

### File Structure

```
project/
├── css/
│   ├── design-tokens.css      # Colors, spacing, typography, shadows, animations
│   ├── layout.css             # Sidebar, nav, main content, responsive breakpoints
│   └── components.css         # Buttons, cards, inputs, toasts, modals, etc.
├── js/
│   ├── app.js                 # App core: routing, theme, global search, keyboard shortcuts
│   └── api.js                 # Mock API layer for consistent data
├── pages/
│   ├── dashboard.html         # Primary page
│   ├── settings.html          # Secondary pages
│   └── profile.html
└── index.html                 # Login/landing page
```

### design-tokens.css

```css
:root {
  /* Colors */
  --color-bg-primary: #0B0F19;
  --color-bg-secondary: #111827;
  --color-text-primary: #F1F5F9;
  --color-text-secondary: #94A3B8;
  --color-accent-cyan: #22D3EE;
  --color-accent-emerald: #34D399;
  --color-accent-rose: #FB7185;
  
  /* Spacing (4px base) */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  
  /* Radii */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  
  /* Shadows */
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.4);
  
  /* Animation */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
}

/* Light mode */
[data-theme="light"] {
  --color-bg-primary: #FFFFFF;
  --color-bg-secondary: #F8FAFC;
  --color-text-primary: #0F172A;
  --color-text-secondary: #475569;
}

@media (prefers-color-scheme: light) {
  :root:not([data-theme="dark"]) {
    --color-bg-primary: #FFFFFF;
    --color-bg-secondary: #F8FAFC;
    --color-text-primary: #0F172A;
    --color-text-secondary: #475569;
  }
}
```

### layout.css

```css
/* Base reset */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

body {
  font-family: 'Inter', -apple-system, sans-serif;
  background: var(--color-bg-primary);
  color: var(--color-text-primary);
  height: 100vh;
  overflow: hidden;
}

/* Sidebar */
.sidebar {
  position: fixed;
  left: 0; top: 0;
  width: 72px; height: 100vh;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
  z-index: 300;
}

/* Nav panel */
.nav-panel {
  position: fixed;
  left: 72px; top: 0;
  width: 280px; height: 100vh;
  background: var(--color-bg-secondary);
  border-right: 1px solid var(--color-border);
  z-index: 290;
}

/* Main content */
.main-content {
  margin-left: calc(72px + 280px);
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Responsive */
@media (max-width: 1023px) {
  .nav-panel { transform: translateX(-100%); }
  .main-content { margin-left: 72px; }
}

@media (max-width: 767px) {
  .sidebar { width: 100%; height: 60px; flex-direction: row; bottom: 0; top: auto; }
  .main-content { margin-left: 0; margin-bottom: 60px; }
}
```

### components.css

Key components to include:
- `.btn` with variants (primary, secondary, ghost, danger, success) and sizes (sm, lg, icon)
- `.card` with optional `.card-interactive` for hover effects
- `.input` and `.input-group`
- `.tag` with color variants (cyan, emerald, amber, rose, violet)
- `.badge` with status variants
- `.status` with pulse animation for live indicators
- `.toast` notification system
- `.modal` with backdrop
- `.dropdown` menu
- `.tooltip`
- `.switch` toggle
- `.progress` bar
- `.code-block` with header
- `.table` with hover states
- `.skeleton` loading placeholder
- `.empty-state`

### app.js

```javascript
class App {
  constructor() {
    this.theme = localStorage.getItem('theme') || 'dark';
    this.init();
  }
  
  init() {
    this.applyTheme();
    this.initNavigation();
    this.initGlobalSearch();
    this.initKeyboardShortcuts();
  }
  
  applyTheme() {
    document.documentElement.setAttribute('data-theme', this.theme);
  }
  
  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', this.theme);
    this.applyTheme();
  }
  
  initGlobalSearch() {
    // ⌘K / Ctrl+K to open search modal
    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        this.openSearch();
      }
    });
  }
  
  initKeyboardShortcuts() {
    // ESC to close modals
    // ⌘/ to show shortcut help
  }
}
```

### Page HTML Pattern

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>Page Title - Product Name</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="../css/design-tokens.css">
  <link rel="stylesheet" href="../css/layout.css">
  <link rel="stylesheet" href="../css/components.css">
  <style>
    /* Page-specific styles only */
  </style>
</head>
<body>
  <aside class="sidebar">...</aside>
  <aside class="nav-panel">...</aside>
  <main class="main-content">...</main>
  
  <script src="../js/app.js"></script>
  <script src="../js/api.js"></script>
  <script>
    // Page-specific JavaScript
  </script>
</body>
</html>
```

## Verification Checklist

- [ ] Shared CSS files load without 404 errors
- [ ] Navigation links work between pages
- [ ] Global search (⌘K) works on all page types
- [ ] Theme toggle persists across page navigations
- [ ] Active nav item highlights correctly on each page
- [ ] Responsive layout works at desktop, tablet, and mobile breakpoints
- [ ] Toast notifications appear correctly
- [ ] Mock API data is consistent across related pages

## Common Pitfalls

1. **Path issues** — Pages in `pages/` folder must use `../css/` to reference shared CSS, while `index.html` in root uses `./css/`.
2. **Font loading** — Google Fonts link should be in every page's `<head>`, not in shared CSS.
3. **JavaScript initialization order** — `app.js` must load before page-specific scripts that depend on `app` or `Toast`.
4. **localStorage scope** — Theme preference and recent items should use consistent keys across all pages.
5. **Z-index conflicts** — Define a z-index scale in design-tokens.css and stick to it.
