-- Create trigger to update review segment when replies change
CREATE OR REPLACE TRIGGER update_review_segment_on_reply_change
  AFTER INSERT OR UPDATE OR DELETE ON public.replies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_segment_on_reply_change();

-- Create trigger to update review segment when review itself changes
CREATE OR REPLACE TRIGGER update_review_segment_on_review_change
  BEFORE INSERT OR UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_review_segment_on_review_change();

-- Recalculate all review segments to fix current data
UPDATE reviews 
SET segment = calculate_review_segment(id),
    updated_at = NOW()
WHERE segment IS DISTINCT FROM calculate_review_segment(id);