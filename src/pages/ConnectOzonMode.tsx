import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Shield } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ConnectOzonMode = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { clientId?: string; apiKey?: string };

  return (
    <div className="container max-w-3xl py-8">
      <Button
        variant="ghost"
        className="mb-6"
        onClick={() => navigate("/app/connect")}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Назад к выбору маркетплейса
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Выберите режим подключения</h1>
        <Alert className="mt-4">
          <AlertDescription>
            Ozon ограничивает работу с отзывами и вопросами только для подписки Premium Plus.
            Если у вас нет этой подписки — можно использовать безопасный UI-режим (через интерфейс Ozon).
          </AlertDescription>
        </Alert>
      </div>

      <div className="grid gap-6">
        <Card className="border-2 hover:border-primary transition-colors">
          <CardHeader>
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-xl mb-2">Официальный API (рекомендуется)</CardTitle>
                <CardDescription className="text-base">
                  Требуется Premium Plus. Автоматические ответы через Seller API.
                  Максимальная скорость и надёжность.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button 
              className="w-full" 
              size="lg"
              onClick={() => navigate("/app/connect/ozon/api", { state })}
            >
              Настроить официальный API
            </Button>
          </CardContent>
        </Card>

        <Card className="border-2 hover:border-primary transition-colors">
          <CardHeader>
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Shield className="w-8 h-8 text-blue-600" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-xl mb-2">UI-режим (Fallback)</CardTitle>
                <CardDescription className="text-base">
                  Работа через интерфейс Ozon с помощью защищённого расширения Lovable.
                  Безопасно, без передачи паролей. Не требует Premium Plus.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button 
              variant="outline" 
              className="w-full" 
              size="lg"
              onClick={() => navigate("/app/connect/ozon/pairing")}
            >
              Выбрать UI-режим
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="mt-8 p-4 bg-muted rounded-lg">
        <h3 className="font-semibold mb-2">Сравнение режимов</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium mb-1">Официальный API:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Требует Premium Plus (~15 000 ₽/мес)</li>
              <li>Прямой доступ к API</li>
              <li>Максимальная скорость</li>
            </ul>
          </div>
          <div>
            <p className="font-medium mb-1">UI-режим:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Не требует Premium Plus</li>
              <li>Работа через интерфейс</li>
              <li>Требует расширение для браузера</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConnectOzonMode;
