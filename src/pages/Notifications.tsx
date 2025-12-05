import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface Notification {
  id: string;
  text: string;
  date: string;
  status: "read" | "unread";
  type: "info" | "success" | "warning";
}

const Notifications = () => {
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      text: "Новый отзыв на товар 'Смартфон XYZ'",
      date: new Date().toISOString(),
      status: "unread",
      type: "info",
    },
    {
      id: "2",
      text: "Ответ успешно опубликован на отзыв #12345",
      date: new Date(Date.now() - 3600000).toISOString(),
      status: "read",
      type: "success",
    },
    {
      id: "3",
      text: "Обнаружен негативный отзыв (рейтинг 2 звезды)",
      date: new Date(Date.now() - 7200000).toISOString(),
      status: "unread",
      type: "warning",
    },
  ]);
  const { toast } = useToast();

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((notif) => (notif.id === id ? { ...notif, status: "read" } : notif))
    );
    toast({
      title: "Отмечено как прочитанное",
    });
  };

  const markAllAsRead = () => {
    setNotifications((prev) =>
      prev.map((notif) => ({ ...notif, status: "read" }))
    );
    toast({
      title: "Все уведомления прочитаны",
    });
  };

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((notif) => notif.id !== id));
    toast({
      title: "Уведомление удалено",
    });
  };

  const unreadCount = notifications.filter((n) => n.status === "unread").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Уведомления</h2>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground">
              У вас {unreadCount} непрочитанных уведомлений
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button onClick={markAllAsRead} variant="outline">
            <Check className="h-4 w-4 mr-2" />
            Отметить всё как прочитанное
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card className="p-12 text-center shadow-soft">
          <Bell className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-semibold mb-2">Нет уведомлений</h3>
          <p className="text-muted-foreground">
            Все уведомления будут отображаться здесь
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`p-4 transition-all duration-300 hover:shadow-medium ${
                notification.status === "unread" ? "border-l-4 border-l-primary bg-primary/5" : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        notification.type === "success"
                          ? "default"
                          : notification.type === "warning"
                          ? "destructive"
                          : "secondary"
                      }
                    >
                      {notification.type === "success"
                        ? "Успех"
                        : notification.type === "warning"
                        ? "Внимание"
                        : "Инфо"}
                    </Badge>
                    {notification.status === "unread" && (
                      <Badge variant="outline">Не прочитано</Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium">{notification.text}</p>
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(notification.date), "d MMMM yyyy, HH:mm", {
                      locale: ru,
                    })}
                  </p>
                </div>
                <div className="flex gap-2">
                  {notification.status === "unread" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => markAsRead(notification.id)}
                      className="hover:bg-primary/10"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteNotification(notification.id)}
                    className="hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default Notifications;
