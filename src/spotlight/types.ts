export interface ProcessingMode {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  user_prompt_template: string;
  is_default: boolean;
  is_pinned?: boolean;
}

export interface Flow {
  id: string;
  name: string;
  description: string;
  steps: string[];
  is_pinned: boolean;
}

export interface FlowStepProgress {
  step_index: number;
  total_steps: number;
  mode_name: string;
  status: "processing" | "done";
}
