import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, Edit, CheckCircle2, AlertCircle, XCircle, DollarSign, Package, Truck, Tag, Copy, Download, Upload, Plus, Trash2, PackagePlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Product {
  id: string;
  external_id: string;
  offer_id: string;
  name: string;
  category: string | null;
  price: number | null;
  image_url: string | null;
}

interface ProductBusinessData {
  id: string;
  offer_id: string;
  supplier_id: string | null;
  category: string | null;
  product_type: string | null;
  product_subtype: string | null;
  purchase_price: number | null;
  small_box_quantity: number | null;
  large_box_quantity: number | null;
  is_complete: boolean;
}

interface ProductComposition {
  id: string;
  parent_offer_id: string;
  child_offer_id: string;
  quantity: number;
}

interface Supplier {
  id: string;
  name: string;
}

const ProductSettings = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [completenessFilter, setCompletenessFilter] = useState<string>("all");

  // Edit modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    supplier_id: "",
    category: "",
    purchase_price: "",
    small_box_quantity: "",
    large_box_quantity: "",
  });

  // Composition modal state
  const [isCompositionModalOpen, setIsCompositionModalOpen] = useState(false);
  const [compositionRows, setCompositionRows] = useState<Array<{ child_offer_id: string; quantity: string }>>([
    { child_offer_id: "", quantity: "1" }
  ]);

  // Получаем текущий marketplace
  const { data: marketplace } = useQuery({
    queryKey: ["active-marketplace"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketplaces")
        .select("id, name")
        .eq("is_active", true)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Получаем товары
  const { data: products, isLoading } = useQuery({
    queryKey: ["products", marketplace?.id],
    queryFn: async () => {
      if (!marketplace?.id) return [];

      const { data, error } = await supabase
        .from("products")
        .select(`
          id,
          external_id,
          offer_id,
          name,
          category,
          price,
          image_url
        `)
        .eq("marketplace_id", marketplace.id)
        .order("name");

      if (error) throw error;
      return data as Product[];
    },
    enabled: !!marketplace?.id,
  });

  // Получаем business data для всех товаров
  const { data: businessData, refetch: refetchBusinessData } = useQuery({
    queryKey: ["product-business-data", marketplace?.id],
    queryFn: async () => {
      if (!marketplace?.id) return [];

      const { data, error } = await supabase
        .from("product_business_data")
        .select("*")
        .eq("marketplace_id", marketplace.id);

      if (error) throw error;
      return data as ProductBusinessData[];
    },
    enabled: !!marketplace?.id,
  });

  // Получаем список поставщиков
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers", marketplace?.id],
    queryFn: async () => {
      if (!marketplace?.id) return [];

      const { data, error } = await supabase
        .from("suppliers")
        .select("id, name")
        .eq("marketplace_id", marketplace.id)
        .order("name");

      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!marketplace?.id,
  });

  // Получаем составы товаров (комплектации)
  const { data: compositions, refetch: refetchCompositions } = useQuery({
    queryKey: ["product-compositions", marketplace?.id],
    queryFn: async () => {
      if (!marketplace?.id) return [];

      const { data, error } = await supabase
        .from("product_composition")
        .select("*")
        .eq("marketplace_id", marketplace.id);

      if (error) throw error;
      return data as ProductComposition[];
    },
    enabled: !!marketplace?.id,
  });

  // Создаём карту business data для быстрого доступа
  const businessDataMap = new Map(
    businessData?.map((bd) => [bd.offer_id, bd]) || []
  );

  // Создаём карту поставщиков для быстрого доступа
  const supplierMap = new Map(
    suppliers?.map((s) => [s.id, s.name]) || []
  );

  // Функция копирования в буфер обмена
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Скопировано",
      description: `Артикул ${text} скопирован в буфер обмена`,
    });
  };

  // Открыть модальное окно редактирования
  const handleEditClick = (product: Product) => {
    setSelectedProduct(product);
    const bd = businessDataMap.get(product.external_id);

    setFormData({
      supplier_id: bd?.supplier_id || "",
      category: bd?.category || product.category || "",
      purchase_price: bd?.purchase_price?.toString() || "",
      small_box_quantity: bd?.small_box_quantity?.toString() || "",
      large_box_quantity: bd?.large_box_quantity?.toString() || "",
    });

    setIsEditModalOpen(true);
  };

  // Сохранить изменения
  const handleSave = async () => {
    if (!selectedProduct || !marketplace) return;

    try {
      const { error } = await supabase
        .from("product_business_data")
        .upsert({
          marketplace_id: marketplace.id,
          offer_id: selectedProduct.external_id,
          supplier_id: formData.supplier_id || null,
          category: formData.category || null,
          purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
          small_box_quantity: formData.small_box_quantity ? parseInt(formData.small_box_quantity) : null,
          large_box_quantity: formData.large_box_quantity ? parseInt(formData.large_box_quantity) : null,
        });

      if (error) throw error;

      toast({
        title: "Сохранено",
        description: `Данные товара "${selectedProduct.name}" обновлены`,
      });

      // Обновляем данные
      refetchBusinessData();
      setIsEditModalOpen(false);
    } catch (error) {
      console.error("Error saving product data:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить данные товара",
        variant: "destructive",
      });
    }
  };

  // Открыть модальное окно создания комплекта
  const handleOpenComposition = () => {
    if (!selectedProduct) return;

    // Загружаем существующую комплектацию если есть
    const existingComposition = compositions?.filter(c => c.parent_offer_id === selectedProduct.offer_id) || [];

    if (existingComposition.length > 0) {
      setCompositionRows(existingComposition.map(c => ({
        child_offer_id: c.child_offer_id,
        quantity: c.quantity.toString()
      })));
    } else {
      // Если нет комплектации, создаем дефолтную (товар = сам себе × 1)
      setCompositionRows([{
        child_offer_id: selectedProduct.offer_id,
        quantity: "1"
      }]);
    }

    setIsCompositionModalOpen(true);
  };

  // Добавить строку комплектации
  const handleAddCompositionRow = () => {
    setCompositionRows([...compositionRows, { child_offer_id: "", quantity: "1" }]);
  };

  // Удалить строку комплектации
  const handleRemoveCompositionRow = (index: number) => {
    setCompositionRows(compositionRows.filter((_, i) => i !== index));
  };

  // Сохранить комплектацию
  const handleSaveComposition = async () => {
    if (!selectedProduct || !marketplace) return;

    try {
      // Удаляем старые записи комплектации для этого товара
      await supabase
        .from("product_composition")
        .delete()
        .eq("marketplace_id", marketplace.id)
        .eq("parent_offer_id", selectedProduct.offer_id);

      // Добавляем новые записи
      const validRows = compositionRows.filter(row => row.child_offer_id.trim() !== "");

      if (validRows.length > 0) {
        const { error } = await supabase
          .from("product_composition")
          .insert(
            validRows.map(row => ({
              marketplace_id: marketplace.id,
              parent_offer_id: selectedProduct.offer_id,
              child_offer_id: row.child_offer_id.trim(),
              quantity: parseInt(row.quantity) || 1,
            }))
          );

        if (error) throw error;
      }

      toast({
        title: "Сохранено",
        description: `Комплектация для "${selectedProduct.offer_id}" обновлена`,
      });

      // Обновляем данные
      await refetchCompositions();
      setIsCompositionModalOpen(false);
    } catch (error) {
      console.error("Error saving composition:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить комплектацию",
        variant: "destructive",
      });
    }
  };

  // Выгрузка товаров в Excel
  const handleExportExcel = () => {
    if (!products || !marketplace) return;

    // Подготовка данных для экспорта
    const exportData = products.map((product) => {
      const bd = businessDataMap.get(product.external_id);
      const supplierName = bd?.supplier_id ? supplierMap.get(bd.supplier_id) : "";

      return {
        "Артикул": product.offer_id,
        "Название товара": product.name,
        "Поставщик": supplierName || "",
        "Цена закупки": bd?.purchase_price || "",
        "Категория": bd?.category || "",
        "Малая коробка": bd?.small_box_quantity || "",
        "Большая коробка": bd?.large_box_quantity || "",
        "Вид номенклатуры": bd?.product_type || "",
        "Подвид номенклатуры": bd?.product_subtype || "",
      };
    });

    // Создание Excel файла
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Товары");

    // Скачивание файла
    XLSX.writeFile(workbook, `товары_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: "Экспорт завершен",
      description: `Выгружено ${exportData.length} товаров`,
    });
  };

  // Загрузка данных из Excel
  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !marketplace) return;

    try {
      // Чтение файла
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Array<{
        "Артикул": string;
        "Название товара": string;
        "Поставщик": string;
        "Цена закупки": number | string;
        "Категория": string;
        "Малая коробка": number | string;
        "Большая коробка": number | string;
        "Вид номенклатуры": string;
        "Подвид номенклатуры": string;
      }>;

      if (!jsonData || jsonData.length === 0) {
        toast({
          title: "Ошибка",
          description: "Файл пуст или неверный формат",
          variant: "destructive",
        });
        event.target.value = "";
        return;
      }

      // Создаем карту поставщиков: имя -> id
      const supplierNameToId = new Map<string, string>();
      suppliers?.forEach(s => supplierNameToId.set(s.name.toLowerCase(), s.id));

      let successCount = 0;
      let errorCount = 0;

      // Обрабатываем каждую строку
      for (const row of jsonData) {
        try {
          const offerId = row["Артикул"]?.toString().trim();
          if (!offerId) continue;

          // Находим ID поставщика по имени
          const supplierName = row["Поставщик"]?.toString().trim().toLowerCase();
          const supplierId = supplierName ? supplierNameToId.get(supplierName) : null;

          // Парсим числа
          const purchasePrice = row["Цена закупки"] ? parseFloat(row["Цена закупки"].toString()) : null;
          const smallBox = row["Малая коробка"] ? parseInt(row["Малая коробка"].toString()) : null;
          const largeBox = row["Большая коробка"] ? parseInt(row["Большая коробка"].toString()) : null;

          // Обновляем данные
          const { error } = await supabase
            .from("product_business_data")
            .upsert({
              marketplace_id: marketplace.id,
              offer_id: offerId,
              supplier_id: supplierId || null,
              category: row["Категория"]?.toString().trim() || null,
              purchase_price: purchasePrice,
              small_box_quantity: smallBox,
              large_box_quantity: largeBox,
              product_type: row["Вид номенклатуры"]?.toString().trim() || null,
              product_subtype: row["Подвид номенклатуры"]?.toString().trim() || null,
            });

          if (error) {
            console.error(`Error updating ${offerId}:`, error);
            errorCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          console.error("Row processing error:", err);
          errorCount++;
        }
      }

      // Обновляем данные
      await refetchBusinessData();

      toast({
        title: "Импорт завершен",
        description: `Успешно: ${successCount}, Ошибок: ${errorCount}`,
        variant: errorCount > 0 ? "default" : "default",
      });

    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Ошибка импорта",
        description: "Не удалось загрузить файл. Проверьте формат Excel.",
        variant: "destructive",
      });
    }

    // Сброс input для возможности повторной загрузки того же файла
    event.target.value = "";
  };

  // Выгрузка комплектаций в Excel
  const handleExportCompositions = () => {
    if (!products || !marketplace || !compositions) return;

    // Подготовка данных для экспорта
    const exportData: Array<{ "Артикул": string; "Состав": string; "Количество": number }> = [];

    // Группируем композиции по parent_offer_id
    const compositionsByParent = new Map<string, Array<{ child: string; qty: number }>>();
    compositions.forEach(comp => {
      if (!compositionsByParent.has(comp.parent_offer_id)) {
        compositionsByParent.set(comp.parent_offer_id, []);
      }
      compositionsByParent.get(comp.parent_offer_id)!.push({
        child: comp.child_offer_id,
        qty: comp.quantity
      });
    });

    // Создаем строки для экспорта
    compositionsByParent.forEach((children, parent) => {
      children.forEach(child => {
        exportData.push({
          "Артикул": parent,
          "Состав": child.child,
          "Количество": child.qty
        });
      });
    });

    if (exportData.length === 0) {
      toast({
        title: "Нет данных",
        description: "Комплектации не найдены",
        variant: "default",
      });
      return;
    }

    // Создание Excel файла
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Комплектации");

    // Скачивание файла
    XLSX.writeFile(workbook, `комплектации_${new Date().toISOString().split('T')[0]}.xlsx`);

    toast({
      title: "Экспорт завершен",
      description: `Выгружено ${exportData.length} записей`,
    });
  };

  // Загрузка комплектаций из Excel
  const handleImportCompositions = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !marketplace) return;

    try {
      // Чтение файла
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Array<{
        "Артикул": string;
        "Состав": string;
        "Количество": number | string;
      }>;

      if (!jsonData || jsonData.length === 0) {
        toast({
          title: "Ошибка",
          description: "Файл пуст или неверный формат",
          variant: "destructive",
        });
        event.target.value = "";
        return;
      }

      let successCount = 0;
      let errorCount = 0;

      // Обрабатываем каждую строку
      for (const row of jsonData) {
        try {
          const parentOfferId = row["Артикул"]?.toString().trim();
          const childOfferId = row["Состав"]?.toString().trim();
          const quantity = row["Количество"] ? parseInt(row["Количество"].toString()) : 1;

          if (!parentOfferId || !childOfferId) {
            errorCount++;
            continue;
          }

          // Добавляем комплектацию
          const { error } = await supabase
            .from("product_composition")
            .upsert({
              marketplace_id: marketplace.id,
              parent_offer_id: parentOfferId,
              child_offer_id: childOfferId,
              quantity: quantity,
            });

          if (error) {
            console.error(`Error updating composition ${parentOfferId}:`, error);
            errorCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          console.error("Row processing error:", err);
          errorCount++;
        }
      }

      // Обновляем данные
      await refetchCompositions();

      toast({
        title: "Импорт завершен",
        description: `Успешно: ${successCount}, Ошибок: ${errorCount}`,
      });

    } catch (error) {
      console.error("Import error:", error);
      toast({
        title: "Ошибка импорта",
        description: "Не удалось загрузить файл. Проверьте формат Excel.",
        variant: "destructive",
      });
    }

    // Сброс input
    event.target.value = "";
  };

  // Функция для определения полноты данных
  const getCompletenessStatus = (product: Product): "complete" | "partial" | "empty" => {
    const bd = businessDataMap.get(product.external_id);

    if (!bd) return "empty";

    const hasSupplier = !!bd.supplier_id;
    const hasPrice = !!bd.purchase_price;
    const hasPackaging = !!bd.small_box_quantity || !!bd.large_box_quantity;
    const hasCategory = !!bd.category;

    const filledFields = [hasSupplier, hasPrice, hasPackaging, hasCategory].filter(Boolean).length;

    if (filledFields === 4) return "complete";
    if (filledFields > 0) return "partial";
    return "empty";
  };

  // Индикаторы заполненности (4 иконки)
  const CompletenessIndicators = ({ product }: { product: Product }) => {
    const bd = businessDataMap.get(product.external_id);

    const hasPrice = !!bd?.purchase_price;
    const hasPackaging = !!bd?.small_box_quantity || !!bd?.large_box_quantity;
    const hasSupplier = !!bd?.supplier_id;
    const hasCategory = !!bd?.category;

    const IconIndicator = ({
      Icon,
      filled,
      label,
      value
    }: {
      Icon: any;
      filled: boolean;
      label: string;
      value?: string
    }) => (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger>
            <Icon
              className={`w-4 h-4 ${filled ? 'text-green-500' : 'text-red-500'}`}
            />
          </TooltipTrigger>
          <TooltipContent>
            <p>{filled ? `${label}: ${value}` : `${label} не указан`}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );

    return (
      <div className="flex gap-2">
        <IconIndicator
          Icon={DollarSign}
          filled={hasPrice}
          label="Цена закупки"
          value={bd?.purchase_price ? `${bd.purchase_price} ₽` : undefined}
        />
        <IconIndicator
          Icon={Package}
          filled={hasPackaging}
          label="Упаковка"
          value={bd?.small_box_quantity ? `${bd.small_box_quantity} шт` : undefined}
        />
        <IconIndicator
          Icon={Truck}
          filled={hasSupplier}
          label="Поставщик"
          value={bd?.supplier_id ? supplierMap.get(bd.supplier_id) : undefined}
        />
        <IconIndicator
          Icon={Tag}
          filled={hasCategory}
          label="Категория"
          value={bd?.category || undefined}
        />
      </div>
    );
  };

  // Фильтрация товаров
  const filteredProducts = products?.filter((product) => {
    // Поиск по названию или артикулу
    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.offer_id.toLowerCase().includes(searchQuery.toLowerCase());

    // Фильтр по категории
    const matchesCategory =
      categoryFilter === "all" ||
      product.category === categoryFilter;

    // Фильтр по полноте
    const status = getCompletenessStatus(product);
    const matchesCompleteness =
      completenessFilter === "all" ||
      completenessFilter === status;

    return matchesSearch && matchesCategory && matchesCompleteness;
  });

  // Получаем уникальные категории
  const categories = Array.from(
    new Set(products?.map((p) => p.category).filter(Boolean) || [])
  );

  // Подсчет товаров без комплектации
  const productsWithoutComposition = products?.filter(product => {
    // Проверяем есть ли у товара композиция (где он parent_offer_id)
    const hasComposition = compositions?.some(comp => comp.parent_offer_id === product.offer_id);
    return !hasComposition;
  }).length || 0;

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Настройка товаров</CardTitle>
          <CardDescription>
            Укажите поставщиков, цены закупки и параметры упаковки для расчёта маржинальности
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Фильтры */}
          <div className="flex gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Поиск по названию или артикулу..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Категория" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все категории</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat || ""}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={completenessFilter} onValueChange={setCompletenessFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Полнота данных" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все товары</SelectItem>
                <SelectItem value="empty">Не заполнено</SelectItem>
                <SelectItem value="partial">Частично</SelectItem>
                <SelectItem value="complete">Заполнено</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleExportExcel()}>
                <Download className="w-4 h-4 mr-2" />
                Выгрузить Excel
              </Button>
              <Button variant="outline" onClick={() => document.getElementById('excel-upload')?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Загрузить Excel
              </Button>
              <input
                id="excel-upload"
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportExcel}
              />

              <div className="w-px bg-gray-300 mx-1" />

              <Button variant="outline" onClick={() => handleExportCompositions()}>
                <Download className="w-4 h-4 mr-2" />
                Выгрузить комплектации
              </Button>
              <Button variant="outline" onClick={() => document.getElementById('compositions-upload')?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Загрузить комплектации
              </Button>
              <input
                id="compositions-upload"
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={handleImportCompositions}
              />
            </div>
          </div>

          {/* Индикатор незаполненных составов */}
          {productsWithoutComposition > 0 && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 text-red-700">
                <AlertCircle className="w-5 h-5" />
                <span className="font-semibold">Не заполнен состав: {productsWithoutComposition}</span>
              </div>
            </div>
          )}

          {/* Статистика */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Всего товаров</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{products?.length || 0}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Заполнено</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  {products?.filter((p) => getCompletenessStatus(p) === "complete").length || 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Частично</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-yellow-600">
                  {products?.filter((p) => getCompletenessStatus(p) === "partial").length || 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Не заполнено</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {products?.filter((p) => getCompletenessStatus(p) === "empty").length || 0}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Таблица товаров */}
          {isLoading ? (
            <div className="text-center py-8">Загрузка товаров...</div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Фото</TableHead>
                    <TableHead>Артикул</TableHead>
                    <TableHead>Название товара</TableHead>
                    <TableHead>Категория</TableHead>
                    <TableHead>Поставщик</TableHead>
                    <TableHead>Заполненность</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts?.slice(0, 50).map((product) => {
                    const bd = businessDataMap.get(product.external_id);
                    const supplierName = bd?.supplier_id ? supplierMap.get(bd.supplier_id) : null;

                    return (
                      <TableRow key={product.id}>
                        <TableCell>
                          {product.image_url ? (
                            <img
                              src={product.image_url}
                              alt={product.name}
                              className="w-10 h-10 object-cover rounded"
                            />
                          ) : (
                            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center">
                              <Package className="w-5 h-5 text-gray-400" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          <div className="flex items-center gap-2">
                            <span>{product.offer_id}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => copyToClipboard(product.offer_id)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md truncate">
                          {product.name}
                        </TableCell>
                        <TableCell>
                          {bd?.category || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          {supplierName || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <CompletenessIndicators product={product} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => handleEditClick(product)}>
                            <Edit className="w-4 h-4 mr-1" />
                            Редактировать
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              {filteredProducts && filteredProducts.length > 50 && (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  Показано 50 из {filteredProducts.length} товаров. Используйте фильтры для уточнения поиска.
                </div>
              )}

              {filteredProducts?.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">
                  Товары не найдены. Попробуйте изменить фильтры.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Модальное окно редактирования */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Редактировать товар</DialogTitle>
            <DialogDescription>
              {selectedProduct?.name} (Артикул: {selectedProduct?.external_id})
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Поставщик */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="supplier" className="text-right">
                Поставщик
              </Label>
              <Select
                value={formData.supplier_id}
                onValueChange={(value) => setFormData({ ...formData, supplier_id: value })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Выберите поставщика" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers?.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Категория */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="category" className="text-right">
                Категория
              </Label>
              <Input
                id="category"
                className="col-span-3"
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Укажите категорию товара"
              />
            </div>

            {/* Цена закупки */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="purchase_price" className="text-right">
                Цена закупки
              </Label>
              <Input
                id="purchase_price"
                type="number"
                step="0.01"
                className="col-span-3"
                value={formData.purchase_price}
                onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
                placeholder="Цена закупки в рублях"
              />
            </div>

            {/* Малая коробка */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="small_box" className="text-right">
                Малая коробка (шт)
              </Label>
              <Input
                id="small_box"
                type="number"
                className="col-span-3"
                value={formData.small_box_quantity}
                onChange={(e) => setFormData({ ...formData, small_box_quantity: e.target.value })}
                placeholder="Количество единиц в малой коробке"
              />
            </div>

            {/* Большая коробка */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="large_box" className="text-right">
                Большая коробка (шт)
              </Label>
              <Input
                id="large_box"
                type="number"
                className="col-span-3"
                value={formData.large_box_quantity}
                onChange={(e) => setFormData({ ...formData, large_box_quantity: e.target.value })}
                placeholder="Количество единиц в большой коробке"
              />
            </div>
          </div>

          <DialogFooter className="flex justify-between">
            <Button variant="outline" onClick={handleOpenComposition}>
              <PackagePlus className="w-4 h-4 mr-2" />
              Создать комплект
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
                Отмена
              </Button>
              <Button onClick={handleSave}>
                Сохранить
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Модальное окно комплектации */}
      <Dialog open={isCompositionModalOpen} onOpenChange={setIsCompositionModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Комплектация товара</DialogTitle>
            <DialogDescription>
              {selectedProduct?.name} (Артикул: {selectedProduct?.offer_id})
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <div className="mb-4">
              <p className="text-sm text-muted-foreground mb-2">
                Укажите из каких товаров состоит данный артикул. Для обычных товаров укажите сам товар × 1.
              </p>
            </div>

            <div className="space-y-2">
              {compositionRows.map((row, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <div className="flex-1">
                    <Input
                      placeholder="Артикул составляющего товара"
                      value={row.child_offer_id}
                      onChange={(e) => {
                        const newRows = [...compositionRows];
                        newRows[index].child_offer_id = e.target.value;
                        setCompositionRows(newRows);
                      }}
                    />
                  </div>
                  <div className="w-32">
                    <Input
                      type="number"
                      placeholder="Кол-во"
                      value={row.quantity}
                      onChange={(e) => {
                        const newRows = [...compositionRows];
                        newRows[index].quantity = e.target.value;
                        setCompositionRows(newRows);
                      }}
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveCompositionRow(index)}
                    disabled={compositionRows.length === 1}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={handleAddCompositionRow}
            >
              <Plus className="w-4 h-4 mr-2" />
              Добавить строку
            </Button>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCompositionModalOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSaveComposition}>
              Сохранить комплектацию
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductSettings;
