---
id: python-analysis
name: Python Data Analysis
description: Best practices for Python data analysis and scientific computing
tags: python, pandas, numpy, data-analysis, visualization
projectTypes: python, jupyter, data-science
---

# Python Data Analysis Best Practices

## Environment Setup

### Virtual Environments
```bash
# Create virtual environment
python -m venv venv

# Activate
source venv/bin/activate  # Linux/Mac
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt
```

### Project Structure
```
project/
  data/
    raw/           # Original data
    processed/     # Cleaned data
    external/      # Third-party data
  notebooks/       # Jupyter notebooks
  src/
    data/          # Data loading/processing
    features/      # Feature engineering
    models/        # Model code
    visualization/ # Plotting functions
  tests/
  config.py
  requirements.txt
```

## Pandas Best Practices

### Data Loading
```python
import pandas as pd

# Read with proper dtypes
df = pd.read_csv('data.csv',
    dtype={'id': str, 'count': int},
    parse_dates=['created_at'],
    na_values=['', 'NA', 'null']
)

# Memory optimization
df = pd.read_csv('large.csv',
    usecols=['col1', 'col2'],  # Only needed columns
    chunksize=10000            # Process in chunks
)
```

### Data Exploration
```python
# Quick overview
df.info()
df.describe()
df.shape
df.dtypes

# Missing values
df.isnull().sum()
df.isnull().sum() / len(df) * 100  # Percentage

# Unique values
df['category'].value_counts()
df['category'].nunique()
```

### Data Cleaning
```python
# Handle missing values
df['column'].fillna(df['column'].median(), inplace=True)
df.dropna(subset=['required_column'])

# Remove duplicates
df.drop_duplicates(subset=['id'], keep='first')

# Fix data types
df['date'] = pd.to_datetime(df['date'])
df['amount'] = pd.to_numeric(df['amount'], errors='coerce')

# String cleaning
df['name'] = df['name'].str.strip().str.lower()
```

### Efficient Operations
```python
# Use vectorized operations (fast)
df['total'] = df['price'] * df['quantity']

# Avoid iterrows (slow)
# Instead of: for idx, row in df.iterrows(): ...
# Use: df.apply() or vectorized operations

# Use query for filtering (readable)
df.query('age > 25 and city == "NYC"')

# Use loc/iloc properly
df.loc[df['status'] == 'active', 'flag'] = 1
```

### Grouping and Aggregation
```python
# Multiple aggregations
df.groupby('category').agg({
    'sales': ['sum', 'mean', 'count'],
    'profit': ['sum', 'mean']
})

# Named aggregations
df.groupby('category').agg(
    total_sales=('sales', 'sum'),
    avg_sales=('sales', 'mean'),
    num_orders=('order_id', 'count')
)

# Transform (keep original shape)
df['pct_of_group'] = df.groupby('category')['sales'].transform(
    lambda x: x / x.sum()
)
```

## NumPy Essentials

### Array Operations
```python
import numpy as np

# Create arrays
arr = np.array([1, 2, 3, 4, 5])
zeros = np.zeros((3, 4))
ones = np.ones((3, 4))
range_arr = np.arange(0, 10, 0.5)

# Broadcasting
a = np.array([[1], [2], [3]])
b = np.array([4, 5, 6])
result = a + b  # 3x3 matrix

# Aggregations
np.sum(arr)
np.mean(arr)
np.std(arr)
np.percentile(arr, [25, 50, 75])
```

### Performance Tips
```python
# Use numpy for numerical operations
# Instead of: [x**2 for x in list_of_numbers]
np.square(np_array)  # Much faster

# Preallocate arrays
result = np.empty(n)
for i in range(n):
    result[i] = compute(i)
```

## Data Visualization

### Matplotlib Basics
```python
import matplotlib.pyplot as plt

fig, ax = plt.subplots(figsize=(10, 6))
ax.plot(x, y, label='Data', color='blue', linewidth=2)
ax.set_xlabel('X Label')
ax.set_ylabel('Y Label')
ax.set_title('Chart Title')
ax.legend()
plt.tight_layout()
plt.savefig('plot.png', dpi=300)
```

