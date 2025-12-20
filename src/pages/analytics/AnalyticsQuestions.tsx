import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AnalyticsQuestionsProps {
  onNavigateToDiagnostics: (productId: string) => void;
}

export const AnalyticsQuestions = ({ onNavigateToDiagnostics }: AnalyticsQuestionsProps) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Вопросы</CardTitle>
          <CardDescription>Анализ вопросов и тем</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Раздел в разработке...</p>
        </CardContent>
      </Card>
    </div>
  );
};

