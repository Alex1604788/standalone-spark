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

    const { reply_id, success, error_message } = await req.json();

    console.log(`[mark-reply-published] 📥 Запрос: reply_id=${reply_id}, success=${success}`);

    // 🔒 ЗАЩИТА: Проверяем, не обрабатывали ли уже этот reply_id недавно
    const LOCK_KEY = `lock:${reply_id}`;
    const LOCK_DURATION = 60; // 60 секунд

    const { data: lockCheck } = await supabase
      .from("_locks")
      .select("created_at")
      .eq("key", LOCK_KEY)
      .gte("created_at", new Date(Date.now() - LOCK_DURATION * 1000).toISOString())
      .maybeSingle();

    if (lockCheck) {
      console.warn(`[mark-reply-published] ⚠️ Reply ${reply_id} уже обрабатывается (блокировка активна)`);
      return new Response(JSON.stringify({ success: true, message: "Already processing" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ставим блокировку
    await supabase.from("_locks").insert({ key: LOCK_KEY });

    if (success) {
      // 🔍 1. Проверяем, что reply существует и не в финальном статусе
      const { data: reply, error: fetchError } = await supabase
        .from("replies")
        .select("id, review_id, question_id, status")
        .eq("id", reply_id)
        .single();

      if (fetchError || !reply) {
        console.error(`[mark-reply-published] Reply ${reply_id} not found:`, fetchError);
        return new Response(JSON.stringify({ error: `Reply ${reply_id} not found` }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 404,
        });
      }

      // 🔒 2. Проверяем, что reply ещё не был опубликован (защита от дублей)
      if (reply.status === "published") {
        console.warn(`[mark-reply-published] Reply ${reply_id} already published. Skipping.`);
        return new Response(JSON.stringify({ success: true, message: "Already published" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // ✅ 3. Обновляем статус на published
      const { error: updateError } = await supabase
        .from("replies")
        .update({
          status: "published",
          published_at: new Date().toISOString(),
        })
        .eq("id", reply_id)
        .eq("status", "publishing"); // ← ВАЖНО: обновляем только если статус publishing

      if (updateError) {
        console.error(`[mark-reply-published] Failed to update reply ${reply_id}:`, updateError);
        return new Response(JSON.stringify({ error: updateError.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }

      // ✅ 4. Помечаем review/question как отвечено
      if (reply.review_id) {
        const { error: reviewError } = await supabase
          .from("reviews")
          .update({ is_answered: true })
          .eq("id", reply.review_id);

        if (reviewError) {
          console.error(`[mark-reply-published] Failed to mark review ${reply.review_id} as answered:`, reviewError);
        }
      }

      if (reply.question_id) {
        const { error: questionError } = await supabase
          .from("questions")
          .update({ is_answered: true })
          .eq("id", reply.question_id);

        if (questionError) {
          console.error(
            `[mark-reply-published] Failed to mark question ${reply.question_id} as answered:`,
            questionError,
          );
        }
      }

      console.log(`[mark-reply-published] ✅ Reply ${reply_id} marked as published`);
    } else {
      // ❌ Публикация не удалась
      const { error: failError } = await supabase
        .from("replies")
        .update({
          status: "failed",
          error_message: error_message || "Unknown error",
        })
        .eq("id", reply_id);

      if (failError) {
        console.error(`[mark-reply-published] Failed to mark reply ${reply_id} as failed:`, failError);
        return new Response(JSON.stringify({ error: failError.message }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }

      console.log(`[mark-reply-published] ❌ Reply ${reply_id} marked as failed: ${error_message}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[mark-reply-published] Fatal error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
