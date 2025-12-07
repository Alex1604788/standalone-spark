import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Search, Plus, Edit, Trash2, Truck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at: string;
}

const Suppliers = () => {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  // Получаем текущий marketplace
  const { data: marketplace } = useQuery({
    queryKey: ["active-marketplace"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Не авторизован");

      const { data, error } = await supabase
        .from("marketplaces")
        .select("id, name")
        .eq("user_id", user.id)
        .limit(1)
        .single();

      if (error) throw error;
      return data;
    },
  });

  // Получаем поставщиков
  const { data: suppliers, isLoading, refetch } = useQuery({
    queryKey: ["suppliers", marketplace?.id],
    queryFn: async () => {
      if (!marketplace?.id) return [];

      const { data, error } = await supabase
        .from("suppliers")
        .select("*")
        .eq("marketplace_id", marketplace.id)
        .order("name");

      if (error) throw error;
      return data as Supplier[];
    },
    enabled: !!marketplace?.id,
  });

  // Открыть модальное окно добавления
  const handleAddClick = () => {
    setFormData({
      name: "",
      contact_person: "",
      phone: "",
      email: "",
      address: "",
      notes: "",
    });
    setIsAddModalOpen(true);
  };

  // Открыть модальное окно редактирования
  const handleEditClick = (supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      name: supplier.name,
      contact_person: supplier.contact_person || "",
      phone: supplier.phone || "",
      email: supplier.email || "",
      address: supplier.address || "",
      notes: supplier.notes || "",
    });
    setIsEditModalOpen(true);
  };

  // Добавить поставщика
  const handleAdd = async () => {
    if (!marketplace || !formData.name.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите название поставщика",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("suppliers")
        .insert({
          marketplace_id: marketplace.id,
          name: formData.name.trim(),
          contact_person: formData.contact_person.trim() || null,
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          address: formData.address.trim() || null,
          notes: formData.notes.trim() || null,
        });

      if (error) throw error;

      toast({
        title: "Поставщик добавлен",
        description: `Поставщик "${formData.name}" успешно добавлен`,
      });

      refetch();
      setIsAddModalOpen(false);
    } catch (error: any) {
      console.error("Error adding supplier:", error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось добавить поставщика",
        variant: "destructive",
      });
    }
  };

  // Обновить поставщика
  const handleUpdate = async () => {
    if (!selectedSupplier || !formData.name.trim()) {
      toast({
        title: "Ошибка",
        description: "Введите название поставщика",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from("suppliers")
        .update({
          name: formData.name.trim(),
          contact_person: formData.contact_person.trim() || null,
          phone: formData.phone.trim() || null,
          email: formData.email.trim() || null,
          address: formData.address.trim() || null,
          notes: formData.notes.trim() || null,
        })
        .eq("id", selectedSupplier.id);

      if (error) throw error;

      toast({
        title: "Данные обновлены",
        description: `Поставщик "${formData.name}" успешно обновлён`,
      });

      refetch();
      setIsEditModalOpen(false);
    } catch (error: any) {
      console.error("Error updating supplier:", error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось обновить поставщика",
        variant: "destructive",
      });
    }
  };

  // Удалить поставщика
  const handleDelete = async (supplier: Supplier) => {
    if (!confirm(`Вы уверены, что хотите удалить поставщика "${supplier.name}"?`)) return;

    try {
      const { error } = await supabase
        .from("suppliers")
        .delete()
        .eq("id", supplier.id);

      if (error) throw error;

      toast({
        title: "Поставщик удалён",
        description: `Поставщик "${supplier.name}" успешно удалён`,
      });

      refetch();
    } catch (error: any) {
      console.error("Error deleting supplier:", error);
      toast({
        title: "Ошибка",
        description: error.message || "Не удалось удалить поставщика",
        variant: "destructive",
      });
    }
  };

  // Фильтрация поставщиков
  const filteredSuppliers = suppliers?.filter((supplier) =>
    supplier.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (supplier.contact_person && supplier.contact_person.toLowerCase().includes(searchQuery.toLowerCase())) ||
    (supplier.phone && supplier.phone.includes(searchQuery))
  );

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Поставщики</CardTitle>
              <CardDescription>
                Управление списком поставщиков для учёта закупок товаров
              </CardDescription>
            </div>
            <Button onClick={handleAddClick}>
              <Plus className="w-4 h-4 mr-2" />
              Добавить поставщика
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Поиск */}
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Поиск по названию, контакту или телефону..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Таблица поставщиков */}
          {isLoading ? (
            <div className="text-center py-8">Загрузка поставщиков...</div>
          ) : filteredSuppliers && filteredSuppliers.length > 0 ? (
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Название</TableHead>
                    <TableHead>Контактное лицо</TableHead>
                    <TableHead>Телефон</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead className="text-right">Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppliers.map((supplier) => (
                    <TableRow key={supplier.id}>
                      <TableCell>
                        <Truck className="w-5 h-5 text-muted-foreground" />
                      </TableCell>
                      <TableCell className="font-medium">{supplier.name}</TableCell>
                      <TableCell>
                        {supplier.contact_person || (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {supplier.phone || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {supplier.email || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditClick(supplier)}
                          >
                            <Edit className="w-4 h-4 mr-1" />
                            Редактировать
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(supplier)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <Card className="p-12 text-center">
              <Truck className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-xl font-semibold mb-2">Нет поставщиков</h3>
              <p className="text-muted-foreground mb-4">
                Добавьте поставщиков, чтобы отслеживать закупки товаров
              </p>
              <Button onClick={handleAddClick}>
                <Plus className="w-4 h-4 mr-2" />
                Добавить первого поставщика
              </Button>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Модальное окно добавления */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Добавить поставщика</DialogTitle>
            <DialogDescription>
              Введите информацию о новом поставщике
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="add-name" className="text-right">
                Название *
              </Label>
              <Input
                id="add-name"
                className="col-span-3"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="ООО Поставщик"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="add-contact" className="text-right">
                Контактное лицо
              </Label>
              <Input
                id="add-contact"
                className="col-span-3"
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                placeholder="Иванов Иван Иванович"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="add-phone" className="text-right">
                Телефон
              </Label>
              <Input
                id="add-phone"
                className="col-span-3"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+7 (999) 123-45-67"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="add-email" className="text-right">
                Email
              </Label>
              <Input
                id="add-email"
                type="email"
                className="col-span-3"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="supplier@example.com"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="add-address" className="text-right">
                Адрес
              </Label>
              <Input
                id="add-address"
                className="col-span-3"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="г. Москва, ул. Примерная, д. 1"
              />
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="add-notes" className="text-right pt-2">
                Примечания
              </Label>
              <Textarea
                id="add-notes"
                className="col-span-3"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Дополнительная информация о поставщике"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleAdd} disabled={!formData.name.trim()}>
              Добавить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Модальное окно редактирования */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Редактировать поставщика</DialogTitle>
            <DialogDescription>
              Обновите информацию о поставщике
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-name" className="text-right">
                Название *
              </Label>
              <Input
                id="edit-name"
                className="col-span-3"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="ООО Поставщик"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-contact" className="text-right">
                Контактное лицо
              </Label>
              <Input
                id="edit-contact"
                className="col-span-3"
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                placeholder="Иванов Иван Иванович"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-phone" className="text-right">
                Телефон
              </Label>
              <Input
                id="edit-phone"
                className="col-span-3"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="+7 (999) 123-45-67"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-email" className="text-right">
                Email
              </Label>
              <Input
                id="edit-email"
                type="email"
                className="col-span-3"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="supplier@example.com"
              />
            </div>

            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="edit-address" className="text-right">
                Адрес
              </Label>
              <Input
                id="edit-address"
                className="col-span-3"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="г. Москва, ул. Примерная, д. 1"
              />
            </div>

            <div className="grid grid-cols-4 items-start gap-4">
              <Label htmlFor="edit-notes" className="text-right pt-2">
                Примечания
              </Label>
              <Textarea
                id="edit-notes"
                className="col-span-3"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Дополнительная информация о поставщике"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Отмена
            </Button>
            <Button onClick={handleUpdate} disabled={!formData.name.trim()}>
              Сохранить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Suppliers;
