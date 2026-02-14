---
id: ux-patterns
name: UX Patterns
type: internal
description: Common user experience patterns and interaction design principles
tags: design, ux, interaction, patterns
---

# User Experience Patterns

## Navigation Patterns

### Global Navigation
- **Top Bar**: Primary navigation, works well up to 7 items
- **Side Navigation**: Good for many items, collapsible for space
- **Bottom Bar**: Mobile apps, 3-5 primary actions maximum

### Contextual Navigation
- **Breadcrumbs**: Show location in hierarchy, allow backtracking
- **Tabs**: Switch between related views, keep context
- **Pagination**: Navigate large datasets, show position

### Navigation Principles
- Users should always know where they are
- Make it easy to get back (visible back button, breadcrumbs)
- Consistent navigation across all pages
- Highlight current/active state clearly

## Form Patterns

### Input Design
- Labels above inputs (most accessible, works for all languages)
- Placeholder text is NOT a substitute for labels
- Group related fields visually
- Mark required fields consistently (asterisk or "required" text)

### Validation Patterns
- Inline validation: Show feedback as user types (after first blur)
- Submit validation: Show all errors at once, scroll to first error
- Clear error messaging: What went wrong, how to fix it
- Remove error when corrected

### Form Flow
- Logical field order (name before address, etc.)
- Smart defaults where appropriate
- Minimize required fields
- Single-column forms easier to complete

## Feedback Patterns

### Loading States
- Show loading immediately (< 100ms response feels instant)
- Skeleton screens over spinners when possible
- Progress indicators for long operations (> 10 seconds)
- Allow cancellation for long operations

### Success States
- Confirm successful actions clearly
- Show what was accomplished
- Provide next step if applicable
- Don't block user unnecessarily

### Error States
- Explain what happened in plain language
- Offer solution or next steps
- Don't blame the user
- Preserve user input when possible

### Empty States
- Explain what would be here
- Guide user to take action
- Don't just show blank space
- Use illustration or helpful message

## Modal & Dialog Patterns

### When to Use Modals
- Requiring immediate decision
- Confirming destructive action
- Short forms or quick tasks
- Focused attention needed

### Modal Best Practices
- Clear title describing purpose
- Close button (X) in corner
- Escape key closes modal
- Click outside closes (for non-critical modals)
- Focus trapped within modal
- Return focus on close
- Primary action on right, secondary on left

### Confirmation Dialogs
- Use for destructive or irreversible actions
- Describe specifically what will happen
- Use action-specific button labels ("Delete Project" not "OK")
- Allow easy cancellation

## List & Table Patterns

### List Design
- Clear visual separation between items
- Consistent item structure
- Scannable key information
- Actions accessible but not distracting

### Table Design
- Clear headers
- Align numbers right, text left
- Zebra striping optional (borders often cleaner)
- Sortable columns when useful
- Pagination or virtualization for long lists

### Selection Patterns
- Single select: Radio buttons or clickable rows
- Multi-select: Checkboxes with "Select All"
- Show count of selected items
- Bulk actions visible when items selected

## Search & Filter Patterns

### Search
- Prominent search box where expected
- Clear button when search has text
- Search suggestions/autocomplete
- Show search term in results
- Handle no results gracefully

### Filtering
- Clearly indicate active filters
- Show count of results
- Easy way to clear filters
- Persist filters in URL (shareable)

## Mobile-First Patterns

### Touch Targets
- Minimum 44x44px touch targets
- Adequate spacing between targets
- Consider thumb reach zones
- Important actions within easy reach

### Mobile Navigation
- Hamburger menu for secondary navigation
- Bottom bar for primary actions
- Avoid hover-dependent interactions
- Design for vertical scrolling

### Content Priority
- Most important content first
- Collapse secondary content
- Progressive disclosure
- Minimize input on mobile

## Accessibility Patterns

### Keyboard Navigation
- All interactive elements focusable
- Logical tab order
- Visible focus indicators
- Keyboard shortcuts for power users

### Screen Reader Support
- Semantic HTML structure
- ARIA labels for icons and images
- Announce dynamic content changes
- Skip links for long pages

### Motor Accessibility
- Large enough click/touch targets
- Adequate time for timed actions
- Avoid precision requirements
- Support multiple input methods

## Common Anti-Patterns to Avoid

### Dark Patterns
- Trick questions
- Hidden costs
- Forced continuity
- Privacy zuckering
- Confirmshaming

### Usability Issues
- Mystery meat navigation (unclear links)
- Modal overload
- Infinite scroll without position indicator
- Auto-playing media
- Unexpected behavior
