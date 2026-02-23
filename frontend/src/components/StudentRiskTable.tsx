import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { AlertTriangle, ChevronDown, ChevronUp, ShieldAlert, ShieldCheck, User } from "lucide-react";

interface StudentRisk {
  studentName: string;
  studentId?: string;
  riskLevel: "high" | "medium" | "low";
  riskScore: number;
  safetyScore: number;
  riskColor: string;
  components: {
    attendance: { value: number };
    marks: { value: number };
    sentiment: { value: number };
    engagement: { value: number };
  };
  factors: { factor: string; severity: string; value: string }[];
  recommendations: string[];
}

interface RiskData {
  students: StudentRisk[];
  summary: {
    total: number;
    highRisk: number;
    mediumRisk: number;
    lowRisk: number;
    highRiskPercent: number;
    mediumRiskPercent: number;
    lowRiskPercent: number;
  };
}

interface StudentRiskTableProps {
  teacherId: string;
}

export function StudentRiskTable({ teacherId }: StudentRiskTableProps) {
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newStudents, setNewStudents] = useState<{ name: string; attendance: string; marks: string }[]>([
    { name: "", attendance: "75", marks: "50" },
  ]);

  // Get saved risk data
  const { data: riskData, isLoading } = useQuery<RiskData>({
    queryKey: [`/api/intelligence/risk/${teacherId}`],
  });

  // Predict risk mutation
  const predictMutation = useMutation({
    mutationFn: async (students: any[]) => {
      const res = await apiRequest("POST", `/api/intelligence/risk/${teacherId}`, { students });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/intelligence/risk/${teacherId}`] });
      setShowAddForm(false);
      setNewStudents([{ name: "", attendance: "75", marks: "50" }]);
    },
  });

  const addStudentRow = () => {
    setNewStudents([...newStudents, { name: "", attendance: "75", marks: "50" }]);
  };

  const updateStudent = (idx: number, field: string, value: string) => {
    const updated = [...newStudents];
    (updated[idx] as any)[field] = value;
    setNewStudents(updated);
  };

  const submitPrediction = () => {
    const valid = newStudents.filter(s => s.name.trim());
    if (valid.length === 0) return;
    predictMutation.mutate(
      valid.map(s => ({
        name: s.name.trim(),
        attendance: parseFloat(s.attendance) || 75,
        marks: parseFloat(s.marks) || 50,
        engagementScore: 50,
      }))
    );
  };

  const getRiskIcon = (level: string) => {
    switch (level) {
      case "high": return <ShieldAlert className="h-4 w-4 text-red-500" />;
      case "medium": return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      default: return <ShieldCheck className="h-4 w-4 text-green-500" />;
    }
  };

  const getRiskBadge = (level: string) => {
    const variants: Record<string, "destructive" | "secondary" | "default"> = {
      high: "destructive", medium: "secondary", low: "default",
    };
    return <Badge variant={variants[level] || "default"}>{level.toUpperCase()}</Badge>;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              ⚠️ Performance Risk Prediction
            </CardTitle>
            <CardDescription>AI-powered student risk assessment</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? "Cancel" : "+ Add Students"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Add Students Form */}
        {showAddForm && (
          <div className="mb-6 p-4 border rounded-lg bg-muted/50 space-y-3">
            <p className="text-sm font-medium">Enter student data for risk prediction:</p>
            {newStudents.map((s, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-2">
                <Input
                  placeholder="Student name"
                  value={s.name}
                  onChange={e => updateStudent(idx, "name", e.target.value)}
                />
                <Input
                  placeholder="Attendance %"
                  type="number"
                  min="0"
                  max="100"
                  value={s.attendance}
                  onChange={e => updateStudent(idx, "attendance", e.target.value)}
                />
                <Input
                  placeholder="Marks %"
                  type="number"
                  min="0"
                  max="100"
                  value={s.marks}
                  onChange={e => updateStudent(idx, "marks", e.target.value)}
                />
              </div>
            ))}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={addStudentRow}>+ Add Row</Button>
              <Button size="sm" onClick={submitPrediction} disabled={predictMutation.isPending}>
                {predictMutation.isPending ? "Predicting..." : "🧠 Predict Risk"}
              </Button>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {riskData?.summary && riskData.summary.total > 0 && (
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-center">
              <p className="text-2xl font-bold text-red-600">{riskData.summary.highRisk}</p>
              <p className="text-xs text-red-600/80">High Risk</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-center">
              <p className="text-2xl font-bold text-amber-600">{riskData.summary.mediumRisk}</p>
              <p className="text-xs text-amber-600/80">Medium Risk</p>
            </div>
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 text-center">
              <p className="text-2xl font-bold text-green-600">{riskData.summary.lowRisk}</p>
              <p className="text-xs text-green-600/80">Low Risk</p>
            </div>
          </div>
        )}

        {/* Risk Table */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground animate-pulse">Loading risk data...</div>
        ) : !riskData?.students?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <User className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>No risk assessments yet. Add students above to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left py-2 px-2">Student</th>
                  <th className="text-center py-2 px-2">Risk</th>
                  <th className="text-center py-2 px-2">Score</th>
                  <th className="text-center py-2 px-2">Attendance</th>
                  <th className="text-center py-2 px-2">Marks</th>
                  <th className="text-center py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {riskData.students.map((student, idx) => (
                  <>
                    <tr
                      key={idx}
                      className="border-b hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => setExpandedRow(expandedRow === student.studentName ? null : student.studentName)}
                    >
                      <td className="py-2.5 px-2 flex items-center gap-2">
                        {getRiskIcon(student.riskLevel)}
                        <span className="font-medium">{student.studentName}</span>
                      </td>
                      <td className="text-center py-2.5 px-2">{getRiskBadge(student.riskLevel)}</td>
                      <td className="text-center py-2.5 px-2">
                        <span
                          className="font-mono font-bold"
                          style={{ color: student.riskColor }}
                        >
                          {student.riskScore}
                        </span>
                      </td>
                      <td className="text-center py-2.5 px-2">{student.components?.attendance?.value ?? "-"}%</td>
                      <td className="text-center py-2.5 px-2">{student.components?.marks?.value ?? "-"}%</td>
                      <td className="text-center py-2.5 px-2">
                        {expandedRow === student.studentName ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </td>
                    </tr>
                    {expandedRow === student.studentName && (
                      <tr key={`${idx}-detail`}>
                        <td colSpan={6} className="px-4 py-3 bg-muted/30">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-semibold mb-1">Risk Factors:</p>
                              {(student.factors || []).map((f, fi) => (
                                <div key={fi} className="flex items-center gap-2 text-xs mb-1">
                                  <Badge variant={f.severity === "high" ? "destructive" : "secondary"} className="text-[10px]">
                                    {f.severity}
                                  </Badge>
                                  <span>{f.factor} ({f.value})</span>
                                </div>
                              ))}
                              {(!student.factors || student.factors.length === 0) && (
                                <p className="text-xs text-muted-foreground">No specific risk factors</p>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-semibold mb-1">Recommendations:</p>
                              <ul className="text-xs space-y-1">
                                {(student.recommendations || []).map((r, ri) => (
                                  <li key={ri} className="flex items-start gap-1">
                                    <span className="text-primary mt-0.5">•</span>
                                    <span>{r}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
