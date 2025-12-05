import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface FallbackConsentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  marketplaceId: string;
  fallbackMode: "browser_extension" | "headful_bot";
  onConsentAccepted: () => void;
}

export function FallbackConsentDialog({
  open,
  onOpenChange,
  marketplaceId,
  fallbackMode,
  onConsentAccepted,
}: FallbackConsentDialogProps) {
  const [understood1, setUnderstood1] = useState(false);
  const [understood2, setUnderstood2] = useState(false);
  const [understood3, setUnderstood3] = useState(false);
  const [loading, setLoading] = useState(false);

  const consentText = `
Я понимаю и принимаю следующие условия использования Фолбэк-режима (UI-имитация):

1. ЮРИДИЧЕСКАЯ ОТВЕТСТВЕННОСТЬ
   - Я несу полную ответственность за использование сервисной учетной записи
   - Я понимаю риски, связанные с автоматизацией действий от имени сотрудника
   - Маркетплейс может заблокировать учетную запись при обнаружении автоматизации

2. БЕЗОПАСНОСТЬ
   - Я создал сервисную учетную запись с минимальными правами (без доступа к финансам)
   - Я понимаю, что все действия будут логироваться
   - Я могу в любой момент остановить работу через Kill-switch

3. ОГРАНИЧЕНИЯ
   - Rate-limit: не более 1 действия в 5 минут
   - Автоматическая остановка при обнаружении капчи/2FA
   - Ручная проверка для отзывов ≤2★

4. РЕЖИМ: ${fallbackMode === "browser_extension" ? "Browser Extension" : "Headful Bot"}
   ${fallbackMode === "browser_extension" 
     ? "- Расширение работает в вашей сессии браузера (более безопасно)" 
     : "- Bot работает на внешнем сервере с временными токенами"}

Дата согласия: ${new Date().toLocaleString("ru-RU")}
  `.trim();

  const handleAccept = async () => {
    if (!understood1 || !understood2 || !understood3) {
      toast.error("Необходимо подтвердить все пункты");
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Пользователь не авторизован");

      // Log consent
      const { error: consentError } = await supabase
        .from("consent_logs")
        .insert({
          user_id: user.id,
          marketplace_id: marketplaceId,
          consent_type: `fallback_mode_${fallbackMode}`,
          status: "accepted",
          consent_text: consentText,
          accepted_at: new Date().toISOString(),
        });

      if (consentError) throw consentError;

      toast.success("Согласие принято. Фолбэк-режим активирован.");
      onConsentAccepted();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Ошибка: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDecline = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Пользователь не авторизован");

      await supabase
        .from("consent_logs")
        .insert({
          user_id: user.id,
          marketplace_id: marketplaceId,
          consent_type: `fallback_mode_${fallbackMode}`,
          status: "declined",
          consent_text: consentText,
          declined_at: new Date().toISOString(),
        });

      toast.info("Согласие отклонено");
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Ошибка: " + error.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Согласие на использование Фолбэк-режима</DialogTitle>
          <DialogDescription>
            Внимательно прочитайте условия перед активацией
          </DialogDescription>
        </DialogHeader>

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>⚠️ Важное предупреждение</AlertTitle>
          <AlertDescription>
            Фолбэк-режим использует автоматизацию, что может нарушать условия использования маркетплейса.
            Используйте только с полным пониманием рисков.
          </AlertDescription>
        </Alert>

        <div className="space-y-4 py-4">
          <pre className="text-xs bg-muted p-4 rounded-lg whitespace-pre-wrap">
            {consentText}
          </pre>

          <div className="space-y-3">
            <div className="flex items-start space-x-2">
              <Checkbox
                id="consent1"
                checked={understood1}
                onCheckedChange={(checked) => setUnderstood1(checked as boolean)}
              />
              <label htmlFor="consent1" className="text-sm cursor-pointer">
                Я понимаю юридические риски и несу полную ответственность
              </label>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="consent2"
                checked={understood2}
                onCheckedChange={(checked) => setUnderstood2(checked as boolean)}
              />
              <label htmlFor="consent2" className="text-sm cursor-pointer">
                Я создал сервисную учетную запись с минимальными правами
              </label>
            </div>

            <div className="flex items-start space-x-2">
              <Checkbox
                id="consent3"
                checked={understood3}
                onCheckedChange={(checked) => setUnderstood3(checked as boolean)}
              />
              <label htmlFor="consent3" className="text-sm cursor-pointer">
                Я понимаю ограничения (rate-limit, остановка при капче, ручная проверка низких оценок)
              </label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleDecline} disabled={loading}>
            Отклонить
          </Button>
          <Button
            onClick={handleAccept}
            disabled={!understood1 || !understood2 || !understood3 || loading}
          >
            {loading ? "Сохранение..." : "Принимаю условия"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
