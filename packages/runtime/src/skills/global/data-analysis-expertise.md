---
id: data-analysis-expertise
name: Data Analysis Expertise
type: internal
description: Comprehensive data analysis knowledge including exploratory analysis, statistical methods, visualization, and deriving actionable insights
version: 1.0.0
tags:
  - data
  - analysis
  - statistics
  - visualization
  - insights
---

# Data Analysis Expertise

Apply this knowledge when helping users explore data, perform statistical analysis, create visualizations, or derive insights.

## Core Competencies

### Data Exploration
- **Descriptive Statistics**: Mean, median, mode, standard deviation, percentiles
- **Distribution Analysis**: Histograms, density plots, identifying skewness and outliers
- **Data Profiling**: Data types, missing values, cardinality, uniqueness
- **Correlation Analysis**: Relationships between variables, multicollinearity

### Data Cleaning & Preparation
- **Missing Data**: Detection, patterns, imputation strategies (mean, median, forward-fill, model-based)
- **Outlier Handling**: Detection (IQR, z-score), treatment options (remove, cap, transform)
- **Data Transformation**: Normalization, standardization, log transforms, encoding
- **Data Validation**: Consistency checks, business rule validation, referential integrity

### Statistical Analysis
- **Hypothesis Testing**: t-tests, chi-square, ANOVA, p-values, confidence intervals
- **Regression Analysis**: Linear, logistic, interpretation of coefficients
- **Time Series**: Trends, seasonality, moving averages, forecasting basics
- **A/B Testing**: Sample size calculation, significance testing, effect size

### Data Visualization
- **Chart Selection**: When to use bar, line, scatter, histogram, box plot, etc.
- **Visual Encoding**: Position, length, color, size—ordered by effectiveness
- **Storytelling**: Annotations, highlights, narrative flow
- **Best Practices**: Clear labels, appropriate scales, accessible colors

### Insight Generation
- **Pattern Recognition**: Trends, clusters, anomalies, correlations
- **Segmentation**: Meaningful groupings, behavioral cohorts
- **Root Cause Analysis**: Drilling down, isolating factors
- **Actionable Recommendations**: From insight to action

## Analysis Principles

### Scientific Rigor
1. **Start with Questions**: Define what you're trying to learn before diving in
2. **Understand the Data**: Know how it was collected, what biases may exist
3. **Check Assumptions**: Validate statistical assumptions before applying methods
4. **Consider Alternatives**: Multiple explanations for patterns, avoid confirmation bias
5. **Document Limitations**: Be honest about what the data can and cannot tell us

### Statistical Honesty
1. **Significance vs. Importance**: Statistical significance ≠ practical significance
2. **Correlation ≠ Causation**: Be careful with causal claims
3. **Sample Size Matters**: Underpowered analyses can mislead
4. **Multiple Comparisons**: Adjust when testing many hypotheses
5. **Uncertainty Communication**: Report confidence intervals, not just point estimates

### Clear Communication
1. **Lead with Insights**: Key findings first, methodology second
2. **Know Your Audience**: Technical vs. non-technical presentation
3. **Visualize Appropriately**: The right chart for the right message
4. **Provide Context**: Comparisons, benchmarks, historical trends
5. **Actionable Conclusions**: So what? What should be done?

## Analysis Workflow

### 1. Define the Question
- What business/research question are we answering?
- What would success look like?
- What decisions will this analysis inform?
- What data do we need?

### 2. Gather & Understand Data
- Load and inspect the data
- Check data types, missing values, anomalies
- Understand what each column represents
- Identify data quality issues

### 3. Clean & Prepare
- Handle missing values appropriately
- Address outliers with justification
- Create derived features if needed
- Validate data integrity

### 4. Explore & Analyze
- Start with univariate analysis (one variable at a time)
- Move to bivariate (relationships between two variables)
- Then multivariate (complex interactions)
- Apply appropriate statistical tests

### 5. Visualize & Communicate
- Choose visualizations that answer the question
- Annotate key insights
- Create a narrative flow
- Summarize findings clearly

### 6. Recommend & Act
- Translate findings to recommendations
- Prioritize by impact and feasibility
- Suggest follow-up analyses
- Note limitations and caveats

## Output Format: Analysis Report

```
ANALYSIS: [Title]

QUESTION: What we're trying to answer

KEY FINDINGS:
1. Finding with supporting evidence
2. Finding with supporting evidence
3. Finding with supporting evidence

DATA OVERVIEW:
- Source and time period
- Sample size
- Key variables
- Data quality notes

METHODOLOGY:
- Approach taken
- Statistical methods used
- Assumptions and limitations

DETAILED FINDINGS:
[Each finding with supporting data, visualizations, and interpretation]

RECOMMENDATIONS:
1. Action item based on finding
2. Action item based on finding

NEXT STEPS:
- Follow-up analyses suggested
- Data collection needs
```

## Visualization Guidelines

| Purpose | Chart Type |
|---------|------------|
| Comparison | Bar chart, grouped bar chart |
| Distribution | Histogram, box plot, density plot |
| Relationship | Scatter plot, line chart |
| Composition | Pie chart (sparingly), stacked bar |
| Trend over Time | Line chart, area chart |
| Categories | Bar chart (horizontal for many categories) |

## Common Analysis Types

### Exploratory Data Analysis (EDA)
- Summary statistics for all variables
- Distribution of key variables
- Missing data patterns
- Correlation matrix
- Outlier detection

### Cohort Analysis
- Define cohorts (time-based, behavior-based)
- Track metrics over time by cohort
- Compare cohort performance
- Identify trends and patterns

### Funnel Analysis
- Define funnel stages
- Calculate conversion rates
- Identify drop-off points
- Segment by user attributes

### Segmentation
- Choose segmentation variables
- Apply clustering or rules-based segments
- Profile each segment
- Size and value segments

### Time Series Analysis
- Plot trends over time
- Identify seasonality
- Calculate growth rates
- Compare periods

## Data Quality Checks

Always verify:
1. **Completeness**: Missing values, incomplete records
2. **Accuracy**: Values within expected ranges
3. **Consistency**: Same entities match across sources
4. **Timeliness**: Data is current enough for the question
5. **Uniqueness**: No unexpected duplicates

## What NOT to Do

- Don't start analysis without understanding the question
- Don't ignore missing data or outliers without investigation
- Don't apply statistical tests without checking assumptions
- Don't cherry-pick data to support a predetermined conclusion
- Don't present findings without context or limitations
- Don't confuse correlation with causation

## Communication Approach

- Ask clarifying questions about the data and goals
- Explain your analytical approach
- Present findings with appropriate uncertainty
- Use visualizations to support key points
- Make recommendations actionable and prioritized
- Be honest about limitations
