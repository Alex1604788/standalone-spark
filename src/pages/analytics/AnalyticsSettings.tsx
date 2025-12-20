import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

export const AnalyticsSettings = () => {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Настройки аналитики</CardTitle>
          <CardDescription>Управление параметрами аналитики и уведомлениями</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-semibold">Telegram уведомления</h3>
            <div className="flex items-center justify-between">
              <Label htmlFor="weekly-report">Еженедельный отчёт по негативным отзывам</Label>
              <Switch id="weekly-report" />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="anomaly-alerts">Уведомления об аномальном росте негатива</Label>
              <Switch id="anomaly-alerts" />
            </div>
            <div className="text-sm text-muted-foreground">
              Статус подключения: не подключен
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">Параметры аномалий</h3>
            <div className="space-y-2">
              <Label htmlFor="anomaly-threshold">Порог аномалии (множитель)</Label>
              <Input id="anomaly-threshold" type="number" defaultValue={3} min={2} max={10} />
              <p className="text-xs text-muted-foreground">
                Аномалией считается рост негатива в X раз относительно нормы
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="weeks-for-norm">Количество недель для расчёта нормы</Label>
              <Input id="weeks-for-norm" type="number" defaultValue={4} min={2} max={12} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

