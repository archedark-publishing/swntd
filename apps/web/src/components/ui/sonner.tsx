import { Toaster as Sonner, type ToasterProps } from "sonner";

export function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      closeButton={false}
      duration={3200}
      position="bottom-center"
      toastOptions={{
        classNames: {
          toast:
            "group toast border border-border/60 bg-white/92 text-foreground shadow-2xl backdrop-blur-md",
          title: "font-medium text-[rgb(32_23_15_/_0.92)]",
          description: "text-[rgb(47_33_22_/_0.76)]",
          actionButton:
            "bg-primary text-primary-foreground hover:bg-primary/90",
          cancelButton:
            "bg-secondary text-secondary-foreground hover:bg-secondary/90"
        }
      }}
      {...props}
    />
  );
}
