import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { marketplace_id } = await req.json();

    console.log(`[get-pending-replies] 🔍 Запрос для marketplace ${marketplace_id}`);

    // 🔒 1. Проверяем kill-switch
    const { data: marketplace, error: marketError } = await supabase
      .from("marketplaces")
      .select("kill_switch_enabled")
      .eq("id", marketplace_id)
      .single();

    if (marketError) {
      console.error("[get-pending-replies] ❌ Ошибка получения marketplace:", marketError);
      throw marketError;
    }

    if (marketplace?.kill_switch_enabled) {
      console.log("[get-pending-replies] 🛑 Kill-switch активен");
      return new Response(JSON.stringify({ error: "Kill-switch is active", replies: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    // 🧹 2. ОЧИСТКА: зависшие в 'publishing' больше 5 минут → вернуть в 'scheduled'
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const { data: stuckReplies, error: stuckError } = await supabase
      .from("replies")
      .update({
        status: "scheduled",
        updated_at: new Date().toISOString(),
      })
      .eq("marketplace_id", marketplace_id)
      .eq("status", "publishing")
      .lt("updated_at", fiveMinutesAgo)
      .select("id");

    if (stuckError) {
      console.error("[get-pending-replies] ❌ Ошибка очистки зависших ответов:", stuckError);
    } else if (stuckReplies && stuckReplies.length > 0) {
      console.log(`[get-pending-replies] 🔄 Возвращено ${stuckReplies.length} зависших ответов в scheduled`);
    }

    // 🔍 3. КРИТИЧНО: Получаем ВСЕ активные ответы для дедупликации
    const { data: allActiveReplies, error: activeError } = await supabase
      .from("replies")
      .select("id, review_id, question_id, status")
      .eq("marketplace_id", marketplace_id)
      .is("deleted_at", null)
      .in("status", ["scheduled", "publishing", "published"]);

    if (activeError) {
      console.error("[get-pending-replies] ❌ Ошибка получения активных ответов:", activeError);
      throw activeError;
    }

    // 🧠 4. Создаём карту уже обработанных review_id и question_id
    const processedReviewIds = new Set<string>();
    const processedQuestionIds = new Set<string>();

    if (allActiveReplies) {
      for (const reply of allActiveReplies) {
        if (reply.status === "publishing" || reply.status === "published") {
          if (reply.review_id) processedReviewIds.add(reply.review_id);
          if (reply.question_id) processedQuestionIds.add(reply.question_id);
        }
      }
    }

    console.log(
      `[get-pending-replies] 📊 Уже обработано: ${processedReviewIds.size} отзывов, ${processedQuestionIds.size} вопросов`,
    );

    // 🔍 5. Получаем ТОЛЬКО scheduled ответы
    const { data: scheduledReplies, error: scheduledError } = await supabase
      .from("replies")
      .select("id, content, review_id, question_id, created_at")
      .eq("marketplace_id", marketplace_id)
      .eq("status", "scheduled")
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .limit(20); // Берём с запасом, потом отфильтруем

    if (scheduledError) {
      console.error("[get-pending-replies] ❌ Ошибка получения scheduled replies:", scheduledError);
      throw scheduledError;
    }

    if (!scheduledReplies || scheduledReplies.length === 0) {
      console.log("[get-pending-replies] 📭 Нет scheduled ответов для публикации");
      return new Response(JSON.stringify({ replies: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[get-pending-replies] 📦 Найдено ${scheduledReplies.length} scheduled ответов (до фильтрации)`);

    // 🧠 6. ДЕДУПЛИКАЦИЯ: Фильтруем те, что уже обработаны
    const uniqueReplies = scheduledReplies.filter((reply) => {
      if (reply.review_id && processedReviewIds.has(reply.review_id)) {
        console.warn(`[get-pending-replies] ⚠️ Пропускаем reply ${reply.id} - review ${reply.review_id} уже обработан`);
        return false;
      }
      if (reply.question_id && processedQuestionIds.has(reply.question_id)) {
        console.warn(
          `[get-pending-replies] ⚠️ Пропускаем reply ${reply.id} - question ${reply.question_id} уже обработан`,
        );
        return false;
      }
      return true;
    });

    // 🧠 7. ДЕДУПЛИКАЦИЯ: Убираем дубли внутри текущей выборки
    const finalUniqueMap = new Map<string, (typeof uniqueReplies)[number]>();
    const duplicateIds: string[] = [];

    for (const reply of uniqueReplies) {
      const key = reply.review_id
        ? `review_${reply.review_id}`
        : reply.question_id
          ? `question_${reply.question_id}`
          : `reply_${reply.id}`;

      if (!finalUniqueMap.has(key)) {
        finalUniqueMap.set(key, reply);
      } else {
        duplicateIds.push(reply.id);
      }
    }

    const finalReplies = Array.from(finalUniqueMap.values()).slice(0, 10); // Максимум 10

    if (duplicateIds.length > 0) {
      console.warn(`[get-pending-replies] ⚠️ Найдено ${duplicateIds.length} дубликатов в текущей выборке, помечаем`);
      await supabase
        .from("replies")
        .update({ status: "failed", error_message: "DUPLICATE_IN_BATCH" })
        .in("id", duplicateIds);
    }

    console.log(`[get-pending-replies] ✅ После дедупликации: ${finalReplies.length} уникальных ответов`);

    if (finalReplies.length === 0) {
      return new Response(JSON.stringify({ replies: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 🔒 8. АТОМАРНАЯ БЛОКИРОВКА: Обновляем статус на 'publishing'
    const replyIds = finalReplies.map((r) => r.id);
    const now = new Date().toISOString();

    const { data: lockedReplies, error: lockError } = await supabase
      .from("replies")
      .update({
        status: "publishing",
        updated_at: now,
      })
      .in("id", replyIds)
      .eq("status", "scheduled") // ← КРИТИЧНО: обновляем ТОЛЬКО если статус всё ещё 'scheduled'
      .select("id, content, review_id, question_id");

    if (lockError) {
      console.error("[get-pending-replies] ❌ Ошибка блокировки ответов:", lockError);
      throw lockError;
    }

    if (!lockedReplies || lockedReplies.length === 0) {
      console.warn("[get-pending-replies] ⚠️ Не удалось заблокировать ответы (возможно, уже взяты другим процессом)");
      return new Response(JSON.stringify({ replies: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[get-pending-replies] 🔒 Успешно заблокировано ${lockedReplies.length} ответов`);

    // 📦 9. Получаем external_id для reviews и questions
    const reviewReplyIds = lockedReplies.filter((r) => r.review_id).map((r) => r.review_id);
    const questionReplyIds = lockedReplies.filter((r) => r.question_id).map((r) => r.question_id);

    const reviewsMap = new Map();
    if (reviewReplyIds.length > 0) {
      const { data: reviews, error: reviewsError } = await supabase
        .from("reviews")
        .select("id, external_id")
        .in("id", reviewReplyIds)
        .is("deleted_at", null)
        .eq("marketplace_id", marketplace_id);

      if (reviewsError) {
        console.error("[get-pending-replies] ❌ Ошибка получения reviews:", reviewsError);
      } else if (reviews) {
        reviews.forEach((r: any) => reviewsMap.set(r.id, r));
      }
    }

    const questionsMap = new Map();
    if (questionReplyIds.length > 0) {
      const { data: questions, error: questionsError } = await supabase
        .from("questions")
        .select("id, external_id")
        .in("id", questionReplyIds)
        .is("deleted_at", null)
        .eq("marketplace_id", marketplace_id);

      if (questionsError) {
        console.error("[get-pending-replies] ❌ Ошибка получения questions:", questionsError);
      } else if (questions) {
        questions.forEach((q: any) => questionsMap.set(q.id, q));
      }
    }

    // 📤 10. Формируем финальный массив
    const pendingReplies = [];
    const failedReplyIds: string[] = [];

    for (const reply of lockedReplies) {
      let externalId = null;
      let type = null;

      if (reply.review_id) {
        const review = reviewsMap.get(reply.review_id);
        if (review) {
          externalId = review.external_id;
          type = "review";
        } else {
          console.warn(`[get-pending-replies] ⚠️ Review ${reply.review_id} не найден в базе`);
          failedReplyIds.push(reply.id);
          continue;
        }
      } else if (reply.question_id) {
        const question = questionsMap.get(reply.question_id);
        if (question) {
          externalId = question.external_id;
          type = "question";
        } else {
          console.warn(`[get-pending-replies] ⚠️ Question ${reply.question_id} не найден в базе`);
          failedReplyIds.push(reply.id);
          continue;
        }
      }

      if (!externalId || !type) {
        console.warn(`[get-pending-replies] ⚠️ Не удалось получить external_id для reply ${reply.id}`);
        failedReplyIds.push(reply.id);
        continue;
      }

      pendingReplies.push({
        id: reply.id,
        type: type,
        external_id: externalId,
        text: reply.content,
      });
    }

    // Помечаем проблемные ответы как failed
    if (failedReplyIds.length > 0) {
      await supabase
        .from("replies")
        .update({ status: "failed", error_message: "EXTERNAL_ID_NOT_FOUND" })
        .in("id", failedReplyIds);
    }

    console.log(`[get-pending-replies] ✅ Возвращаем ${pendingReplies.length} ответов для публикации`);

    return new Response(JSON.stringify({ replies: pendingReplies }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[get-pending-replies] ❌ Fatal error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
