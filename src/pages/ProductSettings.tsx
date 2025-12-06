import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { Search, Edit, CheckCircle2, AlertCircle, XCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Product {
  id: string;
  external_id: string;
  name: string;
  category: string | null;
  price: number | null;
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
          name,
          category,
          price
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

  // Индикатор полноты
  const CompletenessIndicator = ({ product }: { product: Product }) => {
    const status = getCompletenessStatus(product);

    if (status === "complete") {
      return (
        <Badge variant="default" className="bg-green-500">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          Заполнено
        </Badge>
      );
    }

    if (status === "partial") {
      return (
        <Badge variant="secondary" className="bg-yellow-500 text-white">
          <AlertCircle className="w-3 h-3 mr-1" />
          Частично
        </Badge>
      );
    }

    return (
      <Badge variant="destructive">
        <XCircle className="w-3 h-3 mr-1" />
        Пусто
      </Badge>
    );
  };

  // Фильтрация товаров
  const filteredProducts = products?.filter((product) => {
    // Поиск по названию или артикулу
    const matchesSearch =
      product.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      product.external_id.toLowerCase().includes(searchQuery.toLowerCase());

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
          </div>

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
                    <TableHead>Артикул</TableHead>
                    <TableHead>Название товара</TableHead>
                    <TableHead>Категория</TableHead>
                    <TableHead>Цена продажи</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProducts?.slice(0, 50).map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-mono text-sm">
                        {product.external_id}
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {product.name}
                      </TableCell>
                      <TableCell>
                        {product.category || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {product.price ? `${product.price.toLocaleString()} ₽` : "—"}
                      </TableCell>
                      <TableCell>
                        <CompletenessIndicator product={product} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleEditClick(product)}>
                          <Edit className="w-4 h-4 mr-1" />
                          Редактировать
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
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
