import { useEffect, useState } from "react";

export type BootStage =
  | "Initializing NeuroEdge"
  | "Starting Kernel"
  | "Loading Cognitive Modules"
  | "Finalizing Interface"
  | "Ready";

export const useBootSequence = () => {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<BootStage>("Initializing NeuroEdge");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let current = 0;

    const steps: { until: number; stage: BootStage }[] = [
      { until: 20, stage: "Initializing NeuroEdge" },
      { until: 45, stage: "Starting Kernel" },
      { until: 70, stage: "Loading Cognitive Modules" },
      { until: 95, stage: "Finalizing Interface" },
      { until: 100, stage: "Ready" },
    ];

    const interval = setInterval(() => {
      current += Math.random() * 4 + 1;
      if (current >= 100) {
        current = 100;
        setProgress(100);
        setStage("Ready");
        clearInterval(interval);
        setTimeout(() => setDone(true), 500);
      } else {
        setProgress(Math.floor(current));
        const step = steps.find(s => current <= s.until);
        if (step) setStage(step.stage);
      }
    }, 120);

    return () => clearInterval(interval);
  }, []);

  return { progress, stage, done };
};
