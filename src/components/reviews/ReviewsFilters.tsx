import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";

export interface ReviewsFiltersState {
  searchQuery: string;
  ratingFilter: string;
  textFilter: string;
  photosFilter: string;
}

interface ReviewsFiltersProps {
  filters: ReviewsFiltersState;
  onFiltersChange: (filters: Partial<ReviewsFiltersState>) => void;
}

export function ReviewsFilters({ filters, onFiltersChange }: ReviewsFiltersProps) {
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {/* Поиск */}
      <div className="relative flex-1 min-w-[250px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Поиск по товару или автору..."
          value={filters.searchQuery}
          onChange={(e) => onFiltersChange({ searchQuery: e.target.value })}
          className="pl-9"
        />
      </div>

      {/* Фильтр по оценке */}
      <Select
        value={filters.ratingFilter}
        onValueChange={(value) => onFiltersChange({ ratingFilter: value })}
      >
        <SelectTrigger className="w-[150px]">
          <SelectValue placeholder="Оценка" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все оценки</SelectItem>
          <SelectItem value="5">5 звезд</SelectItem>
          <SelectItem value="4">4 звезды</SelectItem>
          <SelectItem value="3">3 звезды</SelectItem>
          <SelectItem value="2">2 звезды</SelectItem>
          <SelectItem value="1">1 звезда</SelectItem>
        </SelectContent>
      </Select>

      {/* Фильтр по тексту */}
      <Select
        value={filters.textFilter}
        onValueChange={(value) => onFiltersChange({ textFilter: value })}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Наличие текста" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все</SelectItem>
          <SelectItem value="with_text">С текстом</SelectItem>
          <SelectItem value="no_text">Без текста</SelectItem>
        </SelectContent>
      </Select>

      {/* Фильтр по фотографиям */}
      <Select
        value={filters.photosFilter}
        onValueChange={(value) => onFiltersChange({ photosFilter: value })}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Фотографии" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Все</SelectItem>
          <SelectItem value="with_photos">С фото</SelectItem>
          <SelectItem value="no_photos">Без фото</SelectItem>
        </SelectContent>
      </Select>

    </div>
  );
}
