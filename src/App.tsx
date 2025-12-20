import { Suspense, lazy, useEffect, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";

// Eager load public pages and AppLayout (used on all protected pages)
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import AppLayout from "./components/AppLayout";

// Lazy load protected pages
const Marketplaces = lazy(() => import("./pages/Marketplaces"));
const Reviews = lazy(() => import("./pages/Reviews"));
const Questions = lazy(() => import("./pages/Questions"));
const Profile = lazy(() => import("./pages/Profile"));
const ReviewQueue = lazy(() => import("./pages/ReviewQueue"));
const Analytics = lazy(() => import("./pages/analytics/AnalyticsMain"));
const FallbackMode = lazy(() => import("./pages/FallbackMode"));
const Templates = lazy(() => import("./pages/Templates"));
const Settings = lazy(() => import("./pages/Settings"));
const ConnectMarketplace = lazy(() => import("./pages/ConnectMarketplace"));
const ConnectOzonAPI = lazy(() => import("./pages/ConnectOzonAPI"));
const ConnectOzonMode = lazy(() => import("./pages/ConnectOzonMode"));
const ConnectOzonFallback = lazy(() => import("./pages/ConnectOzonFallback"));
const ConnectOzonPairing = lazy(() => import("./pages/ConnectOzonPairing"));
const OzonSettings = lazy(() => import("./pages/OzonSettings"));
const DownloadExtension = lazy(() => import("./pages/DownloadExtension"));
const Notifications = lazy(() => import("./pages/Notifications"));
const ProductSettings = lazy(() => import("./pages/ProductSettings"));
const ProductKnowledge = lazy(() => import("./pages/ProductKnowledge"));
const Suppliers = lazy(() => import("./pages/Suppliers"));
const SalesAnalytics = lazy(() => import("./pages/SalesAnalytics"));
const ImportData = lazy(() => import("./pages/ImportData"));
const ReviewsQuestionsAnalytics = lazy(() => import("./pages/analytics/ReviewsQuestionsAnalytics"));
const PricesAnalytics = lazy(() => import("./pages/analytics/PricesAnalytics"));
const PromotionAnalytics = lazy(() => import("./pages/analytics/PromotionAnalytics"));
const PromotionsAnalytics = lazy(() => import("./pages/analytics/PromotionsAnalytics"));
const CompetitorsAnalytics = lazy(() => import("./pages/analytics/CompetitorsAnalytics"));
const CompetitorsSettings = lazy(() => import("./pages/settings/CompetitorsSettings"));
const OzonApiSettings = lazy(() => import("./pages/settings/OzonApiSettings"));

const queryClient = new QueryClient();

const Loading = () => <div className="min-h-screen flex items-center justify-center">Загрузка...</div>;

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <Loading />;
  if (!session) return <Navigate to="/auth" replace />;
  return <>{children}</>;
}

const ProtectedPage = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute>
    <Suspense fallback={<Loading />}>
      <AppLayout>{children}</AppLayout>
    </Suspense>
  </ProtectedRoute>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/auth" element={<Auth />} />
            {/* Редирект с /app на первую аналитику */}
            <Route path="/app" element={<Navigate to="/app/analytics/reviews-questions" replace />} />
            {/* Аналитика */}
            <Route path="/app/analytics/reviews-questions" element={<ProtectedPage><ReviewsQuestionsAnalytics /></ProtectedPage>} />
            <Route path="/app/sales-analytics" element={<ProtectedPage><SalesAnalytics /></ProtectedPage>} />
            <Route path="/app/analytics/prices" element={<ProtectedPage><PricesAnalytics /></ProtectedPage>} />
            <Route path="/app/analytics/promotion" element={<ProtectedPage><PromotionAnalytics /></ProtectedPage>} />
            <Route path="/app/analytics/promotions" element={<ProtectedPage><PromotionsAnalytics /></ProtectedPage>} />
            <Route path="/app/analytics/competitors" element={<ProtectedPage><CompetitorsAnalytics /></ProtectedPage>} />
            {/* Отзывы и Вопросы */}
            <Route path="/app/reviews/:status" element={<ProtectedPage><Reviews /></ProtectedPage>} />
            <Route path="/app/questions/:status" element={<ProtectedPage><Questions /></ProtectedPage>} />
            {/* Настройки */}
            <Route path="/app/settings" element={<ProtectedPage><Settings /></ProtectedPage>} />
            <Route path="/app/suppliers" element={<ProtectedPage><Suppliers /></ProtectedPage>} />
            <Route path="/app/products/settings" element={<ProtectedPage><ProductSettings /></ProtectedPage>} />
            <Route path="/app/settings/competitors" element={<ProtectedPage><CompetitorsSettings /></ProtectedPage>} />
            <Route path="/app/settings/ozon-api" element={<ProtectedPage><OzonApiSettings /></ProtectedPage>} />
            {/* Остальные страницы */}
            <Route path="/app/marketplaces" element={<ProtectedPage><Marketplaces /></ProtectedPage>} />
            <Route path="/app/profile" element={<ProtectedPage><Profile /></ProtectedPage>} />
            <Route path="/app/review-queue" element={<ProtectedPage><ReviewQueue /></ProtectedPage>} />
            <Route path="/app/analytics" element={<ProtectedPage><Analytics /></ProtectedPage>} />
            <Route path="/app/templates" element={<ProtectedPage><Templates /></ProtectedPage>} />
            <Route path="/app/fallback" element={<ProtectedPage><FallbackMode /></ProtectedPage>} />
            <Route path="/app/connect" element={<ProtectedPage><ConnectMarketplace /></ProtectedPage>} />
            <Route path="/app/connect/ozon" element={<ProtectedPage><ConnectOzonMode /></ProtectedPage>} />
            <Route path="/app/connect/ozon/api" element={<ProtectedPage><ConnectOzonAPI /></ProtectedPage>} />
            <Route path="/app/connect/ozon/fallback" element={<ProtectedPage><ConnectOzonFallback /></ProtectedPage>} />
            <Route path="/app/connect/ozon/pairing" element={<ProtectedPage><ConnectOzonPairing /></ProtectedPage>} />
            <Route path="/app/settings/ozon" element={<ProtectedPage><OzonSettings /></ProtectedPage>} />
            <Route path="/app/extension" element={<ProtectedPage><DownloadExtension /></ProtectedPage>} />
            <Route path="/app/notifications" element={<ProtectedPage><Notifications /></ProtectedPage>} />
            <Route path="/app/products/knowledge" element={<ProtectedPage><ProductKnowledge /></ProtectedPage>} />
            <Route path="/app/import-data" element={<ProtectedPage><ImportData /></ProtectedPage>} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;