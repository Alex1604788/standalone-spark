import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, RefreshCw, Upload, Download, Plus, Trash2, Brain } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ru } from "date-fns/locale";
import * as XLSX from "xlsx";
import { HelpIcon } from "@/components/HelpIcon";

interface KnowledgeItem {
  id: string;
  product_id: string;
  marketplace_id: string;
  title: string;
  content: string;
  source_type: string;
  created_at: string;
  products: {
    name: string;
    offer_id: string;
  };
}

const ProductKnowledge = () => {
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newKnowledge, setNewKnowledge] = useState({
    offer_id: "",
    title: "",
    content: "",
  });

  const { toast } = useToast();

  useEffect(() => {
    fetchKnowledge();
  }, []);

  const fetchKnowledge = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: marketplaces, error: mpErr } = await supabase
      .from("marketplaces")
      .select("id")
      .eq("user_id", user.id);

    if (mpErr || !marketplaces || marketplaces.length === 0) {
      setKnowledge([]);
      return;
    }

    const marketplaceIds = marketplaces.map((m) => m.id);

    const { data, error } = await supabase
      .from("product_knowledge")
      .select(
        `
        id,
        product_id,
        marketplace_id,
        title,
        content,
        source_type,
        created_at,
        products(name, offer_id)
      `,
      )
      .in("marketplace_id", marketplaceIds)
      .eq("source_type", "manager")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("Error fetching knowledge:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить базу знаний",
        variant: "destructive",
      });
      setKnowledge([]);
      return;
    }

    const withProducts = (data || []).map((k: any) => {
      const prod = Array.isArray(k.products) ? k.products[0] : k.products;
      return {
        ...k,
        products: {
          name: prod?.name || "—",
          offer_id: prod?.offer_id || "—",
        },
      } as KnowledgeItem;
    });

    setKnowledge(withProducts);
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    await fetchKnowledge();
    setIsLoading(false);
    toast({
      title: "Обновлено",
      description: "Данные успешно обновлены",
    });
  };

  const handleExport = () => {
    const excelData = knowledge.map((k) => ({
      "Артикул": k.products.offer_id,
      "Наименование": k.products.name,
      "Заголовок": k.title,
      "Текст": k.content,
      "Дата создания": format(new Date(k.created_at), "dd.MM.yyyy HH:mm", { locale: ru }),
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "База знаний");

    const now = new Date();
    const filename = `product_knowledge_${format(now, "yyyy-MM-dd_HH-mm")}.xlsx`;

    XLSX.writeFile(wb, filename);

    toast({
      title: "Файл создан",
      description: `Выгружено записей: ${knowledge.length}`,
    });
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportProgress(0);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      if (jsonData.length === 0) {
        toast({
          title: "Ошибка",
          description: "Файл пустой",
          variant: "destructive",
        });
        setIsImporting(false);
        return;
      }

      // Проверяем наличие обязательных колонок
      const firstRow = jsonData[0];
      if (!("Артикул" in firstRow) || !("Текст" in firstRow)) {
        toast({
          title: "Ошибка",
          description: "Файл должен содержать колонки: Артикул, Наименование, Текст",
          variant: "destructive",
        });
        setIsImporting(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Пользователь не авторизован");

      // Получаем marketplace
      const { data: marketplaces } = await supabase
        .from("marketplaces")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!marketplaces || marketplaces.length === 0) {
        throw new Error("Маркетплейс не найден");
      }

      const marketplaceId = marketplaces[0].id;

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        setImportProgress(((i + 1) / jsonData.length) * 100);

        try {
          const offerId = row["Артикул"]?.toString().trim();
          const productName = row["Наименование"]?.toString().trim();
          const content = row["Текст"]?.toString().trim();

          if (!offerId || !content) {
            errorCount++;
            continue;
          }

          // Находим продукт по offer_id
          const { data: products } = await supabase
            .from("products")
            .select("id, marketplace_id")
            .eq("offer_id", offerId)
            .eq("marketplace_id", marketplaceId)
            .limit(1);

          if (!products || products.length === 0) {
            console.warn(`Продукт с артикулом ${offerId} не найден`);
            errorCount++;
            continue;
          }

          const product = products[0];

          // Вставляем знание
          const { error } = await supabase.from("product_knowledge").insert({
            product_id: product.id,
            marketplace_id: product.marketplace_id,
            title: `Знания о товаре: ${productName || offerId}`,
            content: content,
            source_type: "manager",
            relevance_score: 1.0,
            created_by: user.id,
            tags: ["импорт", "поставщик"],
          });

          if (error) {
            console.error(`Ошибка при добавлении знания для ${offerId}:`, error);
            errorCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          console.error("Ошибка обработки строки:", err);
          errorCount++;
        }
      }

      await fetchKnowledge();

      toast({
        title: "Импорт завершён",
        description: `Успешно: ${successCount}, Ошибок: ${errorCount}`,
      });

      // Сбрасываем input
      e.target.value = "";
    } catch (error: any) {
      console.error("Error importing file:", error);
      toast({
        title: "Ошибка импорта",
        description: error.message || "Не удалось импортировать файл",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  const handleAddKnowledge = async () => {
    if (!newKnowledge.offer_id.trim() || !newKnowledge.content.trim()) {
      toast({
        title: "Ошибка",
        description: "Заполните артикул и текст знания",
        variant: "destructive",
      });
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Пользователь не авторизован");

      // Получаем marketplace
      const { data: marketplaces } = await supabase
        .from("marketplaces")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!marketplaces || marketplaces.length === 0) {
        throw new Error("Маркетплейс не найден");
      }

      const marketplaceId = marketplaces[0].id;

      // Находим продукт по offer_id
      const { data: products } = await supabase
        .from("products")
        .select("id, name, marketplace_id")
        .eq("offer_id", newKnowledge.offer_id.trim())
        .eq("marketplace_id", marketplaceId)
        .limit(1);

      if (!products || products.length === 0) {
        toast({
          title: "Ошибка",
          description: `Товар с артикулом ${newKnowledge.offer_id} не найден`,
          variant: "destructive",
        });
        return;
      }

      const product = products[0];

      const { error } = await supabase.from("product_knowledge").insert({
        product_id: product.id,
        marketplace_id: product.marketplace_id,
        title: newKnowledge.title.trim() || `Знания о товаре: ${product.name}`,
        content: newKnowledge.content.trim(),
        source_type: "manager",
        relevance_score: 1.0,
        created_by: user.id,
        tags: ["ручной ввод"],
      });

      if (error) throw error;

      toast({
        title: "Знание добавлено",
        description: "Знание успешно добавлено в базу",
      });

      setShowAddDialog(false);
      setNewKnowledge({ offer_id: "", title: "", content: "" });
      await fetchKnowledge();
    } catch (error: any) {
      console.error("Error adding knowledge:", error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось добавить знание",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Вы уверены, что хотите удалить это знание?")) return;

    try {
      const { error } = await supabase.from("product_knowledge").delete().eq("id", id);

      if (error) throw error;

      toast({
        title: "Удалено",
        description: "Знание успешно удалено",
      });

      await fetchKnowledge();
    } catch (error: any) {
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить знание",
        variant: "destructive",
      });
    }
  };

  const filteredKnowledge = knowledge.filter((k) => {
    const q = searchQuery.toLowerCase();
    return (
      k.title.toLowerCase().includes(q) ||
      k.content.toLowerCase().includes(q) ||
      k.products.name.toLowerCase().includes(q) ||
      k.products.offer_id.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">База знаний о товарах</h1>
          <HelpIcon content="База знаний о товарах - это хранилище информации, которая используется ИИ для генерации более точных и релевантных ответов на отзывы.\n\nКак это работает:\n1. Вы добавляете информацию о товарах (характеристики, особенности, инструкции)\n2. При генерации ответа ИИ использует эту информацию\n3. Ответы становятся более точными и информативными\n\nЧто можно добавить:\n• Технические характеристики\n• Инструкции по использованию\n• Частые вопросы и ответы\n• Информация от поставщика\n• Особенности товара\n\nВы можете:\n• Добавлять знания вручную\n• Импортировать из Excel файла\n• Экспортировать базу знаний" />
        </div>
      </div>

      {/* Фильтры и действия */}
      <Card className="p-4 shadow-soft">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Поиск по артикулу, названию, тексту..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Button onClick={handleRefresh} disabled={isLoading} variant="outline">
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Обновить
            </Button>
            <Button onClick={() => setShowAddDialog(true)} variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Добавить
            </Button>
            <Button onClick={handleExport} variant="outline" disabled={knowledge.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Выгрузить
            </Button>
            <Label htmlFor="import-file" className="cursor-pointer">
              <Button variant="outline" asChild>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  Загрузить Excel
                </span>
              </Button>
            </Label>
            <input
              id="import-file"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              className="hidden"
            />
          </div>
        </div>
        {isImporting && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Импорт базы знаний...</span>
              <span>{Math.round(importProgress)}%</span>
            </div>
            <Progress value={importProgress} className="h-2" />
          </div>
        )}
      </Card>

      {/* Таблица знаний */}
      {filteredKnowledge.length === 0 ? (
        <Card className="p-12 text-center shadow-soft">
          <Brain className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
          <h3 className="text-xl font-semibold mb-2">Нет знаний</h3>
          <p className="text-muted-foreground mb-4">
            Добавьте знания о товарах вручную или загрузите из Excel файла
          </p>
          <div className="flex gap-2 justify-center">
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить знание
            </Button>
            <Label htmlFor="import-file-empty" className="cursor-pointer">
              <Button variant="outline" asChild>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  Загрузить Excel
                </span>
              </Button>
            </Label>
            <input
              id="import-file-empty"
              type="file"
              accept=".xlsx,.xls"
              onChange={handleImport}
              className="hidden"
            />
          </div>
        </Card>
      ) : (
        <Card className="shadow-medium">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Артикул</TableHead>
                <TableHead>Товар</TableHead>
                <TableHead>Заголовок</TableHead>
                <TableHead className="max-w-md">Содержимое</TableHead>
                <TableHead>Дата создания</TableHead>
                <TableHead className="w-[100px] text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredKnowledge.map((item) => (
                <TableRow key={item.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-mono text-sm">{item.products.offer_id}</TableCell>
                  <TableCell className="font-medium max-w-[220px]">
                    <div className="truncate">{item.products.name}</div>
                  </TableCell>
                  <TableCell className="max-w-[200px]">
                    <div className="truncate">{item.title}</div>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <p className="text-sm line-clamp-2">{item.content}</p>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {format(new Date(item.created_at), "d MMM yyyy", { locale: ru })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDelete(item.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Диалог добавления знания */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Добавить знание о товаре
            </DialogTitle>
            <DialogDescription>
              Введите артикул товара и информацию для базы знаний
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="offer-id">Артикул товара *</Label>
              <Input
                id="offer-id"
                placeholder="Например: 12345"
                value={newKnowledge.offer_id}
                onChange={(e) => setNewKnowledge({ ...newKnowledge, offer_id: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Заголовок (опционально)</Label>
              <Input
                id="title"
                placeholder="Краткое описание знания"
                value={newKnowledge.title}
                onChange={(e) => setNewKnowledge({ ...newKnowledge, title: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="content">Текст знания *</Label>
              <Textarea
                id="content"
                placeholder="Подробная информация о товаре, которая поможет ИИ отвечать на вопросы..."
                value={newKnowledge.content}
                onChange={(e) => setNewKnowledge({ ...newKnowledge, content: e.target.value })}
                rows={6}
                className="resize-none"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Отмена
            </Button>
            <Button onClick={handleAddKnowledge}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductKnowledge;
