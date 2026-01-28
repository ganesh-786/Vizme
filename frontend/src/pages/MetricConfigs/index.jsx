// Re-export components for the MetricConfigs module
export { default as MetricConfigsList } from './MetricConfigsList';
export { default as MetricConfigForm } from './MetricConfigForm';

// Default export is the list view
import MetricConfigsList from './MetricConfigsList';
export default MetricConfigsList;
