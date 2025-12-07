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
import { Search, Edit, DollarSign, Package, Truck, Tag, Copy, Download, Upload, X, RefreshCw, CheckSquare } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";

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

type MissingFieldFilter = "purchase_price" | "packaging" | "supplier" | "category" | null;

const ProductSettings = () => {
  const { toast } = useToast();
  
  const [articleSearch, setArticleSearch] = useState("");
  const [nameSearch, setNameSearch] = useState("");
  const [supplierSearch, setSupplierSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [missingFieldFilter, setMissingFieldFilter] = useState<MissingFieldFilter>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    supplier_id: "",
    category: "",
    purchase_price: "",
    small_box_quantity: "",
    large_box_quantity: "",
  });

  // Массовый выбор товаров
  const [selectedOfferIds, setSelectedOfferIds] = useState<Set<string>>(new Set());
  const [isBulkAssignModalOpen, setIsBulkAssignModalOpen] = useState(false);
  const [bulkSupplierId, setBulkSupplierId] = useState<string>("");
  
  // Импорт прогресс
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

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

  const { data: products, isLoading, refetch: refetchProducts } = useQuery({
    queryKey: ["products-settings", marketplace?.id],
    queryFn: async () => {
      if (!marketplace?.id) return [];
      // Supabase по умолчанию возвращает только 1000 строк, поэтому используем пагинацию
      const allProducts: Product[] = [];
      let from = 0;
      const pageSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from("products")
          .select("id, external_id, offer_id, name, category, price, image_url")
          .eq("marketplace_id", marketplace.id)
          .order("name")
          .range(from, from + pageSize - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allProducts.push(...data);
        
        // Если получили меньше записей чем запрашивали - это последняя страница
        if (data.length < pageSize) break;
        from += pageSize;
      }
      
      console.log(`[ProductSettings] Loaded ${allProducts.length} products`);
      return allProducts;
    },
    enabled: !!marketplace?.id,
    staleTime: 0, // Всегда перезагружать при монтировании
  });

  const { data: businessData, refetch: refetchBusinessData } = useQuery({
    queryKey: ["product-business-data-settings", marketplace?.id],
    queryFn: async () => {
      if (!marketplace?.id) return [];
      // Supabase по умолчанию возвращает только 1000 строк, поэтому используем пагинацию
      const allData: ProductBusinessData[] = [];
      let from = 0;
      const pageSize = 1000;
      
      while (true) {
        const { data, error } = await supabase
          .from("product_business_data")
          .select("*")
          .eq("marketplace_id", marketplace.id)
          .range(from, from + pageSize - 1);
        
        if (error) throw error;
        if (!data || data.length === 0) break;
        
        allData.push(...data);
        
        // Если получили меньше записей чем запрашивали - это последняя страница
        if (data.length < pageSize) break;
        from += pageSize;
      }
      
      console.log(`[ProductSettings] Loaded ${allData.length} business data records`);
      return allData;
    },
    enabled: !!marketplace?.id,
    staleTime: 0, // Всегда перезагружать при монтировании
  });

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

  const businessDataMap = useMemo(() => {
    return new Map(businessData?.map((bd) => [bd.offer_id, bd]) || []);
  }, [businessData]);

  const supplierMap = useMemo(() => {
    return new Map(suppliers?.map((s) => [s.id, s.name]) || []);
  }, [suppliers]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Скопировано", description: `Артикул ${text} скопирован` });
  };

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

  const handleSave = async () => {
    if (!selectedProduct || !marketplace) return;
    try {
      const { error } = await supabase.from("product_business_data").upsert({
        marketplace_id: marketplace.id,
        offer_id: selectedProduct.offer_id,
        supplier_id: formData.supplier_id || null,
        category: formData.category || null,
        purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
        small_box_quantity: formData.small_box_quantity ? parseInt(formData.small_box_quantity) : null,
        large_box_quantity: formData.large_box_quantity ? parseInt(formData.large_box_quantity) : null,
      }, { onConflict: "marketplace_id,offer_id" });
      if (error) throw error;
      toast({ title: "Сохранено", description: "Данные товара обновлены" });
      refetchBusinessData();
      setIsEditModalOpen(false);
    } catch (error) {
      console.error("Error saving:", error);
      toast({ title: "Ошибка", description: "Не удалось сохранить", variant: "destructive" });
    }
  };

  // Массовое назначение поставщика
  const handleBulkAssignSupplier = async () => {
    if (!marketplace || !bulkSupplierId || selectedOfferIds.size === 0) return;
    try {
      let successCount = 0;
      for (const offerId of selectedOfferIds) {
        const { error } = await supabase.from("product_business_data").upsert({
          marketplace_id: marketplace.id,
          offer_id: offerId,
          supplier_id: bulkSupplierId,
        }, { onConflict: "marketplace_id,offer_id" });
        if (!error) successCount++;
      }
      toast({ 
        title: "Поставщик назначен", 
        description: `Обновлено ${successCount} из ${selectedOfferIds.size} товаров` 
      });
      setSelectedOfferIds(new Set());
      setBulkSupplierId("");
      setIsBulkAssignModalOpen(false);
      refetchBusinessData();
    } catch (error) {
      console.error("Bulk assign error:", error);
      toast({ title: "Ошибка", description: "Не удалось назначить поставщика", variant: "destructive" });
    }
  };

  const toggleSelectProduct = (offerId: string) => {
    setSelectedOfferIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(offerId)) {
        newSet.delete(offerId);
      } else {
        newSet.add(offerId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (!filteredProducts) return;
    const visibleOfferIds = filteredProducts.slice(0, 50).map(p => p.offer_id);
    const allSelected = visibleOfferIds.every(id => selectedOfferIds.has(id));
    if (allSelected) {
      setSelectedOfferIds(new Set());
    } else {
      setSelectedOfferIds(new Set(visibleOfferIds));
    }
  };

  const filteredProducts = useMemo(() => {
    return products?.filter((product) => {
      const bd = businessDataMap.get(product.offer_id);
      const supplierName = bd?.supplier_id ? supplierMap.get(bd.supplier_id) : null;

      if (articleSearch && !product.offer_id.toLowerCase().includes(articleSearch.toLowerCase())) return false;
      if (nameSearch && !product.name.toLowerCase().includes(nameSearch.toLowerCase())) return false;
      if (supplierSearch && (!supplierName || !supplierName.toLowerCase().includes(supplierSearch.toLowerCase()))) return false;
      if (categoryFilter !== "all") {
        const productCategory = bd?.category || product.category;
        if (productCategory !== categoryFilter) return false;
      }
      if (missingFieldFilter) {
        if (missingFieldFilter === "purchase_price" && bd?.purchase_price) return false;
        if (missingFieldFilter === "packaging" && (bd?.small_box_quantity || bd?.large_box_quantity)) return false;
        if (missingFieldFilter === "supplier" && bd?.supplier_id) return false;
        if (missingFieldFilter === "category" && bd?.category) return false;
      }
      return true;
    });
  }, [products, businessDataMap, supplierMap, articleSearch, nameSearch, supplierSearch, categoryFilter, missingFieldFilter]);

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
    XLSX.writeFile(workbook, `товары_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast({ title: "Экспорт завершен", description: `Выгружено ${exportData.length} товаров` });
  };

  const handleImportExcel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !marketplace) return;
    
    setIsImporting(true);
    setImportProgress(0);
    
    // Даём React время отрисовать начальное состояние
    await new Promise(resolve => setTimeout(resolve, 50));
    
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Array<Record<string, unknown>>;
      if (!jsonData?.length) {
        toast({ title: "Ошибка", description: "Файл пуст", variant: "destructive" });
        event.target.value = "";
        setIsImporting(false);
        return;
      }
      const supplierNameToId = new Map<string, string>();
      suppliers?.forEach((s) => supplierNameToId.set(s.name.toLowerCase(), s.id));
      let successCount = 0;
      const batchSize = 10; // Обрабатываем пачками для обновления UI
      
      for (let i = 0; i < jsonData.length; i++) {
        const row = jsonData[i];
        
        const offerId = String(row["Артикул"] || "").trim();
        if (!offerId) continue;
        const supplierName = String(row["Поставщик"] || "").trim().toLowerCase();
        const supplierId = supplierName ? supplierNameToId.get(supplierName) : null;
        const purchasePrice = row["Цена закупки"] ? parseFloat(String(row["Цена закупки"])) : null;
        const smallBox = row["Малая коробка"] ? parseInt(String(row["Малая коробка"])) : null;
        const largeBox = row["Большая коробка"] ? parseInt(String(row["Большая коробка"])) : null;
        const { error } = await supabase.from("product_business_data").upsert({
          marketplace_id: marketplace.id,
          offer_id: offerId,
          supplier_id: supplierId || null,
          category: String(row["Категория"] || "").trim() || null,
          purchase_price: purchasePrice,
          small_box_quantity: smallBox,
          large_box_quantity: largeBox,
        }, { onConflict: "marketplace_id,offer_id" });
        if (!error) successCount++;
        
        // Обновляем прогресс каждые batchSize записей или в конце
        if ((i + 1) % batchSize === 0 || i === jsonData.length - 1) {
          setImportProgress(((i + 1) / jsonData.length) * 100);
          // Даём React время отрисовать обновление
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      await refetchBusinessData();
      toast({ title: "Импорт завершен", description: `Успешно: ${successCount}` });
    } catch (error) {
      console.error("Import error:", error);
      toast({ title: "Ошибка импорта", variant: "destructive" });
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
    event.target.value = "";
  };

  const fieldStats = useMemo(() => {
    if (!products) return { total: 0, purchasePrice: { filled: 0, empty: 0 }, packaging: { filled: 0, empty: 0 }, supplier: { filled: 0, empty: 0 }, category: { filled: 0, empty: 0 } };
    let priceFilled = 0, packFilled = 0, suppFilled = 0, catFilled = 0;
    products.forEach((p) => {
      const bd = businessDataMap.get(p.offer_id);
      if (bd?.purchase_price) priceFilled++;
      if (bd?.small_box_quantity || bd?.large_box_quantity) packFilled++;
      if (bd?.supplier_id) suppFilled++;
      if (bd?.category) catFilled++;
    });
    const total = products.length;
    return {
      total,
      purchasePrice: { filled: priceFilled, empty: total - priceFilled },
      packaging: { filled: packFilled, empty: total - packFilled },
      supplier: { filled: suppFilled, empty: total - suppFilled },
      category: { filled: catFilled, empty: total - catFilled },
    };
  }, [products, businessDataMap]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    products?.forEach((p) => {
      const bd = businessDataMap.get(p.offer_id);
      if (bd?.category) set.add(bd.category);
      else if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [products, businessDataMap]);

  const toggleMissingFilter = (field: MissingFieldFilter) => {
    setMissingFieldFilter((prev) => (prev === field ? null : field));
  };

  const clearFilters = () => {
    setArticleSearch("");
    setNameSearch("");
    setSupplierSearch("");
    setCategoryFilter("all");
    setMissingFieldFilter(null);
  };

  const hasFilters = articleSearch || nameSearch || supplierSearch || categoryFilter !== "all" || missingFieldFilter;

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Настройка товаров</CardTitle>
          <CardDescription>Укажите поставщиков, цены закупки и параметры упаковки</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-between items-center gap-2 mb-4">
            <div className="flex items-center gap-2">
              {selectedOfferIds.size > 0 && (
                <>
                  <span className="text-sm text-muted-foreground">
                    Выбрано: {selectedOfferIds.size}
                  </span>
                  <Button 
                    variant="default" 
                    size="sm"
                    onClick={() => setIsBulkAssignModalOpen(true)}
                  >
                    <Truck className="w-4 h-4 mr-2" />
                    Назначить поставщика
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => setSelectedOfferIds(new Set())}
                  >
                    <X className="w-4 h-4 mr-1" />
                    Снять выбор
                  </Button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { refetchProducts(); refetchBusinessData(); }}>
                <RefreshCw className="w-4 h-4 mr-2" />
                Обновить
              </Button>
              <Button variant="outline" onClick={handleExportExcel}>
                <Download className="w-4 h-4 mr-2" />
                Выгрузить Excel
              </Button>
              <Button variant="outline" onClick={() => document.getElementById("excel-upload")?.click()}>
                <Upload className="w-4 h-4 mr-2" />
                Загрузить Excel
              </Button>
              <input id="excel-upload" type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
            </div>
          </div>
          
          {isImporting && (
            <div className="mb-4 space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Импорт товаров...</span>
                <span>{Math.round(importProgress)}%</span>
              </div>
              <Progress value={importProgress} className="h-2" />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4 mb-6">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Всего товаров</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{fieldStats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Заполнено</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />Цена</span>
                  <span className="text-green-600 font-medium">{fieldStats.purchasePrice.filled}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Package className="w-3 h-3" />Упаковка</span>
                  <span className="text-green-600 font-medium">{fieldStats.packaging.filled}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Truck className="w-3 h-3" />Поставщик</span>
                  <span className="text-green-600 font-medium">{fieldStats.supplier.filled}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Tag className="w-3 h-3" />Категория</span>
                  <span className="text-green-600 font-medium">{fieldStats.category.filled}</span>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Не заполнено</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />Цена</span>
                  <span className="text-red-600 font-medium">{fieldStats.purchasePrice.empty}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Package className="w-3 h-3" />Упаковка</span>
                  <span className="text-red-600 font-medium">{fieldStats.packaging.empty}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Truck className="w-3 h-3" />Поставщик</span>
                  <span className="text-red-600 font-medium">{fieldStats.supplier.empty}</span>
                </div>
                <div className="flex justify-between">
                  <span className="flex items-center gap-1"><Tag className="w-3 h-3" />Категория</span>
                  <span className="text-red-600 font-medium">{fieldStats.category.empty}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {isLoading ? (
            <div className="text-center py-8">Загрузка...</div>
          ) : (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox 
                        checked={filteredProducts && filteredProducts.slice(0, 50).length > 0 && filteredProducts.slice(0, 50).every(p => selectedOfferIds.has(p.offer_id))}
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-14">Фото</TableHead>
                    <TableHead className="w-[130px]">
                      <div className="flex flex-col gap-1">
                        <span>Артикул</span>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                          <Input
                            placeholder="Поиск..."
                            value={articleSearch}
                            onChange={(e) => setArticleSearch(e.target.value)}
                            className="h-7 pl-7 text-xs"
                          />
                        </div>
                      </div>
                    </TableHead>
                    <TableHead>
                      <div className="flex flex-col gap-1">
                        <span>Название</span>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                          <Input
                            placeholder="Поиск..."
                            value={nameSearch}
                            onChange={(e) => setNameSearch(e.target.value)}
                            className="h-7 pl-7 text-xs"
                          />
                        </div>
                      </div>
                    </TableHead>
                    <TableHead className="w-[140px]">
                      <div className="flex flex-col gap-1">
                        <span>Категория</span>
                        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                          <SelectTrigger className="h-7 text-xs">
                            <SelectValue placeholder="Все" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Все</SelectItem>
                            {categories.map((cat) => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TableHead>
                    <TableHead className="w-[140px]">
                      <div className="flex flex-col gap-1">
                        <span>Поставщик</span>
                        <div className="relative">
                          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                          <Input
                            placeholder="Поиск..."
                            value={supplierSearch}
                            onChange={(e) => setSupplierSearch(e.target.value)}
                            className="h-7 pl-7 text-xs"
                          />
                        </div>
                      </div>
                    </TableHead>
                    <TableHead className="w-[130px]">
                      <div className="flex flex-col gap-1">
                        <span>Заполненность</span>
                        <div className="flex gap-0.5">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => toggleMissingFilter("purchase_price")}
                                  className={`p-1 rounded ${missingFieldFilter === "purchase_price" ? "text-red-500 bg-red-100" : "text-muted-foreground hover:bg-muted"}`}
                                >
                                  <DollarSign className="w-3 h-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Без цены закупки</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => toggleMissingFilter("packaging")}
                                  className={`p-1 rounded ${missingFieldFilter === "packaging" ? "text-red-500 bg-red-100" : "text-muted-foreground hover:bg-muted"}`}
                                >
                                  <Package className="w-3 h-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Без упаковки</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => toggleMissingFilter("supplier")}
                                  className={`p-1 rounded ${missingFieldFilter === "supplier" ? "text-red-500 bg-red-100" : "text-muted-foreground hover:bg-muted"}`}
                                >
                                  <Truck className="w-3 h-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Без поставщика</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => toggleMissingFilter("category")}
                                  className={`p-1 rounded ${missingFieldFilter === "category" ? "text-red-500 bg-red-100" : "text-muted-foreground hover:bg-muted"}`}
                                >
                                  <Tag className="w-3 h-3" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Без категории</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    </TableHead>
                    <TableHead className="text-right w-[120px]">
                      {hasFilters && (
                        <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs">
                          <X className="w-3 h-3 mr-1" />
                          Сброс
                        </Button>
                      )}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts?.slice(0, 50).map((product) => {
                    const bd = businessDataMap.get(product.offer_id);
                    const supplierName = bd?.supplier_id ? supplierMap.get(bd.supplier_id) : null;
                    return (
                      <TableRow key={product.id} className={selectedOfferIds.has(product.offer_id) ? "bg-muted/50" : ""}>
                        <TableCell>
                          <Checkbox 
                            checked={selectedOfferIds.has(product.offer_id)}
                            onCheckedChange={() => toggleSelectProduct(product.offer_id)}
                          />
                        </TableCell>
                        <TableCell>
                          {product.image_url ? (
                            <img src={product.image_url} alt="" className="w-10 h-10 object-cover rounded" />
                          ) : (
                            <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                              <Package className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          <div className="flex items-center gap-1">
                            <span className="truncate max-w-[90px]">{product.offer_id}</span>
                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(product.offer_id)}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <span className="line-clamp-2 text-sm">{product.name}</span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {bd?.category || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-sm">
                          {supplierName || <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1.5">
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <DollarSign className={`w-4 h-4 ${bd?.purchase_price ? "text-green-500" : "text-red-500"}`} />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{bd?.purchase_price ? `${bd.purchase_price} ₽` : "Не указана"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Package className={`w-4 h-4 ${bd?.small_box_quantity || bd?.large_box_quantity ? "text-green-500" : "text-red-500"}`} />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{bd?.small_box_quantity ? `${bd.small_box_quantity} шт` : "Не указана"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Truck className={`w-4 h-4 ${bd?.supplier_id ? "text-green-500" : "text-red-500"}`} />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{supplierName || "Не указан"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger>
                                  <Tag className={`w-4 h-4 ${bd?.category ? "text-green-500" : "text-red-500"}`} />
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>{bd?.category || "Не указана"}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          </div>
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
                  Показано 50 из {filteredProducts.length}. Используйте фильтры.
                </div>
              )}
              {filteredProducts?.length === 0 && (
                <div className="p-8 text-center text-muted-foreground">Товары не найдены.</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Редактировать товар</DialogTitle>
            <DialogDescription>
              {selectedProduct?.name} ({selectedProduct?.offer_id})
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Поставщик</Label>
              <Select value={formData.supplier_id} onValueChange={(v) => setFormData({ ...formData, supplier_id: v })}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Выберите" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Категория</Label>
              <Select 
                value={formData.category} 
                onValueChange={(v) => setFormData({ ...formData, category: v })}
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Выберите категорию" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Цена закупки</Label>
              <Input
                type="number"
                step="0.01"
                className="col-span-3"
                value={formData.purchase_price}
                onChange={(e) => setFormData({ ...formData, purchase_price: e.target.value })}
                placeholder="₽"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Малая коробка</Label>
              <Input
                type="number"
                className="col-span-3"
                value={formData.small_box_quantity}
                onChange={(e) => setFormData({ ...formData, small_box_quantity: e.target.value })}
                placeholder="шт"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">Большая коробка</Label>
              <Input
                type="number"
                className="col-span-3"
                value={formData.large_box_quantity}
                onChange={(e) => setFormData({ ...formData, large_box_quantity: e.target.value })}
                placeholder="шт"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Отмена</Button>
            <Button onClick={handleSave}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Модальное окно массового назначения поставщика */}
      <Dialog open={isBulkAssignModalOpen} onOpenChange={setIsBulkAssignModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Назначить поставщика</DialogTitle>
            <DialogDescription>
              Выбрано товаров: {selectedOfferIds.size}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label className="mb-2 block">Поставщик</Label>
            <Select value={bulkSupplierId} onValueChange={setBulkSupplierId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите поставщика" />
              </SelectTrigger>
              <SelectContent>
                {suppliers?.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsBulkAssignModalOpen(false)}>Отмена</Button>
            <Button onClick={handleBulkAssignSupplier} disabled={!bulkSupplierId}>
              Назначить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProductSettings;
