import { format } from "date-fns";
import { ru } from "date-fns/locale";

export interface ReviewWithDetails {
  id: string;
  external_id: string;
  author_name: string;
  text: string | null;
  advantages: string | null;
  disadvantages: string | null;
  review_date: string;
  rating: number;
  is_answered: boolean;
  product_id: string;
  photos: any; // Фото от покупателя
  products: {
    name: string;
    offer_id?: string; // Артикул (offer_id)
    image_url?: string; // Фото товара из products.image_url
    marketplace_id: string;
  };
  replies?: {
    id: string;
    content: string;
    status: string;
    created_at: string;
    tone?: string;
  }[];
}

export const formatDate = (dateString: string) => {
  if (!dateString) return "";
  try {
    return format(new Date(dateString), "dd.MM.yyyy", { locale: ru });
  } catch {
    return dateString;
  }
};

// Логика фото: используем только фото товара из products.image_url
export const getProductImage = (review: ReviewWithDetails) => {
  if (review.products?.image_url) {
    return review.products.image_url;
  }
  return null;
};

export const getProductName = (review: ReviewWithDetails) => {
  return review.products?.name || "Товар без названия";
};

export const getProductArticle = (review: ReviewWithDetails) => {
  return review.products?.offer_id || "—";
};

export const getReplyStatus = (review: ReviewWithDetails) => {
  if (review.is_answered) {
    return { status: "Архив", color: "bg-green-100 text-green-800 border-green-200" };
  }

  const replies = review.replies || [];
  if (replies.length === 0) {
    return { status: "Новый", color: "bg-gray-100 text-gray-800 border-gray-200" };
  }

  // Приоритет статусов: published > failed/retried > publishing > scheduled > drafted
  // Берём ответ с наивысшим приоритетом, а не просто первый в массиве
  const findByStatus = (...statuses: string[]) =>
    replies.find((r) => statuses.includes(r.status));

  const published = findByStatus("published");
  if (published) {
    return { status: "Опубликовано", color: "bg-green-100 text-green-800 border-green-200" };
  }

  const failed = findByStatus("failed", "retried");
  if (failed) {
    return { status: "Ошибка", color: "bg-red-100 text-red-800 border-red-200" };
  }

  const publishing = findByStatus("publishing");
  if (publishing) {
    return { status: "Публикация", color: "bg-blue-100 text-blue-800 border-blue-200 animate-pulse" };
  }

  const scheduled = findByStatus("scheduled");
  if (scheduled) {
    return { status: "В очереди", color: "bg-blue-100 text-blue-800 border-blue-200" };
  }

  const drafted = findByStatus("drafted");
  if (drafted) {
    return { status: "Черновик", color: "bg-yellow-100 text-yellow-800 border-yellow-200" };
  }

  return { status: replies[0].status, color: "bg-gray-100" };
};

export const getReplyText = (review: ReviewWithDetails) => {
  if (review.replies && review.replies.length > 0) {
    return review.replies[0].content;
  }
  return "";
};

export const getReviewTextPreview = (review: ReviewWithDetails) => {
  let text = review.text || "";
  if (review.advantages) text += ` [+ ${review.advantages}]`;
  if (review.disadvantages) text += ` [- ${review.disadvantages}]`;
  return text;
};

export const hasReviewPhotos = (review: ReviewWithDetails) => {
  return Array.isArray(review.photos) && review.photos.length > 0;
};
