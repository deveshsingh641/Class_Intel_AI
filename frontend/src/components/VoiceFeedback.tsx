import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface VoiceFeedbackProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceFeedback({ onTranscript, disabled }: VoiceFeedbackProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [transcript, setTranscript] = useState("");
  const [interimText, setInterimText] = useState("");
  const recognitionRef = useRef<any>(null);

  const startRecording = () => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += t + " ";
        } else {
          interim += t;
        }
      }

      if (final) {
        setTranscript((prev) => {
          const newText = (prev + " " + final).trim();
          onTranscript(newText);
          return newText;
        });
      }
      setInterimText(interim);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
      setInterimText("");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setTranscript("");
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  if (!isSupported) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <MicOff className="h-3 w-3" />
        Voice input not supported in this browser
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={isRecording ? "destructive" : "outline"}
          size="sm"
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled}
          className="gap-1.5"
        >
          {isRecording ? (
            <>
              <div className="relative">
                <Mic className="h-3.5 w-3.5" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-red-400 rounded-full animate-ping" />
              </div>
              Stop Recording
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5" />
              Voice Feedback
            </>
          )}
        </Button>
        {isRecording && (
          <Badge
            variant="outline"
            className="animate-pulse text-red-600 border-red-300"
          >
            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            Listening...
          </Badge>
        )}
      </div>
      {(transcript || interimText) && (
        <div className="text-xs p-2 bg-muted rounded-md">
          <span>{transcript}</span>
          {interimText && (
            <span className="text-muted-foreground italic">
              {" "}
              {interimText}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
