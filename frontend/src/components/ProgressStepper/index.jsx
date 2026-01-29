import { BarChartIcon, KeyIcon, RocketIcon, CheckIcon } from "@/assets/icons";
import "./ProgressStepper.css";

function ProgressStepper({ currentStep = 1 }) {
  const steps = [
    {
      number: 1,
      label: "Metric Setup",
      icon: BarChartIcon,
      id: "metric-setup",
    },
    { number: 2, label: "API Key", icon: KeyIcon, id: "api-key" },
    { number: 3, label: "Activation", icon: RocketIcon, id: "activation" },
  ];

  return (
    <div className="progress-stepper">
      {steps.map((step, index) => {
        const Icon = step.icon;
        const isActive = step.number === currentStep;
        const isCompleted = step.number < currentStep;

        return (
          <div key={step.id} className="step-wrapper">
            <div
              className={`step-item ${isActive ? "active" : ""} ${isCompleted ? "completed" : ""}`}
            >
              <div className="step-icon-wrapper">
                {isCompleted ? <CheckIcon size={18} /> : <Icon size={20} />}
              </div>
              <span className="step-label">{step.label}</span>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`step-connector ${isCompleted ? "completed" : ""}`}
              ></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default ProgressStepper;
