import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  MessageSquare,
  HelpCircle,
  BarChart3,
  Bell,
  User,
  LogOut,
  Menu,
  ShoppingBag,
  Download,
  ChevronDown,
  ChevronRight,
  Package,
  Brain,
  Truck,
  TrendingUp,
  Upload,
  FileText,
  DollarSign,
  Megaphone,
  Tag,
  Users,
  Settings as SettingsIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface AppLayoutProps {
  children: ReactNode;
}

const AppLayout = ({ children }: AppLayoutProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [reviewsOpen, setReviewsOpen] = useState(true);
  const [questionsOpen, setQuestionsOpen] = useState(true);
  const [analyticsOpen, setAnalyticsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Счётчики
  const [unansweredReviewsCount, setUnansweredReviewsCount] = useState(0);
  const [pendingReviewsCount, setPendingReviewsCount] = useState(0);
  const [archivedReviewsCount, setArchivedReviewsCount] = useState(0);
  const [unansweredQuestionsCount, setUnansweredQuestionsCount] = useState(0);
  const [archivedQuestionsCount, setArchivedQuestionsCount] = useState(0);

  useEffect(() => {
    fetchCounts();

    const handler = () => {
      fetchCounts();
    };

    window.addEventListener("reviews-updated", handler);

    // ✅ Real-time подписка на изменения в таблице reviews для обновления счетчиков
    const reviewsChannel = supabase
      .channel("reviews-count-updates")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "reviews",
        },
        () => {
          // Обновляем счетчики при любом изменении в reviews
          fetchCounts();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "replies",
        },
        () => {
          // Обновляем счетчики при изменении replies (триггер обновит segment)
          fetchCounts();
        }
      )
      .subscribe();

    return () => {
      window.removeEventListener("reviews-updated", handler);
      supabase.removeChannel(reviewsChannel);
    };
  }, []);

  const fetchCounts = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Получаем маркетплейсы пользователя
    const { data: marketplaces } = await supabase.from("marketplaces").select("id").eq("user_id", user.id);

    if (!marketplaces || marketplaces.length === 0) return;
    const marketplaceIds = marketplaces.map((m) => m.id);

    // ✅ Используем прямые COUNT запросы по полю segment в базе данных
    // Это работает быстрее и корректнее, чем клиентский подсчёт с ограничениями
    
    // Счётчик "Не отвечено" (segment = 'unanswered')
    const { count: unansweredCount } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .in("marketplace_id", marketplaceIds)
      .eq("segment", "unanswered")
      .is("deleted_at", null);

    // Счётчик "Ожидают публикации" (segment = 'pending')
    const { count: pendingCount } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .in("marketplace_id", marketplaceIds)
      .eq("segment", "pending")
      .is("deleted_at", null);

    // Счётчик "Архив" (segment = 'archived')
    const { count: archivedCount } = await supabase
      .from("reviews")
      .select("*", { count: "exact", head: true })
      .in("marketplace_id", marketplaceIds)
      .eq("segment", "archived")
      .is("deleted_at", null);

    setUnansweredReviewsCount(unansweredCount || 0);
    setPendingReviewsCount(pendingCount || 0);
    setArchivedReviewsCount(archivedCount || 0);

    // Счётчик вопросов без ответа
    const { count: unansweredQuestions } = await supabase
      .from("questions")
      .select("*", { count: "exact", head: true })
      .in("marketplace_id", marketplaceIds)
      .eq("is_answered", false);

    const { count: archivedQuestions } = await supabase
      .from("questions")
      .select("*", { count: "exact", head: true })
      .in("marketplace_id", marketplaceIds)
      .eq("is_answered", true);

    setUnansweredQuestionsCount(unansweredQuestions || 0);
    setArchivedQuestionsCount(archivedQuestions || 0);
  };

  // Основные пункты меню (без аналитики и настроек - они в Collapsible)
  const navItems = [
    // Аналитика будет в Collapsible ниже
    // Настройки будут в Collapsible ниже
    { path: "/app/notifications", label: "Уведомления", icon: Bell },
    { path: "/app/profile", label: "Профиль", icon: User },
    { path: "/app/import-data", label: "Импорт данных", icon: Upload },
    { path: "/app/extension", label: "Скачать плагин", icon: Download },
  ];

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate("/auth");
      toast({
        title: "Выход выполнен",
        description: "Вы успешно вышли из системы",
      });
    } catch (error) {
      toast({
        title: "Ошибка",
        description: "Не удалось выйти из системы",
        variant: "destructive",
      });
    }
  };

  const getCurrentPageTitle = () => {
    // Проверяем основные пункты меню
    const item = navItems.find((item) => item.path === location.pathname);
    if (item) return item.label;

    // Проверяем аналитику
    const analyticsTitles: Record<string, string> = {
      "/app/analytics/reviews-questions": "Аналитика Отзывов и Вопросов",
      "/app/sales-analytics": "Аналитика Продаж",
      "/app/analytics/prices": "Аналитика цен",
      "/app/analytics/promotion": "Аналитика Продвижения",
      "/app/analytics/promotions": "Аналитика Акций",
      "/app/analytics/competitors": "Аналитика Конкурентов",
    };
    if (analyticsTitles[location.pathname]) return analyticsTitles[location.pathname];

    // Проверяем настройки
    const settingsTitles: Record<string, string> = {
      "/app/settings": "Настройки Отзывов и Вопросов",
      "/app/marketplaces": "Настройка Маркетплейсов",
      "/app/suppliers": "Настройка Поставщиков",
      "/app/products/settings": "Настройка Товаров",
      "/app/settings/competitors": "Настройка Конкурентов",
      "/app/settings/ozon-api": "Настройка API OZON Продвижения",
    };
    if (settingsTitles[location.pathname]) return settingsTitles[location.pathname];

    // Проверяем отзывы и вопросы
    if (location.pathname.startsWith("/app/reviews")) return "Отзывы";
    if (location.pathname.startsWith("/app/questions")) return "Вопросы";

    return "Аналитика";
  };

  const NavContent = () => (
    <div className="flex flex-col h-full bg-card">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link to="/app/analytics/reviews-questions" onClick={() => setIsMobileMenuOpen(false)}>
          <h2 className="text-2xl font-bold gradient-primary bg-clip-text text-transparent">Автоответ</h2>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <TooltipProvider>
          {/* Аналитика раздел */}
          <Collapsible open={analyticsOpen} onOpenChange={setAnalyticsOpen}>
            <CollapsibleTrigger className="flex items-center gap-3 px-4 py-3 w-full rounded-lg hover:bg-secondary transition-all duration-200">
              <BarChart3 className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium flex-1 text-left">Аналитика</span>
              {analyticsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="ml-4 mt-1 space-y-1">
              <Link
                to="/app/analytics/reviews-questions"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/analytics/reviews-questions"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span className="text-sm">Отзывы и Вопросы</span>
              </Link>
              <Link
                to="/app/sales-analytics"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/sales-analytics"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span className="text-sm">Продаж</span>
              </Link>
              <Link
                to="/app/analytics/prices"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/analytics/prices"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <DollarSign className="w-4 h-4" />
                <span className="text-sm">Цен</span>
              </Link>
              <Link
                to="/app/analytics/promotion"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/analytics/promotion"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <Megaphone className="w-4 h-4" />
                <span className="text-sm">Продвижения</span>
              </Link>
              <Link
                to="/app/analytics/promotions"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/analytics/promotions"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <Tag className="w-4 h-4" />
                <span className="text-sm">Акций</span>
              </Link>
              <Link
                to="/app/analytics/competitors"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/analytics/competitors"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <Users className="w-4 h-4" />
                <span className="text-sm">Конкурентов</span>
              </Link>
            </CollapsibleContent>
          </Collapsible>

          {/* Отзывы раздел */}
          <Collapsible open={reviewsOpen} onOpenChange={setReviewsOpen}>
            <CollapsibleTrigger className="flex items-center gap-3 px-4 py-3 w-full rounded-lg hover:bg-secondary transition-all duration-200">
              <MessageSquare className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium flex-1 text-left">Отзывы</span>
              {reviewsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="ml-4 mt-1 space-y-1">
              <Link
                to="/app/reviews/unanswered"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center justify-between gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/reviews/unanswered"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <span className="text-sm">Не отвечено</span>
                <Badge variant="secondary" className="ml-auto">
                  {unansweredReviewsCount}
                </Badge>
              </Link>
              <Link
                to="/app/reviews/pending"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center justify-between gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/reviews/pending"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <span className="text-sm">Ожидают публикации</span>
                <Badge variant="secondary" className="ml-auto">
                  {pendingReviewsCount}
                </Badge>
              </Link>
              <Link
                to="/app/reviews/archived"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center justify-between gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/reviews/archived"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <span className="text-sm">Архив</span>
                <Badge variant="secondary" className="ml-auto">
                  {archivedReviewsCount}
                </Badge>
              </Link>
            </CollapsibleContent>
          </Collapsible>

          {/* Вопросы раздел */}
          <Collapsible open={questionsOpen} onOpenChange={setQuestionsOpen}>
            <CollapsibleTrigger className="flex items-center gap-3 px-4 py-3 w-full rounded-lg hover:bg-secondary transition-all duration-200">
              <HelpCircle className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium flex-1 text-left">Вопросы</span>
              {questionsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="ml-4 mt-1 space-y-1">
              <Link
                to="/app/questions/unanswered"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center justify-between gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/questions/unanswered"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <span className="text-sm">Не отвечено</span>
                <Badge variant="secondary" className="ml-auto">
                  {unansweredQuestionsCount}
                </Badge>
              </Link>
              <Link
                to="/app/questions/archived"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center justify-between gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/questions/archived"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <span className="text-sm">Архив</span>
                <Badge variant="secondary" className="ml-auto">
                  {archivedQuestionsCount}
                </Badge>
              </Link>
            </CollapsibleContent>
          </Collapsible>

          {/* Настройки раздел */}
          <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
            <CollapsibleTrigger className="flex items-center gap-3 px-4 py-3 w-full rounded-lg hover:bg-secondary transition-all duration-200">
              <SettingsIcon className="w-5 h-5 flex-shrink-0" />
              <span className="font-medium flex-1 text-left">Настройки</span>
              {settingsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </CollapsibleTrigger>
            <CollapsibleContent className="ml-4 mt-1 space-y-1">
              <Link
                to="/app/marketplaces"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/marketplaces"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span className="text-sm">Маркетплейсов</span>
              </Link>
              <Link
                to="/app/settings"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/settings"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span className="text-sm">Отзывов и Вопросов</span>
              </Link>
              <Link
                to="/app/suppliers"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/suppliers"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <Truck className="w-4 h-4" />
                <span className="text-sm">Поставщиков</span>
              </Link>
              <Link
                to="/app/products/settings"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/products/settings"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <Package className="w-4 h-4" />
                <span className="text-sm">Товаров</span>
              </Link>
              <Link
                to="/app/settings/competitors"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/settings/competitors"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <Users className="w-4 h-4" />
                <span className="text-sm">Конкурентов</span>
              </Link>
              <Link
                to="/app/settings/ozon-api"
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${
                  location.pathname === "/app/settings/ozon-api"
                    ? "bg-primary text-primary-foreground shadow-medium"
                    : "hover:bg-secondary text-foreground hover:shadow-soft"
                }`}
              >
                <Megaphone className="w-4 h-4" />
                <span className="text-sm">API OZON Продвижения</span>
              </Link>
            </CollapsibleContent>
          </Collapsible>

          {/* Основные пункты меню */}
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <Link
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                      isActive
                        ? "bg-primary text-primary-foreground shadow-medium"
                        : "hover:bg-secondary text-foreground hover:shadow-soft"
                    }`}
                  >
                    <item.icon className="w-5 h-5 flex-shrink-0" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{item.label}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </TooltipProvider>
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-border">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5 mr-3" />
          Выйти
        </Button>
      </div>

      {/* Support Chat Icon */}
      <div className="p-4 text-center border-t border-border">
        <a
          href="https://t.me/your_support"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
          </svg>
          Поддержка
        </a>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 border-r border-border flex-col shadow-soft">
        <NavContent />
      </aside>

      {/* Mobile Menu */}
      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
        <SheetTrigger asChild className="lg:hidden">
          <Button variant="ghost" size="icon" className="fixed top-4 left-4 z-50 shadow-medium">
            <Menu className="w-6 h-6" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-64">
          <NavContent />
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {/* Page Header */}
        <div className="sticky top-0 z-40 bg-card/80 backdrop-blur-sm border-b border-border shadow-soft">
          <div className="container mx-auto px-6 py-4">
            <h1 className="text-2xl font-bold text-foreground">{getCurrentPageTitle()}</h1>
          </div>
        </div>

        {/* Page Content */}
        <div className="container mx-auto p-6">{children}</div>
      </main>
    </div>
  );
};

export default AppLayout;
