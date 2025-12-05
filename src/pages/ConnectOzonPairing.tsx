import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ConnectOzonPairing = () => {
  const navigate = useNavigate();


  const handleDownloadExtension = () => {
    navigate("/app/connect/ozon/fallback");
  };

  return (
    <div className="container max-w-3xl py-8">
      <Button
        variant="ghost"
        className="mb-6"
        onClick={() => navigate("/app/connect/ozon")}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Назад
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Подключение через UI-режим</h1>
        <p className="text-muted-foreground">
          Работа без Premium Plus через расширение браузера
        </p>
        <Alert className="mt-4">
          <AlertDescription>
            После установки расширения откройте его и вручную введите Email аккаунта Ozon и Seller ID, 
            затем нажмите «Сохранить и подключить». После этого можно сразу начать сканирование.
          </AlertDescription>
        </Alert>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Инструкция по подключению</CardTitle>
            <CardDescription>
              Простое подключение в 3 шага без кодов и паролей
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-3 text-sm">
              <li className="font-medium">
                Скачайте и установите расширение Lovable AutoAnswer
                <Button
                  variant="link"
                  size="sm"
                  className="ml-2 h-auto p-0"
                  onClick={handleDownloadExtension}
                >
                  <Download className="w-3 h-3 mr-1" />
                  Инструкция по установке
                </Button>
              </li>
              <li>
                Откройте расширение Lovable AutoAnswer (иконка в панели браузера)
              </li>
              <li>
                Введите Email аккаунта Ozon и Seller ID в форму подключения
              </li>
              <li>
                Нажмите кнопку «Сохранить и подключить»
              </li>
              <li>
                После подключения нажмите «Сканировать сейчас» для проверки
              </li>
              <li>
                Включите автоматическое сканирование (каждые 10 минут)
              </li>
            </ol>

            <Alert>
              <AlertDescription>
                💡 После подключения расширение будет автоматически сканировать отзывы 
                и отправлять их в очередь модерации. Вам не нужно держать вкладку Ozon открытой.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Проверка подключения</CardTitle>
            <CardDescription>
              После настройки расширения проверьте статус подключения
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate("/app/marketplaces")}
              className="w-full"
              size="lg"
            >
              Перейти к списку магазинов
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ConnectOzonPairing;
