---
id: statistical-foundations
name: Statistical Foundations
type: internal
description: Core statistical concepts for data analysis
tags: analysis, statistics, testing, probability
---

# Statistical Foundations

## Descriptive Statistics

### Measures of Central Tendency

**Mean (Average)**:
- Sum of values / count
- Sensitive to outliers
- Use when: Symmetric distributions, no extreme outliers

**Median**:
- Middle value when sorted
- Robust to outliers
- Use when: Skewed distributions, outliers present

**Mode**:
- Most frequent value
- Can have multiple modes
- Use when: Categorical data, finding typical category

### Measures of Spread

**Range**: Max - Min
- Simple but sensitive to outliers

**Variance**: Average squared deviation from mean
- Units are squared

**Standard Deviation**: Square root of variance
- Same units as data
- ~68% within 1 SD, ~95% within 2 SD (normal distribution)

**Interquartile Range (IQR)**: Q3 - Q1
- Middle 50% of data
- Robust to outliers

**Percentiles**:
- P25 (Q1), P50 (median), P75 (Q3)
- P95, P99 for tail behavior

### Distribution Shape

**Skewness**:
- Positive: Tail extends right (mean > median)
- Negative: Tail extends left (mean < median)
- Zero: Symmetric

**Kurtosis**:
- How heavy the tails are
- High: More outliers
- Low: Fewer outliers

## Probability Basics

### Probability Rules

- P(A) is between 0 and 1
- P(not A) = 1 - P(A)
- P(A or B) = P(A) + P(B) - P(A and B)
- P(A and B) = P(A) × P(B|A)

### Conditional Probability

P(A|B) = "Probability of A given B"

**Bayes' Theorem**:
```
P(A|B) = P(B|A) × P(A) / P(B)
```

### Independence

Events A and B are independent if:
```
P(A and B) = P(A) × P(B)
P(A|B) = P(A)
```

## Distributions

### Normal Distribution
- Bell-shaped, symmetric
- Defined by mean (μ) and standard deviation (σ)
- 68-95-99.7 rule
- Many natural phenomena

### Binomial Distribution
- Number of successes in n trials
- Each trial: success or failure
- Fixed probability p
- Example: Coin flips, conversion rates

### Poisson Distribution
- Count of events in fixed interval
- Events occur independently
- Constant average rate
- Example: Website visits per hour

### When to Use What

| Situation | Distribution |
|-----------|--------------|
| Continuous, symmetric | Normal |
| Yes/No outcomes | Binomial |
| Count of rare events | Poisson |
| Time until event | Exponential |

## Hypothesis Testing

### Framework

1. **Null Hypothesis (H₀)**: No effect, no difference
2. **Alternative Hypothesis (H₁)**: There is an effect
3. **Choose significance level (α)**: Typically 0.05
4. **Calculate test statistic**
5. **Compare to threshold or calculate p-value**
6. **Make decision**

### Key Concepts

**P-value**:
- Probability of seeing results this extreme if H₀ is true
- Small p-value → evidence against H₀
- NOT the probability H₀ is true

**Significance Level (α)**:
- Threshold for rejecting H₀
- Commonly 0.05 (5%)
- Lower α = stricter standard

**Type I Error (False Positive)**:
- Rejecting H₀ when it's true
- Probability = α

**Type II Error (False Negative)**:
- Not rejecting H₀ when it's false
- Related to statistical power

### Common Tests

**Comparing Means**:
- One-sample t-test: Sample vs. known value
- Two-sample t-test: Two independent groups
- Paired t-test: Same subjects, two conditions

**Comparing Proportions**:
- One-proportion z-test: Sample vs. known proportion
- Two-proportion z-test: Two groups
- Chi-square test: Categories

**Relationships**:
- Correlation test: Linear relationship strength
- Regression: Predict one variable from another(s)

### Choosing a Test

| Question | Test |
|----------|------|
| Is mean different from X? | One-sample t-test |
| Are two group means different? | Two-sample t-test |
| Is proportion different from X? | One-proportion z-test |
| Are two proportions different? | Chi-square or z-test |
| Are categories independent? | Chi-square |
| Is there a linear relationship? | Correlation test |

## Correlation

### Pearson Correlation (r)
- Range: -1 to +1
- Measures linear relationship
- Assumes normal distribution
- Sensitive to outliers

**Interpretation**:
- 0.0-0.3: Weak
- 0.3-0.7: Moderate
- 0.7-1.0: Strong

### Spearman Correlation
- Based on ranks
- Doesn't assume normality
- Measures monotonic relationship
- More robust to outliers

### Correlation ≠ Causation

Correlation does NOT mean:
- X causes Y
- Y causes X
- There's no third variable causing both
- The relationship will continue

## Sample Size & Power

### Why Sample Size Matters
- Too small: Can't detect real effects
- Too large: Wasteful, detect trivial effects

### Power Analysis

**Statistical Power**: Probability of detecting true effect

**Factors**:
- Effect size: Larger effect → easier to detect
- Sample size: Larger sample → more power
- Significance level: Higher α → more power (but more false positives)
- Variability: Less variance → more power

**Typical Target**: 80% power

### Effect Size

**Cohen's d** (mean difference):
- Small: 0.2
- Medium: 0.5
- Large: 0.8

**Practical vs Statistical Significance**:
- Large sample can make tiny differences "significant"
- Always report effect size, not just p-value

## Confidence Intervals

### Interpretation
95% CI means: If we repeated sampling many times, 95% of CIs would contain the true value.

It does NOT mean: 95% probability the true value is in this specific interval.

### Width Depends On
- Sample size (larger → narrower)
- Variability (more variance → wider)
- Confidence level (higher → wider)

### Using CIs
- If CI doesn't include 0 (for difference), significant at that level
- CI gives range of plausible values, more informative than just p-value
- Report CIs alongside point estimates

## Common Mistakes

1. **P-value misinterpretation**: P-value is not probability H₀ is true
2. **Significant ≠ Important**: Statistical significance ≠ practical importance
3. **Multiple comparisons**: Testing many hypotheses inflates false positives
4. **Correlation as causation**: Association doesn't prove causation
5. **Ignoring assumptions**: Tests have requirements (normality, independence)
6. **Small sample conclusions**: Be cautious with n < 30
7. **Cherry-picking results**: Report all analyses, not just favorable ones

## Statistical Checklist

- [ ] Appropriate test for data type and question
- [ ] Assumptions checked
- [ ] Sample size adequate
- [ ] Effect size reported (not just p-value)
- [ ] Confidence interval provided
- [ ] Results interpreted correctly
- [ ] Limitations acknowledged
- [ ] Multiple comparison adjustment if needed
