---
id: data-analysis-methodology
name: Data Analysis Methodology
type: internal
description: Structured approaches to data exploration and analysis
tags: analysis, data, methodology, eda
---

# Data Analysis Methodology

## Exploratory Data Analysis (EDA)

### Purpose
- Understand data structure and content
- Identify data quality issues
- Discover patterns and relationships
- Generate hypotheses for further analysis
- Guide modeling decisions

### EDA Process

#### 1. Initial Inspection
- Dataset dimensions (rows × columns)
- Column names and types
- First/last few rows
- Memory usage

#### 2. Data Types & Structure
- Numeric vs categorical
- Date/time columns
- Text fields
- Nested/complex structures

#### 3. Missing Data Analysis
- Count and percentage missing per column
- Missing data patterns (random vs systematic)
- Visualize missingness
- Document implications

#### 4. Univariate Analysis
For each variable:
- **Numeric**: Min, max, mean, median, std, percentiles, distribution shape
- **Categorical**: Unique values, value counts, mode, cardinality
- **Text**: Length distribution, common words
- **Dates**: Range, gaps, patterns

#### 5. Bivariate Analysis
- Correlations between numeric variables
- Cross-tabulations for categorical
- Numeric by categorical (group statistics)
- Scatter plots, box plots

#### 6. Multivariate Patterns
- Correlation matrices
- Feature interactions
- Clustering tendencies
- Dimensionality reduction (for high-dimensional data)

## Data Quality Assessment

### Completeness
- Missing values count and percentage
- Required fields that are missing
- Impact of missingness on analysis

### Accuracy
- Values within expected ranges
- Logical consistency (start date < end date)
- Comparison with known/expected values
- Outlier detection

### Consistency
- Same entity represented same way
- Consistent formats (dates, currencies)
- Referential integrity

### Timeliness
- Data freshness
- Update frequency
- Lag between event and recording

### Uniqueness
- Duplicate records
- Duplicate identifiers
- Near-duplicates

### Validity
- Conformance to business rules
- Valid categories/enumerations
- Valid relationships

## Handling Missing Data

### Understanding Missingness

**MCAR (Missing Completely at Random)**
- Missingness unrelated to any data
- Safe to ignore or simple imputation

**MAR (Missing at Random)**
- Missingness related to observed data
- Can use related variables to impute

**MNAR (Missing Not at Random)**
- Missingness related to the missing value itself
- Most challenging, may need domain knowledge

### Handling Strategies

**Deletion**:
- Listwise: Remove rows with any missing
- Pairwise: Use available data for each analysis
- Use when: Small amount of MCAR data

**Imputation**:
- Mean/median: Simple, distorts distribution
- Mode: For categorical
- Forward/backward fill: Time series
- Model-based: More sophisticated, preserves relationships

**Indicator Method**:
- Create flag for missingness
- Use when missingness itself is informative

## Outlier Analysis

### Detection Methods

**Statistical**:
- Z-score: Values > 3 standard deviations
- IQR: Values beyond 1.5 × IQR from quartiles
- Modified Z-score: Robust to existing outliers

**Visual**:
- Box plots
- Scatter plots
- Distribution plots

**Domain Knowledge**:
- Impossible values (negative age)
- Improbable values (1000-year-old person)

### Handling Strategies

**Investigate First**:
- Is it data error?
- Is it valid but extreme?
- What caused it?

**Options**:
- Remove: If error or not representative
- Cap/Winsorize: Replace with percentile values
- Transform: Log, square root for right-skewed
- Keep: If valid and important

## Segmentation Analysis

### Purpose
- Group similar entities
- Understand different populations
- Tailor strategies to segments

### Approaches

**Rule-Based**:
- Define segments with business rules
- Example: High/Medium/Low value customers
- Transparent and explainable

**Statistical**:
- K-means clustering
- Hierarchical clustering
- Based on multiple variables

### Profiling Segments
For each segment:
- Size and percentage
- Key characteristics
- How they differ from others
- Business implications

## Time Series Analysis

### Components
- **Trend**: Long-term direction
- **Seasonality**: Regular patterns (daily, weekly, yearly)
- **Cyclical**: Longer-term fluctuations
- **Noise**: Random variation

### Common Analyses
- Period-over-period comparison
- Rolling averages
- Year-over-year growth
- Seasonality decomposition

### Visualization
- Line charts over time
- Seasonal plots
- Lag plots
- Autocorrelation plots

## Comparative Analysis

### Before/After
- Define clear time periods
- Account for other changes
- Use appropriate metrics
- Statistical significance if needed

### A/B Testing
- Define hypothesis
- Calculate sample size
- Ensure random assignment
- Choose correct statistical test
- Consider practical significance

### Cohort Comparison
- Define cohorts clearly
- Track same metrics
- Account for cohort size differences
- Consider survivorship bias

## Analysis Documentation

### What to Document

**Data Source**:
- Where data came from
- When extracted
- Any filters applied

**Data Quality**:
- Known issues
- How handled
- Limitations

**Methodology**:
- Approach taken
- Why this approach
- Assumptions made

**Findings**:
- Key discoveries
- Supporting evidence
- Confidence level

**Limitations**:
- What analysis cannot tell us
- Caveats to interpretation

## Analysis Checklist

- [ ] Understand the business question
- [ ] Know data source and collection method
- [ ] Check data types and structure
- [ ] Assess completeness (missing data)
- [ ] Check for outliers and anomalies
- [ ] Understand distributions
- [ ] Examine relationships between variables
- [ ] Document data quality issues
- [ ] Draw appropriate conclusions
- [ ] State assumptions and limitations
