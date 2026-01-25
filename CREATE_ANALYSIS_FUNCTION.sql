-- =========================================================
-- СОЗДАНИЕ ФУНКЦИИ ДЛЯ АВТОМАТИЧЕСКОГО АНАЛИЗА
-- Запусти это ОДИН РАЗ в Supabase SQL Editor
-- =========================================================

CREATE OR REPLACE FUNCTION public.analyze_replies_table()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb := '{}';
  general_stats jsonb;
  status_dist jsonb;
  mode_dist jsonb;
  old_90 jsonb;
  old_180 jsonb;
  failed_periods jsonb;
  cleanup_potential jsonb;
BEGIN

  -- 1. Общая статистика
  SELECT jsonb_build_object(
    'total_records', COUNT(*),
    'oldest_record', MIN(created_at)::date,
    'newest_record', MAX(created_at)::date,
    'total_size', pg_size_pretty(pg_total_relation_size('public.replies'))
  )
  INTO general_stats
  FROM replies;

  -- 2. Распределение по статусам
  SELECT jsonb_agg(
    jsonb_build_object(
      'status', status,
      'count', count,
      'percent', ROUND(count * 100.0 / SUM(count) OVER (), 2)
    )
    ORDER BY count DESC
  )
  INTO status_dist
  FROM (
    SELECT status, COUNT(*) as count
    FROM replies
    GROUP BY status
  ) t;

  -- 3. Распределение по режимам
  SELECT jsonb_agg(
    jsonb_build_object(
      'mode', mode,
      'count', count,
      'percent', ROUND(count * 100.0 / SUM(count) OVER (), 2)
    )
    ORDER BY count DESC
  )
  INTO mode_dist
  FROM (
    SELECT mode, COUNT(*) as count
    FROM replies
    GROUP BY mode
  ) t;

  -- 4. Старые записи > 90 дней
  SELECT jsonb_agg(
    jsonb_build_object(
      'status', status,
      'count', count,
      'oldest', oldest,
      'newest', newest
    )
    ORDER BY count DESC
  )
  INTO old_90
  FROM (
    SELECT
      status,
      COUNT(*) as count,
      MIN(created_at)::date as oldest,
      MAX(created_at)::date as newest
    FROM replies
    WHERE created_at < NOW() - INTERVAL '90 days'
    GROUP BY status
  ) t;

  -- 5. Очень старые записи > 180 дней
  SELECT jsonb_agg(
    jsonb_build_object(
      'status', status,
      'count', count,
      'oldest', oldest
    )
    ORDER BY count DESC
  )
  INTO old_180
  FROM (
    SELECT
      status,
      COUNT(*) as count,
      MIN(created_at)::date as oldest
    FROM replies
    WHERE created_at < NOW() - INTERVAL '180 days'
    GROUP BY status
  ) t;

  -- 6. Failed записи по периодам
  SELECT jsonb_agg(
    jsonb_build_object(
      'period', age_group,
      'count', count
    )
  )
  INTO failed_periods
  FROM (
    SELECT
      CASE
        WHEN created_at > NOW() - INTERVAL '7 days' THEN '< 7 дней'
        WHEN created_at > NOW() - INTERVAL '30 days' THEN '7-30 дней'
        WHEN created_at > NOW() - INTERVAL '90 days' THEN '30-90 дней'
        WHEN created_at > NOW() - INTERVAL '180 days' THEN '90-180 дней'
        ELSE '> 180 дней'
      END as age_group,
      COUNT(*) as count
    FROM replies
    WHERE status = 'failed'
    GROUP BY age_group
    ORDER BY
      CASE age_group
        WHEN '< 7 дней' THEN 1
        WHEN '7-30 дней' THEN 2
        WHEN '30-90 дней' THEN 3
        WHEN '90-180 дней' THEN 4
        ELSE 5
      END
  ) t;

  -- 7. Потенциал очистки
  SELECT jsonb_build_object(
    'failed_30_days', (
      SELECT jsonb_build_object(
        'count', COUNT(*),
        'priority', 'ВЫСОКИЙ',
        'space', pg_size_pretty(SUM(LENGTH(content)))
      )
      FROM replies
      WHERE status = 'failed' AND created_at < NOW() - INTERVAL '30 days'
    ),
    'drafted_90_days', (
      SELECT jsonb_build_object(
        'count', COUNT(*),
        'priority', 'СРЕДНИЙ',
        'space', pg_size_pretty(SUM(LENGTH(content)))
      )
      FROM replies
      WHERE status = 'drafted' AND created_at < NOW() - INTERVAL '90 days'
    ),
    'published_180_days', (
      SELECT jsonb_build_object(
        'count', COUNT(*),
        'priority', 'НИЗКИЙ',
        'space', pg_size_pretty(SUM(LENGTH(content)))
      )
      FROM replies
      WHERE status = 'published' AND published_at < NOW() - INTERVAL '180 days'
    )
  )
  INTO cleanup_potential;

  -- Собираем все вместе
  result := jsonb_build_object(
    'general_stats', general_stats,
    'status_distribution', status_dist,
    'mode_distribution', mode_dist,
    'old_records_90_days', old_90,
    'old_records_180_days', old_180,
    'failed_by_periods', failed_periods,
    'cleanup_potential', cleanup_potential,
    'analyzed_at', NOW()
  );

  RETURN result;
END;
$$;

-- Даем права на выполнение
GRANT EXECUTE ON FUNCTION public.analyze_replies_table() TO authenticated;
GRANT EXECUTE ON FUNCTION public.analyze_replies_table() TO service_role;

COMMENT ON FUNCTION public.analyze_replies_table() IS 'Автоматический анализ таблицы replies, возвращает JSON с результатами';
