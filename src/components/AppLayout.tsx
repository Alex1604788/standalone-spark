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
    return () => {
      window.removeEventListener("reviews-updated", handler);
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

  const navItems = [
    { path: "/app", label: "Дашборд", icon: LayoutDashboard },
    { path: "/app/marketplaces", label: "Маркетплейсы", icon: ShoppingBag },
    { path: "/app/products/settings", label: "Настройка товаров", icon: Package },
    { path: "/app/products/knowledge", label: "База знаний", icon: Brain },
    { path: "/app/suppliers", label: "Поставщики", icon: Truck },
    { path: "/app/analytics", label: "Аналитика", icon: BarChart3 },
    { path: "/app/sales-analytics", label: "Sales Analytics", icon: TrendingUp },
    { path: "/app/settings", label: "Настройки", icon: User },
    { path: "/app/notifications", label: "Уведомления", icon: Bell },
    { path: "/app/profile", label: "Профиль", icon: User },
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
    const item = navItems.find((item) => item.path === location.pathname);
    return item?.label || "Дашборд";
  };

  const NavContent = () => (
    <div className="flex flex-col h-full bg-card">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <Link to="/app" onClick={() => setIsMobileMenuOpen(false)}>
          <h2 className="text-2xl font-bold gradient-primary bg-clip-text text-transparent">Автоответ</h2>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <TooltipProvider>
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
