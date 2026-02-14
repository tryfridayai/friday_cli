---
id: accessibility-standards
name: Accessibility Standards
type: internal
description: Web accessibility guidelines and implementation patterns for inclusive design
tags: accessibility, a11y, wcag, inclusive
---

# Accessibility Standards (WCAG 2.1)

## Core Principles (POUR)

### Perceivable
Information must be presentable in ways users can perceive.
- Text alternatives for non-text content
- Captions for audio/video
- Content adaptable to different presentations
- Distinguishable (color, contrast)

### Operable
Interface must be operable by all users.
- Keyboard accessible
- Enough time to interact
- No seizure-triggering content
- Navigable

### Understandable
Information and operation must be understandable.
- Readable text
- Predictable behavior
- Input assistance

### Robust
Content must be robust enough for various technologies.
- Compatible with assistive technologies
- Valid, well-structured markup

## Color & Contrast

### Contrast Requirements
- **Normal text**: 4.5:1 minimum (AA), 7:1 enhanced (AAA)
- **Large text (18px+ or 14px bold)**: 3:1 minimum (AA)
- **UI components**: 3:1 against adjacent colors
- **Focus indicators**: 3:1 contrast

### Color Guidelines
- Never use color alone to convey meaning
- Provide text labels, icons, or patterns alongside color
- Test with color blindness simulators
- Ensure links are distinguishable without color

## Keyboard Accessibility

### All Interactive Elements Must Be
- Focusable via Tab key
- Activated via Enter or Space
- Have visible focus indicator
- In logical tab order

### Common Keyboard Patterns
- **Buttons**: Enter or Space to activate
- **Links**: Enter to follow
- **Checkboxes**: Space to toggle
- **Radio buttons**: Arrow keys to move between options
- **Modals**: Tab trapped inside, Escape to close
- **Menus**: Arrow keys to navigate, Enter to select, Escape to close

### Focus Management
- Focus moves logically through page
- Focus trapped in modals/dialogs
- Focus returns to trigger element when dialog closes
- Focus visible at all times (never `outline: none` without replacement)

### Skip Links
Provide "Skip to main content" link for long navigation:
```html
<a href="#main" class="skip-link">Skip to main content</a>
```

## Semantic HTML

### Use Proper Elements
- `<button>` for actions (not `<div onclick>`)
- `<a>` for navigation
- `<nav>` for navigation regions
- `<main>` for main content
- `<header>`, `<footer>`, `<aside>` for landmarks
- `<h1>`-`<h6>` for headings in order

### Heading Structure
- One `<h1>` per page (page title)
- Don't skip levels (h1 → h3)
- Use headings to create document outline
- Headings should describe content

### Lists
- Use `<ul>` for unordered lists
- Use `<ol>` for ordered lists
- Use `<dl>` for definition lists
- Screen readers announce list length

## ARIA (Accessible Rich Internet Applications)

### Golden Rules of ARIA
1. Don't use ARIA if native HTML works
2. Don't change native semantics
3. All interactive ARIA elements must be keyboard accessible
4. Don't use `role="presentation"` or `aria-hidden="true"` on focusable elements
5. All interactive elements must have accessible names

### Common ARIA Attributes

**Labels**
- `aria-label`: Label not visible on screen
- `aria-labelledby`: Reference another element's text
- `aria-describedby`: Additional description

**States**
- `aria-expanded`: Expandable elements (true/false)
- `aria-selected`: Selected items
- `aria-checked`: Checkboxes/toggles
- `aria-disabled`: Disabled state
- `aria-hidden`: Hide from assistive tech (use carefully)

**Live Regions**
- `aria-live="polite"`: Announce when convenient
- `aria-live="assertive"`: Announce immediately
- `role="alert"`: Important time-sensitive info
- `role="status"`: Status updates

### Widget Roles
- `role="button"`: Custom buttons
- `role="dialog"`: Modal dialogs
- `role="tablist"`, `role="tab"`, `role="tabpanel"`: Tab interfaces
- `role="menu"`, `role="menuitem"`: Menu interfaces

## Forms

### Labels
- Every input must have a label
- Use `<label for="inputId">` or wrap input in label
- Don't use placeholder as only label

### Error Handling
- Associate errors with inputs (`aria-describedby`)
- Use `aria-invalid="true"` on invalid fields
- Announce errors to screen readers
- Don't rely on color alone

### Required Fields
- Mark required fields with `required` or `aria-required="true"`
- Indicate required visually (asterisk with explanation)
- Announce required status

## Images & Media

### Images
- `alt` text for informative images
- `alt=""` for decorative images (not omit `alt`)
- Complex images: longer description via `aria-describedby`
- Don't include "image of" in alt text (redundant)

### Video & Audio
- Captions for video
- Transcripts for audio
- Audio description for important visual content
- User controls for playback

## Testing for Accessibility

### Automated Testing
- Use tools like axe, Lighthouse, WAVE
- Catches ~30% of issues automatically
- Run in CI/CD pipeline

### Manual Testing
- Keyboard-only navigation test
- Screen reader testing (VoiceOver, NVDA, JAWS)
- Zoom to 200% and verify usability
- Test with high contrast mode

### Testing Checklist
- [ ] All interactive elements keyboard accessible
- [ ] Focus visible and logical order
- [ ] Color contrast meets requirements
- [ ] Images have appropriate alt text
- [ ] Forms have proper labels
- [ ] Headings in logical order
- [ ] ARIA used correctly (or not at all if unnecessary)
- [ ] Dynamic content announced to screen readers
- [ ] No keyboard traps
- [ ] Page works at 200% zoom

## Common Mistakes

1. **Missing alt text**: Every `<img>` needs `alt`
2. **Removing focus outlines**: Without visible replacement
3. **Color alone for meaning**: Red for error without text
4. **Click handlers on divs**: Instead of buttons
5. **Missing form labels**: Placeholder is not a label
6. **Incorrect heading order**: Skipping levels
7. **Auto-playing media**: Without user control
8. **Mouse-only interactions**: Hover menus, drag-only
9. **Time limits**: Without extension options
10. **Inaccessible modals**: Focus not trapped, no escape
