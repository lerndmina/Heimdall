type ToastProps = {
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
};

const toast = ({ title, description, variant = "default" }: ToastProps) => {
  // Simple console-based toast for now
  const message = description ? `${title}: ${description}` : title;
  if (variant === "destructive") {
    console.error(`🔴 ${message}`);
  } else {
    console.log(`✅ ${message}`);
  }
};

export const useToast = () => {
  return { toast };
};
