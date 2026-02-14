---
id: design-principles
name: Design Principles
type: internal
description: Fundamental visual design principles for creating effective user interfaces
tags: design, ui, visual, principles
---

# Visual Design Principles

## Visual Hierarchy

Visual hierarchy guides users through content by establishing clear importance levels.

### Techniques for Establishing Hierarchy
1. **Size**: Larger elements draw attention first
2. **Weight**: Bold text stands out from regular text
3. **Color**: High contrast colors attract attention; muted colors recede
4. **Position**: Top-left (in LTR languages) gets noticed first
5. **Whitespace**: Isolated elements with surrounding space appear more important

### Hierarchy Levels
- **Primary**: Main actions, key information (largest, boldest, highest contrast)
- **Secondary**: Supporting information, secondary actions
- **Tertiary**: Metadata, timestamps, hints (smallest, lowest contrast)

## Typography

### Font Pairing Principles
- Use maximum 2-3 typefaces per project
- Pair contrasting fonts (serif with sans-serif)
- Maintain consistent line-height (1.4-1.6 for body text)
- Use a modular scale for font sizes (1.25, 1.333, or 1.5 ratio)

### Readability Guidelines
- Body text: 16-18px minimum
- Line length: 45-75 characters optimal
- Paragraph spacing: 1.5x line height
- Sufficient contrast: 4.5:1 minimum (WCAG AA)

## Color Theory

### Color Functions
- **Primary**: Brand color, main actions
- **Secondary**: Supporting elements, less prominent actions
- **Accent**: Highlights, notifications, focus states
- **Semantic**: Success (green), Error (red), Warning (yellow), Info (blue)
- **Neutral**: Backgrounds, text, borders

### Color Guidelines
- Limit palette to 5-7 colors plus neutrals
- Ensure sufficient contrast for accessibility
- Don't rely on color alone to convey meaning
- Test for color blindness (8% of males affected)

## Spacing & Layout

### Spacing Scale
Use a consistent spacing scale based on a base unit:
- Base unit: 4px or 8px
- Scale: 4, 8, 12, 16, 24, 32, 48, 64, 96

### Spacing Principles
- **Proximity**: Related items closer together
- **Consistency**: Same spacing for same relationships
- **Breathing Room**: Don't crowd elements
- **Alignment**: Align elements to a grid

## Gestalt Principles

### Proximity
Items close together are perceived as related.
- Group related controls together
- Separate unrelated sections with more space

### Similarity
Items that look similar are perceived as related.
- Use consistent styling for similar elements
- Differentiate distinct element types visually

### Continuity
The eye follows lines and curves naturally.
- Align elements to create visual flow
- Use consistent alignment throughout

### Closure
The mind completes incomplete shapes.
- Icons don't need to be fully detailed
- Implied boundaries can define areas

### Figure/Ground
Elements are perceived as either foreground or background.
- Ensure clear distinction between content and background
- Use shadows, borders, or contrast to separate layers

## Design Consistency

### Component Consistency
- Same components look and behave the same everywhere
- Button styles, form fields, cards follow patterns
- Deviations should be intentional and meaningful

### Interaction Consistency
- Similar actions have similar interactions
- Delete always works the same way
- Links look and behave consistently

### Language Consistency
- Same terminology throughout
- Consistent voice and tone
- Error messages follow patterns

## White Space

### Functions of White Space
- **Separation**: Creates boundaries between elements
- **Focus**: Draws attention to isolated elements
- **Breathing Room**: Prevents cognitive overload
- **Elegance**: Creates sophisticated appearance

### Types of White Space
- **Micro**: Between letters, lines, small elements
- **Macro**: Between sections, around major elements

## Design Checklist

Before finalizing any design:
- [ ] Clear visual hierarchy established
- [ ] Typography readable and appropriately sized
- [ ] Color contrast meets accessibility standards
- [ ] Consistent spacing throughout
- [ ] Related items grouped together
- [ ] Sufficient white space
- [ ] All interactive states defined
- [ ] Design scales for different content lengths
