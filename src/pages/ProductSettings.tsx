import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Search, Edit, DollarSign, Package, Truck, Tag, Copy, Download, Upload, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  purchase_price: number | null;
  small_box_quantity: number | null;
  large_box_quantity: number | null;
  is_complete: boolean;
}

interface Supplier {
  id: string;
  name: string;
}

type MissingFieldFilter = 'purchase_price' | 'packaging' | 'supplier' | 'category' | null;

const ProductSettings = () => {
  const { toast } = useToast();
  
  // Фильтры в шапке таблицы
  const [articleSearch, setArticleSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [missingFieldFilter, setMissingFieldFilter] = useState<MissingFieldFilter>(null);

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
    const bd = businessDataMap.get(product.offer_id);

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
          offer_id: selectedProduct.offer_id,
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

  // Фильтрация товаров
  const filteredProducts = useMemo(() => {
    return products?.filter((product) => {
      const bd = businessDataMap.get(product.offer_id);
      const supplierName = bd?.supplier_id ? supplierMap.get(bd.supplier_id) : null;

      // Поиск по артикулу
      if (articleSearch && !product.offer_id.toLowerCase().includes(articleSearch.toLowerCase())) {
        return false;
      }

      // Поиск по названию
      if (nameSearch && !product.name.toLowerCase().includes(nameSearch.toLowerCase())) {
        return false;
      }

      // Поиск по поставщику
      if (supplierSearch && (!supplierName || !supplierName.toLowerCase().includes(supplierSearch.toLowerCase()))) {
        return false;
      }

      // Фильтр по категории
      if (categoryFilter !== "all") {
        const productCategory = bd?.category || product.category;
        if (productCategory !== categoryFilter) {
          return false;
        }
      }

      // Фильтр по незаполненным полям
      if (missingFieldFilter) {
        switch (missingFieldFilter) {
          case 'purchase_price':
            if (bd?.purchase_price) return false;
            break;
          case 'packaging':
            if (bd?.small_box_quantity || bd?.large_box_quantity) return false;
            break;
          case 'supplier':
            if (bd?.supplier_id) return false;
            break;
          case 'category':
            if (bd?.category) return false;
            break;
        }
      }

      return true;
    });
  }, [products, businessDataMap, supplierMap, articleSearch, nameSearch, supplierSearch, categoryFilter, missingFieldFilter]);

  // Выгрузка отфильтрованных товаров в Excel
  const handleExportExcel = () => {
    if (!filteredProducts || !marketplace) return;

    const exportData = filteredProducts.map((product) => {
      const bd = businessDataMap.get(product.offer_id);
      const supplierName = bd?.supplier_id ? supplierMap.get(bd.supplier_id) : "";

      return {
        "Артикул": product.offer_id,
        "Название товара": product.name,
        "Поставщик": supplierName || "",
        "Цена закупки": bd?.purchase_price || "",
        "Категория": bd?.category || "",
        "Малая коробка": bd?.small_box_quantity || "",
        "Большая коробка": bd?.large_box_quantity || "",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Товары");

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

      const supplierNameToId = new Map<string, string>();
      suppliers?.forEach(s => supplierNameToId.set(s.name.toLowerCase(), s.id));

      let successCount = 0;
      let errorCount = 0;

      for (const row of jsonData) {
        try {
          const offerId = row["Артикул"]?.toString().trim();
          if (!offerId) continue;

          const supplierName = row["Поставщик"]?.toString().trim().toLowerCase();
          const supplierId = supplierName ? supplierNameToId.get(supplierName) : null;

          const purchasePrice = row["Цена закупки"] ? parseFloat(row["Цена закупки"].toString()) : null;
          const smallBox = row["Малая коробка"] ? parseInt(row["Малая коробка"].toString()) : null;
          const largeBox = row["Большая коробка"] ? parseInt(row["Большая коробка"].toString()) : null;

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

      await refetchBusinessData();

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

    event.target.value = "";
  };

  // Статистика по заполненности полей
  const fieldStats = useMemo(() => {
    if (!products) return { total: 0, purchasePrice: { filled: 0, empty: 0 }, packaging: { filled: 0, empty: 0 }, supplier: { filled: 0, empty: 0 }, category: { filled: 0, empty: 0 } };

    let purchasePriceFilled = 0;
    let packagingFilled = 0;
    let supplierFilled = 0;
    let categoryFilled = 0;

    products.forEach((product) => {
      const bd = businessDataMap.get(product.offer_id);
      if (bd?.purchase_price) purchasePriceFilled++;
      if (bd?.small_box_quantity || bd?.large_box_quantity) packagingFilled++;
      if (bd?.supplier_id) supplierFilled++;
      if (bd?.category) categoryFilled++;
    });

    const total = products.length;

    return {
      total,
      purchasePrice: { filled: purchasePriceFilled, empty: total - purchasePriceFilled },
      packaging: { filled: packagingFilled, empty: total - packagingFilled },
      supplier: { filled: supplierFilled, empty: total - supplierFilled },
      category: { filled: categoryFilled, empty: total - categoryFilled },
    };
  }, [products, businessDataMap]);

  // Получаем уникальные категории (из business data и products)
  const categories = useMemo(() => {
    const categorySet = new Set<string>();
    products?.forEach((p) => {
      const bd = businessDataMap.get(p.offer_id);
      if (bd?.category) categorySet.add(bd.category);
      else if (p.category) categorySet.add(p.category);
    });
    return Array.from(categorySet).sort();
  }, [products, businessDataMap]);

  // Индикаторы заполненности (4 иконки)
  const CompletenessIndicators = ({ product }: { product: Product }) => {
    const bd = businessDataMap.get(product.offer_id);

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

  // Компонент фильтра в шапке с иконками заполненности
  const HeaderFilterIcon = ({ 
    field, 
    Icon, 
    label 
  }: { 
    field: MissingFieldFilter; 
    Icon: any; 
    label: string;
  }) => {
    const isActive = missingFieldFilter === field;
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setMissingFieldFilter(isActive ? null : field)}
              className={`p-1 rounded transition-colors ${
                isActive 
                  ? 'text-red-500 bg-red-100' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{isActive ? `Убрать фильтр "${label}"` : `Показать без: ${label}`}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  // Статистика карточка
  const StatRow = ({ 
    icon: Icon, 
    label, 
    filled, 
    empty 
  }: { 
    icon: any; 
    label: string; 
    filled: number; 
    empty: number;
  }) => (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-sm text-green-600 font-medium">{filled}</span>
        <span className="text-sm text-red-600 font-medium">{empty}</span>
      </div>
    </div>
  );

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
          {/* Кнопки Excel */}
          <div className="flex justify-end gap-2 mb-4">
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
          </div>

          {/* Статистика */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Всего товаров */}
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Всего товаров</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fieldStats.total}</div>
              </CardContent>
            </Card>

            {/* Заполнено */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>Заполнено</CardDescription>
                  <span className="text-xs text-muted-foreground">кол-во</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <StatRow icon={DollarSign} label="Цена закупки" filled={fieldStats.purchasePrice.filled} empty={0} />
                <StatRow icon={Package} label="Норма упаковки" filled={fieldStats.packaging.filled} empty={0} />
                <StatRow icon={Truck} label="Поставщик" filled={fieldStats.supplier.filled} empty={0} />
                <StatRow icon={Tag} label="Категория" filled={fieldStats.category.filled} empty={0} />
              </CardContent>
            </Card>

            {/* Не заполнено */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>Не заполнено</CardDescription>
                  <span className="text-xs text-muted-foreground">кол-во</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-1">
                <StatRow icon={DollarSign} label="Цена закупки" filled={0} empty={fieldStats.purchasePrice.empty} />
                <StatRow icon={Package} label="Норма упаковки" filled={0} empty={fieldStats.packaging.empty} />
                <StatRow icon={Truck} label="Поставщик" filled={0} empty={fieldStats.supplier.empty} />
                <StatRow icon={Tag} label="Категория" filled={0} empty={fieldStats.category.empty} />
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
                  {/* Первая строка - заголовки */}
                  <TableRow>
                    <TableHead className="w-16">Фото</TableHead>
                    <TableHead className="w-[140px]">Артикул</TableHead>
                    <TableHead>Название товара</TableHead>
                    <TableHead className="w-[150px]">Категория</TableHead>
                    <TableHead className="w-[150px]">Поставщик</TableHead>
                    <TableHead className="w-[140px]">
                      <div className="flex flex-col gap-1">
                        <span>Заполненность</span>
                        <div className="flex gap-1">
                          <HeaderFilterIcon field="purchase_price" Icon={DollarSign} label="Цена закупки" />
                          <HeaderFilterIcon field="packaging" Icon={Package} label="Упаковка" />
                          <HeaderFilterIcon field="supplier" Icon={Truck} label="Поставщик" />
                          <HeaderFilterIcon field="category" Icon={Tag} label="Категория" />
                        </div>
                      </div>
                    </TableHead>
                    <TableHead className="text-right w-[130px]">Действия</TableHead>
                  </TableRow>
                  {/* Вторая строка - фильтры */}
                  <TableRow className="bg-muted/50">
                    <TableHead></TableHead>
                    <TableHead>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className={`h-8 w-full justify-start ${articleSearch ? 'bg-primary/10' : ''}`}>
                            <Search className="w-3.5 h-3.5 mr-1" />
                            {articleSearch || "Поиск"}
                            {articleSearch && (
                              <X 
                                className="w-3 h-3 ml-auto" 
                                onClick={(e) => { e.stopPropagation(); setArticleSearch(""); }}
                              />
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-2" align="start">
                          <Input
                            placeholder="Введите артикул..."
                            value={articleSearch}
                            onChange={(e) => setArticleSearch(e.target.value)}
                            className="h-8"
                            autoFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </TableHead>
                    <TableHead>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className={`h-8 w-full justify-start ${nameSearch ? 'bg-primary/10' : ''}`}>
                            <Search className="w-3.5 h-3.5 mr-1" />
                            {nameSearch ? nameSearch.substring(0, 20) + (nameSearch.length > 20 ? '...' : '') : "Поиск"}
                            {nameSearch && (
                              <X 
                                className="w-3 h-3 ml-auto" 
                                onClick={(e) => { e.stopPropagation(); setNameSearch(""); }}
                              />
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[250px] p-2" align="start">
                          <Input
                            placeholder="Введите название..."
                            value={nameSearch}
                            onChange={(e) => setNameSearch(e.target.value)}
                            className="h-8"
                            autoFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </TableHead>
                    <TableHead>
                      <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Все" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Все категории</SelectItem>
                          {categories.map((cat) => (
                            <SelectItem key={cat} value={cat}>
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableHead>
                    <TableHead>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="sm" className={`h-8 w-full justify-start ${supplierSearch ? 'bg-primary/10' : ''}`}>
                            <Search className="w-3.5 h-3.5 mr-1" />
                            {supplierSearch || "Поиск"}
                            {supplierSearch && (
                              <X 
                                className="w-3 h-3 ml-auto" 
                                onClick={(e) => { e.stopPropagation(); setSupplierSearch(""); }}
                              />
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-[200px] p-2" align="start">
                          <Input
                            placeholder="Введите поставщика..."
                            value={supplierSearch}
                            onChange={(e) => setSupplierSearch(e.target.value)}
                            className="h-8"
                            autoFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </TableHead>
                    <TableHead>
                      {missingFieldFilter && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-8 text-xs text-red-500"
                          onClick={() => setMissingFieldFilter(null)}
                        >
                          <X className="w-3 h-3 mr-1" />
                          Сбросить
                        </Button>
                      )}
                    </TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts?.slice(0, 50).map((product) => {
                    const bd = businessDataMap.get(product.offer_id);
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
                            <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                              <Package className="w-5 h-5 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-[100px]">{product.offer_id}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => copyToClipboard(product.offer_id)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <span className="line-clamp-2">{product.name}</span>
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
              {selectedProduct?.name} (Артикул: {selectedProduct?.offer_id})
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleSave}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductSettings;
