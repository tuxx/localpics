# Internationalization (i18n) Guide

## Overview

This application supports multiple languages through a JSON-based translation system. The i18n module automatically detects the user's browser language and applies translations.

## Supported Languages

- **English** (`en-US`) - Default
- **简体中文** (`zh-CN`) - Simplified Chinese

## How It Works

### Automatic Language Detection

The system automatically detects the user's preferred language in this order:

1. Previously saved preference in localStorage
2. Browser's language setting
3. Default to English

### Manual Language Selection

Users can change the language using the language selector dropdown in the navigation bar.

## File Structure

```
static/
├── js/
│   └── i18n.js          # Core i18n module
└── locales/
    ├── en-US.json       # English translations
    ├── zh-CN.json       # Chinese translations
    └── README.md        # This file
```

## Adding New Translations

### 1. Add Translation Keys

Add your translation keys to all language files:

**en-US.json:**

```json
{
  "my.new.key": "English text"
}
```

**zh-CN.json:**

```json
{
  "my.new.key": "中文文本"
}
```

### 2. Use in HTML

Use `data-i18n` attributes for text content:

```html
<h1 data-i18n="my.new.key">Fallback text</h1>
```

Or use `data-i18n-title` for tooltips:

```html
<button data-i18n-title="tooltip.text" title="Fallback">Button</button>
```

### 3. Use in JavaScript

Call the `t()` function with your translation key:

```javascript
const message = t("my.new.key");

// With parameters
const errorMessage = t("error.message", { error: errorDetails });
```

## Translation Key Format

Use dot notation for namespacing:

- `nav.home` - Navigation items
- `modal.title` - Modal dialogs
- `error.loading` - Error messages
- `actions.download` - Action buttons

## Parameter Substitution

You can use placeholders in translations:

**JSON:**

```json
{
  "error.message": "Failed to load: {{error}}"
}
```

**JavaScript:**

```javascript
t("error.message", { error: "File not found" });
```

## Best Practices

1. **Always provide fallback text** in HTML elements
2. **Keep translation keys consistent** across all language files
3. **Use descriptive key names** that indicate the context
4. **Test all languages** after adding new translations
5. **Avoid concatenating translated strings** - word order varies by language

## API Reference

### `initI18n(lang?)`

Initialize the i18n system with optional language code.

### `t(key, params?)`

Translate a key with optional parameters.

### `setLanguage(lang)`

Change the current language.

### `getCurrentLanguage()`

Get the current language code.

### `getSupportedLanguages()`

Get all supported languages map.

### `createLanguageSelector(containerId)`

Create a language selector dropdown in the specified container.
