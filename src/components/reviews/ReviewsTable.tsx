import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Star, Copy, AlertCircle, Image as ImageIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  ReviewWithDetails,
  getProductImage,
  getProductName,
  getReplyStatus,
  getProductArticle,
  getReplyText,
  getReviewTextPreview,
  formatDate,
  hasReviewPhotos,
} from "@/lib/reviewHelpers";

interface ReviewsTableProps {
  reviews: ReviewWithDetails[];
  onReviewClick: (review: ReviewWithDetails) => void;
  selectedReviews?: string[];
  onSelectReview?: (reviewId: string, selected: boolean) => void;
  onSelectAll?: (selected: boolean) => void;
}

export function ReviewsTable({
  reviews,
  onReviewClick,
  selectedReviews = [],
  onSelectReview,
  onSelectAll,
}: ReviewsTableProps) {
  const { toast } = useToast();

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`w-3.5 h-3.5 ${star <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`}
          />
        ))}
      </div>
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Скопировано", description: text });
  };

  const allSelected = reviews.length > 0 && reviews.every((r) => selectedReviews.includes(r.id));

  return (
    <div className="border rounded-lg bg-white dark:bg-zinc-950 shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          {/* СТРОКА ЗАГОЛОВКОВ */}
          <TableRow className="bg-gray-50 hover:bg-gray-50 border-b">
            {onSelectReview && (
              <TableHead className="w-[40px] pl-4">
                <Checkbox checked={allSelected} onCheckedChange={(checked) => onSelectAll?.(!!checked)} />
              </TableHead>
            )}
            <TableHead className="w-[320px]">Товар</TableHead>
            <TableHead className="w-[140px]">Оценка</TableHead>
            <TableHead className="w-[30%]">Текст отзыва</TableHead>
            <TableHead className="w-[20%]">Ответ</TableHead>
            <TableHead className="w-[140px]">Статус</TableHead>
          </TableRow>

        </TableHeader>

        <TableBody>
          {reviews.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                Нет отзывов, соответствующих фильтрам
              </TableCell>
            </TableRow>
          ) : (
            reviews.map((review) => {
              const productImage = getProductImage(review);
              const productName = getProductName(review);
              const article = getProductArticle(review);
              const replyStatus = getReplyStatus(review);
              const replyText = getReplyText(review);
              const reviewText = getReviewTextPreview(review);
              const isSelected = selectedReviews.includes(review.id);
              const hasPhotos = hasReviewPhotos(review);

              console.log("PRODUCT DEBUG:", review.id, review.products);

              return (
                <TableRow
                  key={review.id}
                  className={`cursor-pointer transition-colors hover:bg-blue-50/50 ${isSelected ? "bg-blue-50/80" : ""}`}
                  onClick={() => onReviewClick(review)}
                >
                  {onSelectReview && (
                    <TableCell className="pl-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={(checked) => onSelectReview(review.id, !!checked)}
                      />
                    </TableCell>
                  )}

                  {/* Товар */}
                  <TableCell className="align-top py-3">
                    <div className="flex gap-3">
                      {/* Картинка */}
                      <div className="w-12 h-12 rounded bg-gray-100 border flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {productImage ? (
                          <img src={productImage} alt="Product" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="w-5 h-5 text-gray-300" />
                        )}
                      </div>

                      {/* Название и Артикул */}
                      <div className="flex flex-col gap-1 min-w-0">
                        <div className="font-medium text-xs leading-snug line-clamp-2" title={productName}>
                          {productName}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {article}
                          </span>
                          {article !== "—" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-4 w-4 shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(article);
                                toast({ title: "Артикул скопирован" });
                              }}
                            >
                              <Copy className="h-2.5 w-2.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </TableCell>

                  {/* Оценка и Дата */}
                  <TableCell className="align-top py-3">
                    <div className="flex flex-col gap-1">
                      {renderStars(review.rating)}
                      <span className="text-[10px] text-gray-400">{formatDate(review.review_date)}</span>
                    </div>
                  </TableCell>

                  {/* Текст отзыва */}
                  <TableCell className="align-top py-3">
                    <div className="space-y-1">
                      {hasPhotos && (
                        <div className="flex items-center gap-1 text-[10px] text-blue-600 font-medium">
                          <ImageIcon className="w-3 h-3" /> Фото клиента
                        </div>
                      )}
                      <div className="text-xs text-gray-700 line-clamp-3 leading-relaxed">
                        {reviewText || <span className="text-gray-400 italic">Без текста</span>}
                      </div>
                    </div>
                  </TableCell>

                  {/* Текст ответа */}
                  <TableCell className="align-top py-3">
                    <div className="text-xs text-gray-500 line-clamp-3 leading-relaxed">{replyText || "—"}</div>
                  </TableCell>

                  {/* Статус */}
                  <TableCell className="align-top py-3">
                    <Badge
                      variant="outline"
                      className={`${replyStatus.color} whitespace-nowrap text-[10px] px-2 py-0.5`}
                    >
                      {replyStatus.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
