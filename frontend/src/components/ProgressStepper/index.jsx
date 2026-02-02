import { CheckIcon } from '@/assets/icons';
import './ProgressStepper.css';

function ProgressStepper({ currentStep = 3 }) {
  const steps = [
    { number: 1, label: 'Metric Setup', id: 'metric-setup' },
    { number: 2, label: 'API Key', id: 'api-key' },
    { number: 3, label: 'Activation', id: 'activation' },
  ];

  return (
    <div className="progress-stepper">
      {steps.map((step, index) => {
        const isActive = step.number === currentStep;
        const isCompleted = step.number < currentStep;

        return (
          <div key={step.id} className="step-wrapper">
            <div
              className={`step-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            >
              <div className="step-icon-wrapper">
                {isCompleted ? (
                  <CheckIcon size={20} />
                ) : (
                  <span className="step-number">{step.number}</span>
                )}
              </div>
              <span className="step-label">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div className={`step-connector ${isCompleted ? 'completed' : ''}`}></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ProgressStepper;
