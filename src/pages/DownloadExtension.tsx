import { Download, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const EXTENSION_VERSION = "2.0.5";

const DownloadExtension = () => {
  const handleDownload = () => {
    window.open("/chrome-extension/build-extension.html", "_blank");
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Расширение для Chrome</h1>
        <p className="text-muted-foreground">
          Скачайте и установите расширение Автоответ для автоматизации работы с отзывами
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Package className="h-8 w-8 text-primary" />
              <div>
                <CardTitle>Скачать расширение</CardTitle>
                <CardDescription>Версия {EXTENSION_VERSION}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Нажмите кнопку ниже, чтобы открыть страницу сборки и скачать ZIP-архив расширения.
            </p>

            <Button 
              className="w-full sm:w-auto"
              onClick={handleDownload}
            >
              <Download className="mr-2 h-4 w-4" />
              Скачать расширение v{EXTENSION_VERSION}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Инструкция по установке</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="list-decimal list-inside space-y-3 text-sm">
              <li>Скачайте ZIP-архив расширения, используя кнопку выше</li>
              <li>Распакуйте архив в отдельную папку на вашем компьютере</li>
              <li>
                Откройте Chrome и перейдите на страницу{" "}
                <code className="bg-muted px-2 py-1 rounded">chrome://extensions/</code>
              </li>
              <li>Включите режим разработчика (переключатель в правом верхнем углу)</li>
              <li>
                Нажмите кнопку <strong>«Загрузить распакованное расширение»</strong>
              </li>
              <li>Выберите папку с распакованным расширением</li>
              <li>Расширение Автоответ появится в списке установленных расширений</li>
            </ol>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Настройка расширения</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">После установки расширения:</p>
            <ol className="list-decimal list-inside space-y-3 text-sm">
              <li>Нажмите на иконку расширения в панели Chrome</li>
              <li>Введите ваш Email для входа в Ozon Seller</li>
              <li>Введите Seller ID из кабинета Ozon</li>
              <li>
                Скопируйте ID магазина из раздела <strong>«Маркетплейсы»</strong> в Автоответ
              </li>
              <li>
                Нажмите <strong>«Сохранить и подключить»</strong>
              </li>
              <li>Включите автоматическое сканирование</li>
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DownloadExtension;
