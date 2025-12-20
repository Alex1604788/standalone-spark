import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AnalyticsReviewsProps {
  onNavigateToDiagnostics: (productId: string) => void;
}

export const AnalyticsReviews = ({ onNavigateToDiagnostics }: AnalyticsReviewsProps) => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Отзывы</CardTitle>
          <CardDescription>Анализ отзывов и негативных оценок</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Раздел в разработке...</p>
        </CardContent>
      </Card>
    </div>
  );
};

