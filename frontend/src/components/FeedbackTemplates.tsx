import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const TEMPLATES = [
  {
    id: "positive",
    title: "Positive Feedback",
    template: "I really enjoyed this course. The teaching style was clear and engaging. The instructor was always available to help and provided excellent resources.",
  },
  {
    id: "constructive",
    title: "Constructive Feedback",
    template: "The course content was good, but I think it could benefit from more practical examples. The instructor was knowledgeable and approachable.",
  },
  {
    id: "detailed",
    title: "Detailed Feedback",
    template: "This course exceeded my expectations. The instructor's explanations were thorough, the assignments were relevant, and the feedback on my work was helpful. I particularly appreciated the real-world examples.",
  },
  {
    id: "appreciation",
    title: "Appreciation",
    template: "Thank you for being such a dedicated teacher. Your passion for the subject is evident, and it made learning enjoyable. I learned a lot from this course.",
  },
  {
    id: "improvement",
    title: "Suggestions for Improvement",
    template: "The course was informative, but I would suggest adding more interactive activities. The instructor was great at explaining complex topics in simple terms.",
  },
];

interface FeedbackTemplatesProps {
  onSelectTemplate: (template: string) => void;
  className?: string;
}

export function FeedbackTemplates({ onSelectTemplate, className }: FeedbackTemplatesProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("gap-2", className)}
        >
          <Sparkles className="h-4 w-4 text-emerald-500" />
          Use Template
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-[300px] overflow-y-auto p-3 space-y-2 z-[60]" align="end">
        <div className="flex items-center gap-1.5 pb-2 mb-1 border-b border-muted">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          <span className="font-semibold text-sm">Feedback Templates</span>
        </div>
        {TEMPLATES.map((template) => (
          <Button
            key={template.id}
            variant="outline"
            className="w-full text-left justify-start h-auto py-2.5 px-3 border border-muted hover:bg-muted/50"
            onClick={() => {
              onSelectTemplate(template.template);
              setIsOpen(false);
            }}
          >
            <div className="flex flex-col items-start gap-0.5">
              <span className="font-medium text-xs text-foreground">{template.title}</span>
              <span className="text-[10px] text-muted-foreground line-clamp-2 leading-snug">
                {template.template}
              </span>
            </div>
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}


