/**
 * АНАЛИТИКА АКЦИЙ И СПЕЦИАЛЬНЫХ ПРЕДЛОЖЕНИЙ
 *
 * ⚠️ ВАЖНО: Это НЕ Аналитика Продвижения!
 *
 * Этот файл: Аналитика акций магазина (скидки, специальные предложения)
 * Маршрут: /app/analytics/promotions
 *
 * Другой файл: PromotionAnalytics.tsx - это аналитика рекламных кампаний OZON Performance
 * Маршрут: /app/analytics/promotion
 *
 * Статус: В РАЗРАБОТКЕ (заглушка)
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Construction } from "lucide-react";

const PromotionsAnalytics = () => {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Аналитика Акций</h1>
        <p className="text-muted-foreground mt-2">
          Анализ эффективности акций и специальных предложений магазина
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="w-5 h-5" />
            В разработке
          </CardTitle>
          <CardDescription>
            Этот раздел находится в разработке
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-muted-foreground">
            <Construction className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">Функционал в разработке</p>
            <p className="text-sm mt-2">
              Здесь будет отображаться аналитика по акциям и специальным предложениям вашего магазина
            </p>
            <div className="mt-6 p-4 bg-muted rounded-lg text-left max-w-md mx-auto">
              <p className="text-xs font-medium mb-2">Планируемые функции:</p>
              <ul className="text-xs space-y-1 list-disc list-inside">
                <li>Эффективность скидок и акций</li>
                <li>Конверсия по акционным товарам</li>
                <li>Сравнение обычных и акционных продаж</li>
                <li>ROI акционных предложений</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-orange-200 bg-orange-50">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="text-orange-600">⚠️</div>
            <div className="text-sm">
              <p className="font-medium text-orange-900">Не путайте с Аналитикой Продвижения</p>
              <p className="text-orange-700 mt-1">
                Аналитика Продвижения (другой раздел) показывает эффективность рекламных кампаний OZON Performance API.
                Текущий раздел предназначен для анализа акций и скидок в вашем магазине.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PromotionsAnalytics;
