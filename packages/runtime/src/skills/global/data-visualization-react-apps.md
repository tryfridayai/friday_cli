---
id: data-visualization-react-apps
name: Data Visualization with React Apps
type: internal
description: Create lightweight React applications for data visualization using Apache ECharts and Chart.js
tags:
  - visualization
  - charts
  - dashboards
  - data-analysis
  - react
  - echarts
  - chartjs
---

# Data Visualization React Apps

When the user requests data visualizations, charts, dashboards, or any visual representation of data, create a lightweight React application using appropriate charting libraries.

## Library Selection

### Apache ECharts (for complex visualizations)
Use ECharts when the visualization requires:
- Multiple chart types in one view (combo charts)
- Interactive features (zoom, pan, brush selection)
- Large datasets (1000+ data points)
- Geographic/map visualizations
- Complex hierarchical data (treemaps, sunbursts)
- Animated transitions
- Custom themes or advanced styling
- Dashboards with multiple coordinated views

Install: `npm install echarts echarts-for-react`

### Chart.js (for simple, lightweight charts)
Use Chart.js when the visualization is:
- Simple bar, line, pie, or doughnut charts
- Small to medium datasets (under 500 data points)
- Basic interactivity (tooltips, legends)
- Quick prototypes or simple displays
- Minimal bundle size is important

Install: `npm install chart.js react-chartjs-2`

## Data Format

**Always store data in JSON object format** unless the user explicitly specifies a different data source (API, CSV, database, etc.).

### Example Data Structure
```javascript
// data/chartData.json or embedded in component
const chartData = {
  labels: ["January", "February", "March", "April", "May"],
  datasets: [
    {
      name: "Sales",
      values: [120, 190, 300, 500, 200]
    },
    {
      name: "Expenses",
      values: [80, 120, 200, 350, 150]
    }
  ],
  metadata: {
    title: "Monthly Revenue",
    currency: "USD",
    lastUpdated: "2024-01-15"
  }
}
```

## Project Structure

Create a minimal React app with Vite:

```
project-name/
├── package.json
├── vite.config.js
├── index.html
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── App.css
│   ├── components/
│   │   └── Chart.jsx (or Dashboard.jsx)
│   └── data/
│       └── chartData.json
```

## Implementation Guidelines

1. **Keep it lightweight**: Only install necessary dependencies
2. **Responsive design**: Charts should adapt to container size
3. **Accessible colors**: Use color-blind friendly palettes
4. **Loading states**: Show loading indicator while data loads
5. **Error handling**: Display user-friendly error messages

### Vite Configuration
```javascript
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true
  }
})
```

### Basic ECharts Example
```jsx
import ReactECharts from 'echarts-for-react';

function Chart({ data }) {
  const option = {
    title: { text: data.metadata?.title || 'Chart' },
    tooltip: { trigger: 'axis' },
    legend: { data: data.datasets.map(d => d.name) },
    xAxis: { type: 'category', data: data.labels },
    yAxis: { type: 'value' },
    series: data.datasets.map(dataset => ({
      name: dataset.name,
      type: 'line', // or 'bar', 'scatter', etc.
      data: dataset.values
    }))
  };

  return <ReactECharts option={option} style={{ height: 400 }} />;
}
```

### Basic Chart.js Example
```jsx
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

function Chart({ data }) {
  const chartData = {
    labels: data.labels,
    datasets: data.datasets.map((dataset, i) => ({
      label: dataset.name,
      data: dataset.values,
      borderColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'][i % 4],
      backgroundColor: ['#3b82f680', '#10b98180', '#f59e0b80', '#ef444480'][i % 4],
    }))
  };

  return <Line data={chartData} options={{ responsive: true }} />;
}
```

## Running the App

After creating the project:
```bash
npm install
npm run dev
```

The preview will automatically appear in Friday's preview pane.
