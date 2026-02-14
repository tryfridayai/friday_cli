---
id: data-visualization-principles
name: Data Visualization Principles
type: internal
description: Best practices for creating effective data visualizations
tags: analysis, visualization, charts, communication
---

# Data Visualization Principles

## Purpose of Visualization

### Why Visualize?
- **Explore**: Find patterns and outliers
- **Explain**: Communicate findings clearly
- **Engage**: Make data accessible and interesting

### Know Your Goal
Before creating a visualization, ask:
- What question am I answering?
- Who is the audience?
- What action should result?
- What's the one key takeaway?

## Chart Selection Guide

### Comparison

**Bar Chart**:
- Compare categories
- Horizontal for many categories or long labels
- Vertical for fewer categories or time element
- Start y-axis at zero

**Grouped Bar Chart**:
- Compare categories across groups
- Limit to 2-3 groups for clarity

### Distribution

**Histogram**:
- Distribution of single numeric variable
- Shows shape (normal, skewed, bimodal)
- Bin width matters—experiment

**Box Plot**:
- Distribution summary (median, quartiles, outliers)
- Good for comparing distributions across groups
- Shows outliers clearly

**Density Plot**:
- Smoothed distribution
- Good for overlaying multiple distributions

### Relationship

**Scatter Plot**:
- Relationship between two numeric variables
- Add trend line if linear relationship
- Watch for overplotting (use transparency)

**Line Chart**:
- Trends over time
- Connect sequential data points
- Multiple lines for comparison (limit to 5-7)

### Composition

**Pie Chart** (use sparingly):
- Parts of a whole
- Limit to 5-6 segments
- Consider bar chart instead

**Stacked Bar Chart**:
- Composition across categories
- Hard to compare middle segments
- Consider 100% stacked for proportions

**Area Chart**:
- Composition over time
- Use carefully—can be misleading

### Proportion

**Bullet Chart**:
- Single metric vs target/benchmark

**Waffle Chart**:
- Part-to-whole, more accurate than pie

## Visual Encoding Effectiveness

### Ranked by Accuracy

**Position** (most accurate):
- X/Y position on scale
- Humans judge position best

**Length**:
- Bar length
- Second most accurate

**Angle/Slope**:
- Line slopes
- Pie chart angles (less accurate)

**Area**:
- Bubble size
- We underestimate differences

**Color saturation/hue** (least accurate):
- Use for categories
- Not for precise values

### Encoding Guidelines
- Use position and length for important comparisons
- Use color for categories, not continuous values
- Don't rely on area for precise comparisons
- Redundant encoding (position + color) can help

## Color Usage

### Color Functions

**Categorical**:
- Distinguish different groups
- Use distinct, easily distinguishable hues
- Limit to 7-10 colors

**Sequential**:
- Show magnitude (low to high)
- Single hue, varying lightness
- Example: Light blue → Dark blue

**Diverging**:
- Show deviation from center
- Two hues meeting at neutral
- Example: Red ← White → Blue

### Color Guidelines

1. **Don't rely on color alone**: Use labels, patterns
2. **Test for colorblindness**: 8% of males affected
3. **Use color meaningfully**: Red for bad, green for good (but check cultural context)
4. **Avoid rainbow scales**: Hard to interpret, not perceptually uniform
5. **Consider printing**: Will it work in grayscale?

### Accessible Color Palettes
- Use colorblind-safe palettes
- Test with simulation tools
- Ensure sufficient contrast
- Pair colors with labels/patterns

## Design Principles

### Maximize Data-Ink Ratio

Remove non-essential elements:
- Unnecessary gridlines
- Decorative elements
- Redundant labels
- 3D effects (almost never needed)

### Clear Labeling

**Title**: State the insight, not just topic
- Bad: "Sales by Region"
- Good: "North Region Leads Sales Growth"

**Axis Labels**:
- Clear, include units
- Don't truncate unnecessarily

**Legends**:
- Position near data when possible
- Order matches data order
- Consider direct labels instead

### Appropriate Scale

**Y-axis**:
- Start at zero for bar charts (usually)
- Can truncate for line charts if change is the focus
- Make truncation obvious

**Aspect Ratio**:
- Affects perception of trends
- Steeper slope looks more dramatic
- Bank to 45° for line charts

### Annotation

**Highlight Key Points**:
- Circle or call out important data
- Add context (event markers on time series)
- Provide interpretation, not just data

**Guide the Reader**:
- Reading order (title → key insight → detail)
- Don't make them work to understand
- One main message per chart

## Chart Junk to Avoid

### Never Use
- 3D charts (unless truly 3D data)
- Exploding pie slices
- Decorative images in charts
- Dual axes (usually misleading)

### Use Carefully
- Secondary y-axes
- Truncated axes
- Non-zero baselines
- Logarithmic scales (explain clearly)

### Common Mistakes

1. **Truncated bar charts**: Exaggerates differences
2. **Pie charts with many segments**: Hard to compare
3. **Too many lines**: Becomes spaghetti
4. **Rainbow color scales**: Misleading for continuous data
5. **Overcrowded labels**: Rotate or abbreviate
6. **Missing context**: Numbers without comparison

## Storytelling with Data

### Narrative Structure

1. **Setup**: Context, why this matters
2. **Conflict**: The problem or question
3. **Resolution**: What the data shows
4. **Call to action**: What to do next

### Building a Story

**Single Chart**:
- Clear title stating insight
- Annotation highlighting key point
- Supporting text if needed

**Dashboard/Report**:
- Logical flow of charts
- Summary/overview first
- Details follow
- Consistent design language

### Presentations

- One point per slide
- Build complexity gradually
- Annotate as you explain
- Leave time for questions

## Visualization Checklist

Before Finalizing:
- [ ] Clear title that states the insight
- [ ] Appropriate chart type for data and message
- [ ] Axes labeled with units
- [ ] Legend is clear and positioned well
- [ ] Color used purposefully
- [ ] Accessible (colorblind safe, readable)
- [ ] No chart junk
- [ ] Key insights are highlighted
- [ ] Context provided (comparison, benchmark)
- [ ] One clear takeaway

## Quick Reference: Which Chart?

| Question | Chart Type |
|----------|------------|
| How do categories compare? | Bar chart |
| What is the distribution? | Histogram, box plot |
| Is there a relationship? | Scatter plot |
| How has it changed over time? | Line chart |
| What are the parts of a whole? | Pie, stacked bar, treemap |
| How does it vary geographically? | Map |
| What are the outliers? | Box plot, scatter |
| How do multiple variables relate? | Scatter matrix, parallel coordinates |
