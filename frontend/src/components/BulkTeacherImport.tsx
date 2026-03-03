import { useState, useRef } from "react";
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import type { Teacher } from "@shared/schema";

interface BulkTeacherImportProps {
  onImportComplete?: (teachers: Teacher[]) => void;
}

export function BulkTeacherImport({ onImportComplete }: BulkTeacherImportProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const token = localStorage.getItem('token');
      const response = await fetch('/api/admin/teachers/bulk-import', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error('Import failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      setImportStatus('success');
      setImportProgress(100);
      toast({
        title: "Import successful!",
        description: `Successfully imported ${data.imported} teachers.`,
      });
      onImportComplete?.(data.teachers);
    },
    onError: (error) => {
      setImportStatus('error');
      setErrorMessage(error.message || 'Failed to import teachers');
      toast({
        title: "Import failed",
        description: error.message || 'Failed to import teachers. Please check your file format.',
        variant: "destructive",
      });
    },
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    const csvFile = files.find(file => file.type === 'text/csv' || file.name.endsWith('.csv'));
    
    if (csvFile) {
      handleFileImport(csvFile);
    } else {
      toast({
        title: "Invalid file",
        description: "Please upload a CSV file.",
        variant: "destructive",
      });
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileImport(file);
    }
  };

  const handleFileImport = (file: File) => {
    setImportStatus('processing');
    setImportProgress(0);
    setErrorMessage('');
    
    // Simulate progress
    const progressInterval = setInterval(() => {
      setImportProgress(prev => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return prev;
        }
        return prev + 10;
      });
    }, 200);
    
    importMutation.mutate(file);
  };

  const downloadTemplate = () => {
    const csvContent = `name,email,department,subject,phone
John Doe,john.doe@school.edu,Mathematics,Algebra,+1234567890
Jane Smith,jane.smith@school.edu,Science,Physics,+1234567891`;
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'teacher-import-template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5" />
          Bulk Import Teachers
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Template Download */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div>
            <h4 className="font-medium">Download Template</h4>
            <p className="text-sm text-muted-foreground">
              Get the CSV template with required columns
            </p>
          </div>
          <Button variant="outline" onClick={downloadTemplate}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Download Template
          </Button>
        </div>

        {/* File Upload Area */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging
              ? 'border-primary bg-primary/5'
              : 'border-muted-foreground/25 hover:border-primary/50'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="hidden"
          />
          
          <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="font-medium mb-2">
            {isDragging ? 'Drop your CSV file here' : 'Upload CSV File'}
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            Drag and drop your CSV file here, or click to browse
          </p>
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={importStatus === 'processing'}
          >
            Select File
          </Button>
        </div>

        {/* Progress */}
        {importStatus === 'processing' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Importing teachers...</span>
              <span>{importProgress}%</span>
            </div>
            <Progress value={importProgress} className="w-full" />
          </div>
        )}

        {/* Success/Error Messages */}
        {importStatus === 'success' && (
          <Alert className="border-green-200 bg-green-50">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">
              Teachers imported successfully! {importMutation.data?.imported} teachers added.
            </AlertDescription>
          </Alert>
        )}

        {importStatus === 'error' && (
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              {errorMessage}
            </AlertDescription>
          </Alert>
        )}

        {/* Instructions */}
        <div className="text-sm text-muted-foreground space-y-1">
          <p><strong>Required columns:</strong> name, email, department, subject</p>
          <p><strong>Optional columns:</strong> phone, bio</p>
          <p><strong>Format:</strong> CSV file with headers in the first row</p>
        </div>
      </CardContent>
    </Card>
  );
}