### Seaborn for Statistical Plots
```python
import seaborn as sns

# Set style
sns.set_theme(style='whitegrid')

# Distribution
sns.histplot(data=df, x='value', hue='category')
sns.kdeplot(data=df, x='value', hue='category')

# Relationships
sns.scatterplot(data=df, x='x', y='y', hue='category')
sns.regplot(data=df, x='x', y='y')

# Categorical
sns.boxplot(data=df, x='category', y='value')
sns.violinplot(data=df, x='category', y='value')

# Heatmaps
sns.heatmap(df.corr(), annot=True, cmap='coolwarm')
```

### Plotly for Interactive Plots
```python
import plotly.express as px

fig = px.scatter(df, x='x', y='y', color='category',
                 hover_data=['name', 'value'])
fig.update_layout(title='Interactive Scatter')
fig.show()
```

## Statistical Analysis

### Descriptive Statistics
```python
from scipy import stats

# Central tendency
mean = df['value'].mean()
median = df['value'].median()
mode = df['value'].mode()

# Dispersion
std = df['value'].std()
variance = df['value'].var()
iqr = df['value'].quantile(0.75) - df['value'].quantile(0.25)

# Distribution shape
skewness = df['value'].skew()
kurtosis = df['value'].kurtosis()
```

### Hypothesis Testing
```python
# T-test
t_stat, p_value = stats.ttest_ind(group1, group2)

# Chi-square test
chi2, p_value, dof, expected = stats.chi2_contingency(
    pd.crosstab(df['cat1'], df['cat2'])
)

# Correlation
corr, p_value = stats.pearsonr(x, y)
corr, p_value = stats.spearmanr(x, y)
```

### Confidence Intervals
```python
from scipy.stats import sem, t

confidence = 0.95
n = len(data)
mean = np.mean(data)
se = sem(data)
h = se * t.ppf((1 + confidence) / 2, n - 1)

ci_lower = mean - h
ci_upper = mean + h
```

## Machine Learning Workflow

### Data Preparation
```python
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler, LabelEncoder

# Split data
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42, stratify=y
)

# Scale features
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)

# Encode categories
le = LabelEncoder()
y_encoded = le.fit_transform(y)
```

### Model Training
```python
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix

# Train
model = RandomForestClassifier(n_estimators=100, random_state=42)
model.fit(X_train, y_train)

# Predict
y_pred = model.predict(X_test)

# Evaluate
print(classification_report(y_test, y_pred))
print(confusion_matrix(y_test, y_pred))
```

### Cross-Validation
```python
from sklearn.model_selection import cross_val_score

scores = cross_val_score(model, X, y, cv=5, scoring='accuracy')
print(f'CV Accuracy: {scores.mean():.3f} (+/- {scores.std() * 2:.3f})')
```

## Jupyter Notebook Best Practices

### Structure
1. **Title and description** at the top
2. **Imports** in the first cell
3. **Configuration** (paths, constants)
4. **Data loading**
5. **Exploration**
6. **Analysis**
7. **Conclusions**

### Magic Commands
```python
%matplotlib inline
%load_ext autoreload
%autoreload 2

# Time execution
%timeit function()
%%time  # For cell

# Memory profiling
%load_ext memory_profiler
%memit function()
```

### Documentation
```python
# Use markdown cells for explanations
# Include reasoning, not just code

# Document functions
def analyze_data(df, column):
    """
    Analyze the distribution of a column.

    Parameters
    ----------
    df : pd.DataFrame
        Input dataframe
    column : str
        Column name to analyze

    Returns
    -------
    dict
        Dictionary with statistical measures
    """
    pass
```

## Common Patterns

### Pipeline Pattern
```python
def load_and_clean(filepath):
    return (pd.read_csv(filepath)
            .pipe(remove_duplicates)
            .pipe(fill_missing)
            .pipe(convert_types)
            .pipe(add_features))

def remove_duplicates(df):
    return df.drop_duplicates()

def fill_missing(df):
    return df.fillna(method='ffill')
```

### Feature Engineering
```python
# Date features
df['year'] = df['date'].dt.year
df['month'] = df['date'].dt.month
df['day_of_week'] = df['date'].dt.dayofweek
df['is_weekend'] = df['day_of_week'].isin([5, 6])

# Binning
df['age_group'] = pd.cut(df['age'],
    bins=[0, 18, 35, 50, 65, 100],
    labels=['<18', '18-35', '35-50', '50-65', '65+'])

# One-hot encoding
df = pd.get_dummies(df, columns=['category'], prefix='cat')
```
