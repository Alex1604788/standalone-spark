// src/lib/reviewStatusHelpers.ts
// Централизованная логика определения статусов отзывов и вопросов

import { ReviewWithDetails } from "./reviewHelpers";

export type ReplyStatus = "drafted" | "scheduled" | "publishing" | "published" | "error";

export type ReviewSegment = "unanswered" | "pending" | "archived";

// Используем тип из reviewHelpers вместо собственного
export type ReviewWithReplies = ReviewWithDetails;

/**
 * Определяет к какому сегменту относится отзыв/вопрос
 * ВАЖНО: Эта логика должна соответствовать функции calculate_review_segment в базе данных
 */
export function getReviewSegment(item: ReviewWithDetails): ReviewSegment {
  const replies = item.replies || [];

  // Проверяем наличие опубликованного ответа (безопасное сравнение)
  const hasPublished = replies.some((r) => String(r.status) === "published");

  // АРХИВ: есть опубликованный ответ ИЛИ is_answered = true
  if (hasPublished || item.is_answered) {
    return "archived";
  }

  // Проверяем наличие ответов в очереди (подтверждённых пользователем)
  // ВАЖНО: "drafted" НЕ включаем - черновики остаются в "Не отвечено"
  const hasPending = replies.some(
    (r) => 
      String(r.status) === "scheduled" || 
      String(r.status) === "publishing" || 
      String(r.status) === "failed" ||
      String(r.status) === "retried"
  );

  // ОЖИДАЮТ ПУБЛИКАЦИИ: есть scheduled/publishing/failed/retried, но нет published
  if (hasPending) {
    return "pending";
  }

  // НЕ ОТВЕЧЕНО: нет replies в обработке и нет опубликованных
  return "unanswered";
}

/**
 * Определяет статус для отображения в UI (бейдж)
 */
export function getReviewStatusBadge(item: ReviewWithReplies): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "warning" | "success";
} {
  const replies = item.replies || [];

  // Приоритет 1: Ошибка
  const hasError = replies.some((r) => String(r.status) === "failed" || String(r.status) === "retried");
  if (hasError) {
    return { label: "Ошибка", variant: "destructive" };
  }

  // Приоритет 2: Опубликовано
  const hasPublished = replies.some((r) => String(r.status) === "published");
  if (hasPublished || item.is_answered) {
    return { label: "Опубликовано", variant: "success" };
  }

  // Приоритет 3: В очереди
  const hasScheduled = replies.some((r) => String(r.status) === "scheduled" || String(r.status) === "publishing");
  if (hasScheduled) {
    return { label: "В очереди", variant: "warning" };
  }

  // Приоритет 4: Drafted (если используется)
  const hasDrafted = replies.some((r) => String(r.status) === "drafted");
  if (hasDrafted) {
    return { label: "Черновик", variant: "secondary" };
  }

  // По умолчанию: Без ответа
  return { label: "Без ответа", variant: "default" };
}

/**
 * Фильтрует отзывы по сегменту (для запроса к БД)
 */
export function buildSegmentQuery(segment: ReviewSegment) {
  switch (segment) {
    case "unanswered":
      // НЕ ОТВЕЧЕНО: is_answered = false И нет replies в ['scheduled', 'publishing', 'published', 'error']
      // ВАЖНО: фильтрация по replies делается на клиенте после загрузки!
      return {
        is_answered: false,
      };

    case "pending":
      // ОЖИДАЮТ: is_answered = false И есть replies в ['scheduled', 'publishing', 'error']
      // ВАЖНО: точная фильтрация по replies делается на клиенте!
      return {
        is_answered: false,
      };

    case "archived":
      // АРХИВ: is_answered = true ИЛИ есть published reply
      return {
        is_answered: true,
      };

    default:
      return {};
  }
}

/**
 * Фильтрует загруженные отзывы по сегменту (на клиенте)
 * КРИТИЧНО: Эта функция НЕ используется для решений о генерации!
 * Только для отображения в UI!
 */
export function filterReviewsBySegment(reviews: ReviewWithReplies[], segment: ReviewSegment): ReviewWithReplies[] {
  return reviews.filter((review) => getReviewSegment(review) === segment);
}

/**
 * Дополнительный фильтр внутри сегмента "Ожидают публикации"
 */
export type PendingFilter = "all" | "queued" | "error";

export function filterPendingReviews(reviews: ReviewWithReplies[], filter: PendingFilter): ReviewWithReplies[] {
  if (filter === "all") {
    return reviews;
  }

  return reviews.filter((review) => {
    const replies = review.replies || [];

    if (filter === "error") {
      return replies.some((r) => String(r.status) === "failed" || String(r.status) === "retried");
    }

    if (filter === "queued") {
      return (
        replies.some((r) => String(r.status) === "scheduled" || String(r.status) === "publishing") &&
        !replies.some((r) => String(r.status) === "failed" || String(r.status) === "retried")
      );
    }

    return true;
  });
}

/**
 * Подсчёт отзывов по сегментам (для счётчиков в сайдбаре)
 */
export function countReviewsBySegments(reviews: ReviewWithReplies[]): {
  unanswered: number;
  pending: number;
  archived: number;
} {
  const counts = {
    unanswered: 0,
    pending: 0,
    archived: 0,
  };

  reviews.forEach((review) => {
    const segment = getReviewSegment(review);
    counts[segment]++;
  });

  return counts;
}
