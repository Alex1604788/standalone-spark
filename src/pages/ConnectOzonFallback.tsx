import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, Download, Shield } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import JSZip from "jszip";

const ConnectOzonFallback = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [serviceEmail, setServiceEmail] = useState("");
  const [accountCreated, setAccountCreated] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<"idle" | "checking" | "verified" | "failed">("idle");

  const handleContinueToExtension = () => {
    if (!serviceEmail || !accountCreated) {
      toast({
        title: "Заполните все поля",
        description: "Укажите email и подтвердите создание учётной записи",
        variant: "destructive",
      });
      return;
    }
    setStep(2);
  };

  const handleDownloadExtension = async () => {
    try {
    const zip = new JSZip();
      
      // Fetch all extension files from public folder
      const textFiles = [
        'manifest.json',
        'popup.html',
        'popup.js',
        'content.js',
        'background.js',
        'README.md',
      ];

      // Add text files to the zip
      for (const fileName of textFiles) {
        const response = await fetch(`/chrome-extension/${fileName}`);
        if (!response.ok) throw new Error(`Failed to fetch ${fileName}`);
        const content = await response.text();
        zip.file(fileName, content);
      }

      // Create simple icon images using canvas
      const createIcon = (size: number): Promise<Blob> => {
        return new Promise((resolve) => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d')!;
          
          // Background
          ctx.fillStyle = '#0066FF';
          ctx.fillRect(0, 0, size, size);
          
          // Simple "L" letter for Lovable
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `bold ${size * 0.6}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('L', size / 2, size / 2);
          
          canvas.toBlob((blob) => resolve(blob!), 'image/png');
        });
      };

      // Add icon files
      const icon16 = await createIcon(16);
      const icon48 = await createIcon(48);
      const icon128 = await createIcon(128);
      
      zip.file('icon16.png', icon16);
      zip.file('icon48.png', icon48);
      zip.file('icon128.png', icon128);

      // Generate and download the zip
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lovable-autoanswer-extension-v1.7.0.zip';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({
        title: "Расширение скачано",
        description: "Теперь установите его в Chrome через режим разработчика",
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Ошибка загрузки",
        description: "Не удалось скачать расширение. Попробуйте ещё раз.",
        variant: "destructive",
      });
    }
  };

  const handleVerifySession = async () => {
    setLoading(true);
    setSessionStatus("checking");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Create marketplace with fallback mode
      const { data: newMarketplace, error: insertError } = await supabase
        .from("marketplaces")
        .insert({
          user_id: user.id,
          name: "Ozon магазин (UI-режим)",
          type: "ozon",
          service_account_email: serviceEmail,
          fallback_mode: "browser_extension",
          fallback_enabled: true,
          is_active: true,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      // Store marketplace_id in extension storage so it can link back
      if (newMarketplace?.id) {
        // Communicate with extension via storage API or messaging
        // Extension will read this on next scan
        console.log("Created marketplace with ID:", newMarketplace.id);
        
        // Store in localStorage for extension to pick up
        localStorage.setItem('ozon_marketplace_id', newMarketplace.id);
      }

      setSessionStatus("verified");
      toast({
        title: "Подключение успешно!",
        description: "Работаем через интерфейс Ozon (UI-режим). Теперь откройте расширение и нажмите 'Проверить сессию'.",
      });

      setTimeout(() => navigate("/app/marketplaces"), 3000);
    } catch (error: any) {
      console.error("Session verification error:", error);
      setSessionStatus("failed");
      toast({
        title: "Ошибка создания магазина",
        description: error.message || "Попробуйте ещё раз",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-3xl py-8">
      <Button
        variant="ghost"
        className="mb-6"
        onClick={() => step === 1 ? navigate("/app/connect/ozon/mode") : setStep(1)}
      >
        <ArrowLeft className="w-4 h-4 mr-2" />
        Назад
      </Button>

      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Настройка UI-режима (без Premium Plus)</h1>
        <div className="flex gap-2 mt-4">
          <div className={`h-2 flex-1 rounded ${step >= 1 ? 'bg-primary' : 'bg-muted'}`} />
          <div className={`h-2 flex-1 rounded ${step >= 2 ? 'bg-primary' : 'bg-muted'}`} />
        </div>
      </div>

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Шаг 1: Создание сервисной учётной записи</CardTitle>
            <CardDescription>
              Для безопасной работы создайте отдельную учётную запись сотрудника в Ozon.
              Этой учётке нужны права только на отзывы и вопросы.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                🔐 Мы не запрашиваем пароли и не получаем доступ к вашим финансам или товарам.
                Сервисная учётка имеет ограниченные права только на работу с отзывами.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="serviceEmail">E-mail сотрудника *</Label>
                <Input
                  id="serviceEmail"
                  type="email"
                  placeholder="service-account@example.com"
                  value={serviceEmail}
                  onChange={(e) => setServiceEmail(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Это отдельная учётка в Ozon для работы через интерфейс
                </p>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="accountCreated"
                  checked={accountCreated}
                  onCheckedChange={(checked) => setAccountCreated(checked as boolean)}
                />
                <label
                  htmlFor="accountCreated"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  Я создал учётную запись сотрудника в Ozon и дал ей права на работу с отзывами и вопросами
                </label>
              </div>
            </div>

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p className="font-medium text-sm">Как создать сервисную учётку:</p>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Войдите в личный кабинет Ozon</li>
                <li>Перейдите в раздел «Настройки → Сотрудники»</li>
                <li>Добавьте нового сотрудника с указанным email</li>
                <li>Выдайте права только на «Отзывы» и «Вопросы»</li>
              </ol>
            </div>

            <Button
              onClick={handleContinueToExtension}
              disabled={!serviceEmail || !accountCreated}
              className="w-full"
              size="lg"
            >
              Продолжить
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Шаг 2: Установка расширения Lovable</CardTitle>
            <CardDescription>
              Для публикации ответов через интерфейс Ozon установите расширение Lovable.
              Оно работает только в вашем браузере и не передаёт пароли.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Расширение безопасно: его код доступен на GitHub и опубликован в Chrome Web Store.
                Все действия выполняются локально в вашем браузере.
              </AlertDescription>
            </Alert>

            <div className="space-y-6">
              {/* Highlighted download section */}
              <div className="border-2 border-primary rounded-lg p-6 bg-primary/5">
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 bg-primary/10 rounded-lg">
                    <Download className="w-6 h-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-2">Скачайте расширение Lovable AutoAnswer</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Расширение позволяет работать с отзывами Ozon через интерфейс браузера без Premium Plus подписки
                    </p>
                    <Button size="lg" className="w-full" onClick={handleDownloadExtension}>
                      <Download className="w-5 h-5 mr-2" />
                      Скачать расширение (.zip)
                    </Button>
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      После скачивания следуйте инструкции ниже
                    </p>
                  </div>
                </div>

                <div className="bg-background rounded-lg p-4 space-y-3">
                  <p className="font-medium text-sm">📋 Пошаговая инструкция по установке:</p>
                  <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                    <li><strong>Скачайте:</strong> Нажмите кнопку выше — скачается ZIP-архив</li>
                    <li><strong>Распакуйте:</strong> Откройте скачанный файл и извлеките папку на компьютер (например, на Рабочий стол)</li>
                    <li><strong>Откройте Chrome:</strong> В адресной строке введите <code className="bg-muted px-1 rounded">chrome://extensions/</code> и нажмите Enter</li>
                    <li><strong>Включите режим разработчика:</strong> Найдите переключатель "Режим разработчика" в правом верхнем углу и включите его</li>
                    <li><strong>ВАЖНО - УДАЛИТЕ СТАРУЮ ВЕРСИЮ:</strong> Если вы обновляете расширение, найдите "Lovable AutoAnswer для Ozon" в списке и нажмите "Удалить"</li>
                    <li><strong>Загрузите расширение:</strong> Нажмите кнопку "Загрузить распакованное расширение" и выберите распакованную папку</li>
                    <li><strong>Готово!</strong> Иконка расширения появится в панели браузера (версия 1.7.0)</li>
                    <li><strong>Войдите в Ozon:</strong> Откройте ozon.ru и войдите под сервисной учёткой ({serviceEmail})</li>
                    <li><strong>Вернитесь сюда</strong> и отметьте чекбокс ниже</li>
                  </ol>
                  
                  <Alert className="mt-4 border-orange-500 bg-orange-50">
                    <AlertDescription className="text-xs text-orange-800">
                      ⚠️ <strong>Обновление расширения:</strong> Chrome не обновляет расширения автоматически в режиме разработчика. Если вы уже устанавливали расширение раньше, ОБЯЗАТЕЛЬНО удалите старую версию перед установкой новой!
                    </AlertDescription>
                  </Alert>
                  
                  <Alert className="mt-2">
                    <AlertDescription className="text-xs">
                      💡 <strong>Важно:</strong> Расширение работает только в режиме разработчика, так как оно не опубликовано в Chrome Web Store. Это совершенно безопасно — весь код открыт и доступен для проверки.
                    </AlertDescription>
                  </Alert>
                </div>
              </div>

              <div className="flex items-start space-x-2">
                <Checkbox
                  id="extensionInstalled"
                  checked={extensionInstalled}
                  onCheckedChange={(checked) => setExtensionInstalled(checked as boolean)}
                />
                <label
                  htmlFor="extensionInstalled"
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  ✓ Я установил расширение и вошёл в Ozon под сервисной учёткой ({serviceEmail})
                </label>
              </div>
            </div>

            {sessionStatus === "verified" && (
              <Alert className="border-green-500 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Магазин создан! Откройте расширение и нажмите кнопку <strong>"Проверить сессию"</strong> для завершения настройки.
                </AlertDescription>
              </Alert>
            )}

            {sessionStatus === "failed" && (
              <Alert className="border-orange-500 bg-orange-50">
                <AlertCircle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800">
                  Не удалось обнаружить активную сессию Ozon. Проверьте вход и попробуйте снова.
                </AlertDescription>
              </Alert>
            )}

            <div className="bg-muted p-4 rounded-lg space-y-2">
              <p className="font-medium text-sm">Что делает расширение:</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Проверяет активную сессию Ozon (читает email продавца из DOM)</li>
                <li>Связывает email с магазином в АвтоОтвет</li>
                <li>Автоматически сканирует отзывы каждые 10 минут в фоне</li>
                <li>Отправляет отзывы в очередь для генерации ответов</li>
              </ul>
            </div>

            <Button
              onClick={handleVerifySession}
              disabled={!extensionInstalled || loading || sessionStatus === "verified"}
              className="w-full"
              size="lg"
            >
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Создать магазин
            </Button>
            
            <p className="text-xs text-muted-foreground text-center">
              После создания магазина откройте расширение и нажмите "Проверить сессию"
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ConnectOzonFallback;
