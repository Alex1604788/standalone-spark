import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

const CompetitorsSettings = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Users className="w-8 h-8" />
            Настройка Конкурентов
          </h1>
          <p className="text-muted-foreground mt-2">
            Управление списком конкурентов для мониторинга и анализа
          </p>
        </div>
        <Button>
          <Plus className="w-4 h-4 mr-2" />
          Добавить конкурента
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Список конкурентов</CardTitle>
          <CardDescription>
            Управляйте списком конкурентов для отслеживания цен, рейтингов и позиций
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Раздел в разработке</p>
            <p className="text-sm mt-2">
              Здесь вы сможете добавлять конкурентов, настраивать мониторинг их цен,
              рейтингов и позиций в поиске
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CompetitorsSettings;

