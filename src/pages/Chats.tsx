import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Search,
  RefreshCw,
  MessageSquare,
  Package2,
  Loader2,
  Send,
  ExternalLink,
  Paperclip,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, isToday } from "date-fns";
import { ru } from "date-fns/locale";
import { cn } from "@/lib/utils";

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
  chat_type: string | null;
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

type ActiveFilter = "new" | "no_my_reply" | "no_client_reply";

const Chats = () => {
  const [chats, setChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [activeFilters, setActiveFilters] = useState<ActiveFilter[]>([]);
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [messageText, setMessageText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploadingFile, setIsUploadingFile] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchChats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages]);

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
          chat_type,
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
        .in("chat_type", ["BUYER_SELLER", "UNSPECIFIED"])
        .order("last_message_at", { ascending: false, nullsFirst: false });

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
          const marketplaceData = Array.isArray(chat.marketplaces)
            ? chat.marketplaces[0]
            : chat.marketplaces;

          if (chat.product_sku) {
            const { data: product } = await supabase
              .from("products")
              .select("name, image_url, offer_id")
              .eq("marketplace_id", chat.marketplace_id)
              .eq("offer_id", chat.product_sku)
              .maybeSingle();

            return { ...chat, marketplaces: marketplaceData, product: product || undefined };
          }
          return { ...chat, marketplaces: marketplaceData };
        }),
      );

      setChats(chatsWithProducts as Chat[]);
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
        (msg) => msg.sender_type === "buyer" && !msg.is_read,
      );

      if (unreadBuyerMessages && unreadBuyerMessages.length > 0) {
        await supabase
          .from("chat_messages")
          .update({ is_read: true })
          .in(
            "id",
            unreadBuyerMessages.map((m) => m.id),
          );
      }
    } finally {
      setIsLoadingMessages(false);
    }
  };

  const openChat = async (chat: Chat) => {
    setSelectedChat(chat);
    setMessageText("");
    setSelectedFile(null);
    await fetchChatMessages(chat.id);
  };

  const sendMessage = async () => {
    if (!selectedChat || !messageText.trim()) return;

    setIsSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-chat-message", {
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

      setMessageText("");
      await fetchChatMessages(selectedChat.id);
      await fetchChats();
    } finally {
      setIsSending(false);
    }
  };

  const sendFile = async (file: File) => {
    if (!selectedChat) return;

    setIsUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("chat_id", selectedChat.chat_id);
      formData.append("marketplace_id", selectedChat.marketplace_id);
      formData.append("file", file);

      const { error } = await supabase.functions.invoke("send-chat-file", {
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

      toast({ title: "Успешно", description: "Файл отправлен" });
      setSelectedFile(null);
      await fetchChatMessages(selectedChat.id);
      await fetchChats();
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "Ошибка",
        description: "Размер файла не должен превышать 10 МБ",
        variant: "destructive",
      });
      return;
    }
    setSelectedFile(file);
    sendFile(file);
  };

  const toggleFilter = (filter: ActiveFilter) => {
    setActiveFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter],
    );
  };

  const isExpiringSoon = (expiresAt: string | null) => {
    if (!expiresAt) return false;
    const now = new Date();
    const expires = new Date(expiresAt);
    const hoursLeft = (expires.getTime() - now.getTime()) / (1000 * 60 * 60);
    return hoursLeft > 0 && hoursLeft < 24;
  };

  const formatMessageTime = (dateStr: string | null) => {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isToday(date)) return format(date, "HH:mm", { locale: ru });
    return format(date, "dd.MM", { locale: ru });
  };

  const filteredChats = chats.filter((chat) => {
    if (activeFilters.includes("new") && chat.unread_count === 0) return false;
    if (activeFilters.includes("no_my_reply") && chat.last_message_from !== "buyer") return false;
    if (activeFilters.includes("no_client_reply") && chat.last_message_from !== "seller")
      return false;

    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      chat.posting_number.toLowerCase().includes(q) ||
      (chat.product?.name || "").toLowerCase().includes(q) ||
      chat.last_message_text?.toLowerCase().includes(q)
    );
  });

  // Buyer name derived from loaded messages
  const buyerName =
    chatMessages.find((m) => m.sender_type === "buyer")?.sender_name || "Покупатель";

  const totalNew = chats.filter((c) => c.unread_count > 0).length;
  const totalNoMyReply = chats.filter((c) => c.last_message_from === "buyer").length;

  const chipClass = (active: boolean) =>
    cn(
      "px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer border",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "bg-background text-muted-foreground border-border hover:bg-muted",
    );

  const statusChipClass = (active: boolean) =>
    cn(
      "px-3 py-1 rounded-full text-sm font-medium transition-colors cursor-pointer",
      active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
    );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Header ── */}
      <div className="px-6 py-4 border-b bg-background flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold">Чаты OZON</h1>
          <p className="text-sm text-muted-foreground">Общение с покупателями по заказам</p>
        </div>
        <Button onClick={fetchChats} variant="outline" size="sm" disabled={isLoading}>
          <RefreshCw className={cn("w-4 h-4 mr-2", isLoading && "animate-spin")} />
          Обновить
        </Button>
      </div>

      {/* ── Filter chips ── */}
      <div className="px-6 py-3 border-b bg-background flex gap-2 flex-wrap items-center flex-shrink-0">
        {/* Status chips */}
        <button
          className={statusChipClass(statusFilter === "active")}
          onClick={() => setStatusFilter("active")}
        >
          Активные
        </button>
        <button
          className={statusChipClass(statusFilter === "all")}
          onClick={() => setStatusFilter("all")}
        >
          Все
        </button>
        <button
          className={statusChipClass(statusFilter === "closed")}
          onClick={() => setStatusFilter("closed")}
        >
          Закрытые
        </button>

        <div className="w-px h-5 bg-border mx-1" />

        {/* Behavior filters */}
        <button
          className={chipClass(activeFilters.includes("new"))}
          onClick={() => toggleFilter("new")}
        >
          Новые
          {totalNew > 0 && (
            <span className="ml-1.5 bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5">
              {totalNew}
            </span>
          )}
        </button>
        <button
          className={chipClass(activeFilters.includes("no_my_reply"))}
          onClick={() => toggleFilter("no_my_reply")}
        >
          Без вашего ответа
          {totalNoMyReply > 0 && !activeFilters.includes("no_my_reply") && (
            <span className="ml-1.5 text-xs text-muted-foreground">({totalNoMyReply})</span>
          )}
        </button>
        <button
          className={chipClass(activeFilters.includes("no_client_reply"))}
          onClick={() => toggleFilter("no_client_reply")}
        >
          Без ответа клиента
        </button>
      </div>

      {/* ── 2-panel layout ── */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        {/* ── Left panel: chat list ── */}
        <div className="w-80 border-r flex flex-col overflow-hidden flex-shrink-0">
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по товару, заказу..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
          </div>

          {/* Chat cards */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex justify-center items-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : filteredChats.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MessageSquare className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">Чаты не найдены</p>
              </div>
            ) : (
              filteredChats.map((chat) => (
                <div
                  key={chat.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-3 cursor-pointer border-b hover:bg-muted/50 transition-colors",
                    selectedChat?.id === chat.id && "bg-blue-50 border-l-2 border-l-primary",
                    chat.unread_count > 0 && selectedChat?.id !== chat.id && "bg-blue-50/40",
                  )}
                  onClick={() => openChat(chat)}
                >
                  {/* Product image */}
                  <div className="w-10 h-10 rounded overflow-hidden flex-shrink-0 bg-muted flex items-center justify-center">
                    {chat.product?.image_url ? (
                      <img
                        src={chat.product.image_url}
                        alt={chat.product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package2 className="w-5 h-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-sm truncate">
                        {chat.product?.name || `Заказ ${chat.posting_number}`}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-muted-foreground">
                          {formatMessageTime(chat.last_message_at)}
                        </span>
                        {chat.unread_count > 0 && (
                          <span className="bg-blue-500 text-white text-xs font-medium rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                            {chat.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {chat.last_message_from === "seller" && (
                        <span className="text-xs text-blue-600 mr-1">Вы:</span>
                      )}
                      {chat.last_message_text || "Нет сообщений"}
                    </p>
                    {isExpiringSoon(chat.expires_at) && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3 text-orange-500" />
                        <span className="text-xs text-orange-500 font-medium">
                          Истекает{" "}
                          {format(new Date(chat.expires_at!), "HH:mm", { locale: ru })}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Right panel: conversation ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {!selectedChat ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
              <MessageSquare className="w-16 h-16 opacity-20" />
              <p className="text-lg font-medium">Выберите чат</p>
              <p className="text-sm">Нажмите на чат слева, чтобы открыть переписку</p>
            </div>
          ) : (
            <>
              {/* Chat header */}
              <div className="px-5 py-3 border-b bg-background flex items-center gap-4 flex-shrink-0">
                {/* Product image */}
                {selectedChat.product?.image_url && (
                  <img
                    src={selectedChat.product.image_url}
                    alt={selectedChat.product.name}
                    className="w-10 h-10 rounded object-cover flex-shrink-0"
                  />
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold truncate">
                      {selectedChat.product?.name || selectedChat.posting_number}
                    </span>
                    {selectedChat.status === "active" ? (
                      <Badge variant="default" className="text-xs">Активный</Badge>
                    ) : selectedChat.status === "closed" ? (
                      <Badge variant="secondary" className="text-xs">Закрыт</Badge>
                    ) : (
                      <Badge variant="destructive" className="text-xs">Истёк</Badge>
                    )}
                    {isExpiringSoon(selectedChat.expires_at) && (
                      <span className="flex items-center gap-1 text-xs text-orange-500 font-medium">
                        <Clock className="w-3 h-3" />
                        до {format(new Date(selectedChat.expires_at!), "HH:mm", { locale: ru })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-sm text-muted-foreground">
                      Покупатель · {selectedChat.posting_number}
                    </span>
                    {selectedChat.product?.offer_id && (
                      <span className="text-xs text-muted-foreground">
                        Арт: {selectedChat.product.offer_id}
                      </span>
                    )}
                    {selectedChat.order_number && (
                      <a
                        href={`https://seller.ozon.ru/app/postings/${selectedChat.order_number}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Заказ {selectedChat.order_number}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {isLoadingMessages ? (
                  <div className="flex justify-center items-center py-12">
                    <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : chatMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <MessageSquare className="w-10 h-10 mb-2 opacity-40" />
                    <p className="text-sm">Нет сообщений</p>
                  </div>
                ) : (
                  <>
                    {chatMessages.map((msg, idx) => {
                      const isSeller = msg.sender_type === "seller";
                      const showDate =
                        idx === 0 ||
                        format(new Date(msg.sent_at), "yyyy-MM-dd") !==
                          format(new Date(chatMessages[idx - 1].sent_at), "yyyy-MM-dd");

                      return (
                        <div key={msg.id}>
                          {showDate && (
                            <div className="flex justify-center my-3">
                              <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
                                {format(new Date(msg.sent_at), "d MMMM", { locale: ru })}
                              </span>
                            </div>
                          )}
                          <div className={cn("flex", isSeller ? "justify-end" : "justify-start")}>
                            <div
                              className={cn(
                                "max-w-[65%] rounded-2xl px-4 py-2.5 shadow-sm",
                                isSeller
                                  ? "bg-primary text-primary-foreground rounded-br-sm"
                                  : "bg-card border rounded-bl-sm",
                              )}
                            >
                              {!isSeller && (
                                <p className="text-xs font-semibold mb-1 opacity-70">
                                  {msg.sender_name || buyerName}
                                </p>
                              )}
                              {msg.is_image && msg.image_urls && msg.image_urls.length > 0 ? (
                                <div className="space-y-2">
                                  {msg.image_urls.map((url, i) => (
                                    <a
                                      key={i}
                                      href={url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      <img
                                        src={url}
                                        alt={`Изображение ${i + 1}`}
                                        className="max-w-full rounded border hover:opacity-90 transition"
                                      />
                                    </a>
                                  ))}
                                  {msg.text && (
                                    <p className="whitespace-pre-wrap text-sm mt-1">{msg.text}</p>
                                  )}
                                </div>
                              ) : (
                                <p className="whitespace-pre-wrap text-sm">{msg.text}</p>
                              )}
                              <p
                                className={cn(
                                  "text-xs mt-1.5",
                                  isSeller ? "text-primary-foreground/60 text-right" : "text-muted-foreground",
                                )}
                              >
                                {format(new Date(msg.sent_at), "HH:mm", { locale: ru })}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Input area */}
              <div className="px-5 py-4 border-t bg-background flex-shrink-0">
                <input
                  type="file"
                  id="chat-file-input"
                  accept="image/*,.pdf,.doc,.docx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <div className="flex gap-3 items-end">
                  <div className="flex-1">
                    <Textarea
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder={
                        selectedChat.status === "active"
                          ? "Введите сообщение... (Enter — отправить, Shift+Enter — новая строка)"
                          : "Чат закрыт или истёк — ответить нельзя"
                      }
                      disabled={selectedChat.status !== "active"}
                      rows={2}
                      className="resize-none text-sm"
                    />
                    {selectedFile && (
                      <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <Paperclip className="w-3 h-3" />
                        {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} КБ)
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 pb-1">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => document.getElementById("chat-file-input")?.click()}
                      disabled={isUploadingFile || selectedChat.status !== "active"}
                      title="Прикрепить файл"
                    >
                      {isUploadingFile ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Paperclip className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      onClick={sendMessage}
                      disabled={!messageText.trim() || isSending || selectedChat.status !== "active"}
                    >
                      {isSending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Chats;
