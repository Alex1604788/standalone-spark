import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, RefreshCw, MessageSquare, Package2, Loader2, Send, Package, ExternalLink, Paperclip } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatMessage {
  id: string;
  message_id: string;
  sender_type: "buyer" | "seller";
  sender_name: string | null;
  text: string;
  is_read: boolean;
  is_image: boolean;
  image_urls: string[] | null;
  moderate_status: string | null;
  sent_at: string;
}

interface Product {
  name: string;
  image_url?: string;
  offer_id?: string;
}

interface Chat {
  id: string;
  chat_id: string;
  posting_number: string;
  order_number: string | null;
  product_sku: string | null;
  status: "active" | "closed" | "expired";
  unread_count: number;
  last_message_text: string | null;
  last_message_at: string | null;
  last_message_from: "buyer" | "seller" | null;
  expires_at: string | null;
  updated_at: string;
  marketplace_id: string;
  marketplaces?: {
    name: string;
    type: string;
  };
  product?: Product;
}

const Chats = () => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    fetchChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const fetchChats = async () => {
    setIsLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: marketplaces, error: mpErr } = await supabase
        .from("marketplaces")
        .select("id")
        .eq("user_id", user.id);

      if (mpErr || !marketplaces || marketplaces.length === 0) {
        setChats([]);
        return;
      }

      const marketplaceIds = marketplaces.map((m) => m.id);

      let query = supabase
        .from("chats")
        .select(
          `
          id,
          chat_id,
          posting_number,
          order_number,
          product_sku,
          status,
          unread_count,
          last_message_text,
          last_message_at,
          last_message_from,
          expires_at,
          updated_at,
          marketplace_id,
          marketplaces(name, type)
        `,
        )
        .in("marketplace_id", marketplaceIds)
        .order("updated_at", { ascending: false });

      // Filter by status
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching chats:", error);
        toast({
          title: "Ошибка",
          description: "Не удалось загрузить чаты",
          variant: "destructive",
        });
        return;
      }

      // Enrich chats with product information
      const chatsWithProducts = await Promise.all(
        (data || []).map(async (chat) => {
          if (chat.product_sku) {
            const { data: product } = await supabase
              .from("products")
              .select("name, image_url, offer_id")
              .eq("marketplace_id", chat.marketplace_id)
              .eq("offer_id", chat.product_sku)
              .maybeSingle();

            return { ...chat, product: product || undefined };
          }
          return chat;
        })
      );

      setChats(chatsWithProducts);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchChatMessages = async (chatId: string) => {
    setIsLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("sent_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        toast({
          title: "Ошибка",
          description: "Не удалось загрузить сообщения",
          variant: "destructive",
        });
        return;
      }

      setChatMessages(data || []);

      // Mark buyer messages as read
      const unreadBuyerMessages = data?.filter(
        (msg) => msg.sender_type === "buyer" && !msg.is_read
      );

      if (unreadBuyerMessages && unreadBuyerMessages.length > 0) {
        await supabase
          .from("chat_messages")
          .update({ is_read: true })
          .in(
            "id",
            unreadBuyerMessages.map((m) => m.id)
          );
      }
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const openChatDialog = async (chat: Chat) => {
    setSelectedChat(chat);
    setMessageText("");
    setSelectedFile(null);
    await fetchChatMessages(chat.id);
  };

  const closeChatDialog = () => {
    setSelectedChat(null);
    setChatMessages([]);
    setMessageText("");
    setSelectedFile(null);
  };

  const sendMessage = async () => {
    if (!selectedChat || !messageText.trim()) return;

    setIsSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-chat-message", {
        body: {
          chat_id: selectedChat.chat_id,
          text: messageText.trim(),
          marketplace_id: selectedChat.marketplace_id,
        },
      });

      if (error) {
        console.error("Error sending message:", error);
        toast({
          title: "Ошибка",
          description: error.message || "Не удалось отправить сообщение",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Успешно",
        description: "Сообщение отправлено",
      });

      setMessageText("");

      // Reload messages
      await fetchChatMessages(selectedChat.id);
      await fetchChats();
    } finally {
      setIsSending(false);
    }
  };

  const sendFile = async () => {
    if (!selectedChat || !selectedFile) return;

    setIsUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('chat_id', selectedChat.chat_id);
      formData.append('marketplace_id', selectedChat.marketplace_id);
      formData.append('file', selectedFile);

      const { data, error } = await supabase.functions.invoke("send-chat-file", {
        body: formData,
      });

      if (error) {
        console.error("Error sending file:", error);
        toast({
          title: "Ошибка",
          description: error.message || "Не удалось отправить файл",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Успешно",
        description: "Файл отправлен",
      });

      setSelectedFile(null);

      // Reload messages
      await fetchChatMessages(selectedChat.id);
      await fetchChats();
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({
          title: "Ошибка",
          description: "Размер файла не должен превышать 10 МБ",
          variant: "destructive",
        });
        return;
      }
      setSelectedFile(file);
      // Auto-send file immediately after selection
      setTimeout(() => {
        if (file) {
          sendFile();
        }
      }, 100);
    }
  };

  const filteredChats = chats.filter((chat) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      chat.posting_number.toLowerCase().includes(q) ||
      chat.last_message_text?.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge variant="default">Активный</Badge>;
      case "closed":
        return <Badge variant="secondary">Закрыт</Badge>;
      case "expired":
        return <Badge variant="destructive">Истёк</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const isExpiringSoon = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    const now = new Date();
    const expires = new Date(expiresAt);
    const hoursLeft = (expires.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursLeft > 0 && hoursLeft < 24;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Чаты OZON</h1>
          <p className="text-muted-foreground">Общение с покупателями по заказам</p>
        </div>
        <Button onClick={fetchChats} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Обновить
        </Button>
      </div>

      <Card className="p-4">
        <div className="flex gap-4 items-center">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по номеру отправления или тексту..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все статусы</SelectItem>
              <SelectItem value="active">Активные</SelectItem>
              <SelectItem value="closed">Закрытые</SelectItem>
              <SelectItem value="expired">Истёкшие</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center items-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Статус</TableHead>
                <TableHead>Номер отправления</TableHead>
                <TableHead>Последнее сообщение</TableHead>
                <TableHead>От</TableHead>
                <TableHead>Непрочитано</TableHead>
                <TableHead>Истекает</TableHead>
                <TableHead>Обновлён</TableHead>
                <TableHead>Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredChats.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Чаты не найдены</p>
                  </TableCell>
                </TableRow>
              ) : (
                filteredChats.map((chat) => (
                  <TableRow key={chat.id} className={chat.unread_count > 0 ? "bg-blue-50" : ""}>
                    <TableCell>{getStatusBadge(chat.status)}</TableCell>
                    <TableCell className="font-medium">{chat.posting_number}</TableCell>
                    <TableCell className="max-w-xs truncate">
                      {chat.last_message_text || "—"}
                    </TableCell>
                    <TableCell>
                      {chat.last_message_from === "buyer" ? (
                        <Badge variant="outline">Покупатель</Badge>
                      ) : chat.last_message_from === "seller" ? (
                        <Badge variant="secondary">Продавец</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {chat.unread_count > 0 ? (
                        <Badge variant="destructive">{chat.unread_count}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {chat.expires_at ? (
                        <span
                          className={
                            isExpiringSoon(chat.expires_at) ? "text-orange-600 font-semibold" : ""
                          }
                        >
                          {format(new Date(chat.expires_at), "dd.MM HH:mm", { locale: ru })}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(chat.updated_at), "dd.MM.yyyy HH:mm", { locale: ru })}
                    </TableCell>
                    <TableCell>
                      <Button onClick={() => openChatDialog(chat)} variant="ghost" size="sm">
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Открыть
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Chat Dialog */}
      <Dialog open={!!selectedChat} onOpenChange={(open) => !open && closeChatDialog()}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Чат по отправлению {selectedChat?.posting_number}
            </DialogTitle>
            <DialogDescription>
              {selectedChat && selectedChat.marketplaces?.name} · {getStatusBadge(selectedChat?.status || "")}
            </DialogDescription>
          </DialogHeader>

          {/* Order and Product Info */}
          {(selectedChat?.order_number || selectedChat?.product) && (
            <div className="bg-muted/30 border rounded-lg p-3 space-y-2">
              {selectedChat.order_number && (
                <div className="flex items-center gap-2 text-sm">
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Заказ:</span>
                  <a
                    href={`https://seller.ozon.ru/app/postings/${selectedChat.order_number}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    {selectedChat.order_number}
                  </a>
                </div>
              )}
              {selectedChat.product && (
                <div className="flex items-center gap-3">
                  {selectedChat.product.image_url && (
                    <img
                      src={selectedChat.product.image_url}
                      alt={selectedChat.product.name}
                      className="w-12 h-12 rounded object-cover"
                    />
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{selectedChat.product.name}</span>
                    </div>
                    {selectedChat.product.offer_id && (
                      <p className="text-xs text-muted-foreground">Артикул: {selectedChat.product.offer_id}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <ScrollArea className="h-[400px] pr-4">
            {isLoadingMessages ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : chatMessages.length === 0 ? (
              <div className="text-center text-muted-foreground py-12">
                <p>Нет сообщений</p>
              </div>
            ) : (
              <div className="space-y-4">
                {chatMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.sender_type === "seller" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] rounded-lg p-3 ${
                        msg.sender_type === "seller"
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-900"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs opacity-70">
                          {msg.sender_type === "buyer" ? msg.sender_name || "Покупатель" : "Вы"}
                        </span>
                        <span className="text-xs opacity-70">
                          {format(new Date(msg.sent_at), "dd.MM HH:mm", { locale: ru })}
                        </span>
                      </div>
                      {msg.is_image && msg.image_urls && msg.image_urls.length > 0 ? (
                        <div className="space-y-2">
                          {msg.image_urls.map((url, idx) => (
                            <a
                              key={idx}
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block"
                            >
                              <img
                                src={url}
                                alt={`Изображение ${idx + 1}`}
                                className="max-w-full rounded border hover:opacity-90 transition"
                              />
                            </a>
                          ))}
                          {msg.text && <p className="whitespace-pre-wrap mt-2">{msg.text}</p>}
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <DialogFooter className="flex-col gap-4">
            <div className="flex-1 space-y-2">
              <Label htmlFor="message-input">Ваше сообщение</Label>
              <div className="flex gap-2">
                <Textarea
                  id="message-input"
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  placeholder="Введите текст сообщения..."
                  rows={3}
                  disabled={selectedChat?.status !== "active"}
                  className="flex-1"
                />
                <div className="flex flex-col gap-2">
                  <input
                    type="file"
                    id="file-input"
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => document.getElementById('file-input')?.click()}
                    disabled={isUploadingFile || selectedChat?.status !== "active"}
                    title="Прикрепить файл"
                  >
                    {isUploadingFile ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Paperclip className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
              {selectedFile && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Paperclip className="w-4 h-4" />
                  <span>{selectedFile.name}</span>
                  <span className="text-xs">({(selectedFile.size / 1024).toFixed(1)} КБ)</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <Button onClick={closeChatDialog} variant="outline">
                Закрыть
              </Button>
              <Button
                onClick={sendMessage}
                disabled={!messageText.trim() || isSending || selectedChat?.status !== "active"}
              >
                {isSending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                Отправить
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Chats;
