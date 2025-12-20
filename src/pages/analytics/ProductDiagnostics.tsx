import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface ProductDiagnosticsProps {
  productId: string | null;
  onBack: () => void;
}

export const ProductDiagnostics = ({ productId, onBack }: ProductDiagnosticsProps) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h2 className="text-2xl font-bold">Диагностика товара</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Диагностика товара</CardTitle>
          <CardDescription>Детальный анализ отзывов и вопросов по товару</CardDescription>
        </CardHeader>
        <CardContent>
          {productId ? (
            <p className="text-muted-foreground">Загрузка данных для товара {productId}...</p>
          ) : (
            <p className="text-muted-foreground">Выберите товар для диагностики</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

