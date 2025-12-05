import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { BarChart3, MessageSquare, Package, TrendingUp } from "lucide-react";

interface Stats {
  totalProducts: number;
  totalReviews: number;
  totalQuestions: number;
  totalReplies: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<Stats>({
    totalProducts: 0,
    totalReviews: 0,
    totalQuestions: 0,
    totalReplies: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [productsRes, reviewsRes, questionsRes, repliesRes] = await Promise.all([
        supabase
          .from("products")
          .select("id", { count: "exact" })
          .eq("marketplace_id", user.id),
        supabase
          .from("reviews")
          .select("id", { count: "exact" }),
        supabase
          .from("questions")
          .select("id", { count: "exact" }),
        supabase
          .from("replies")
          .select("id", { count: "exact" }),
      ]);

      setStats({
        totalProducts: productsRes.count || 0,
        totalReviews: reviewsRes.count || 0,
        totalQuestions: questionsRes.count || 0,
        totalReplies: repliesRes.count || 0,
      });
    } catch (error) {
      console.error("Error loading stats:", error);
    } finally {
      setLoading(false);
    }
  };

  const statCards = [
    {
      title: "Товары",
      value: stats.totalProducts,
      icon: Package,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "Отзывы",
      value: stats.totalReviews,
      icon: MessageSquare,
      color: "text-accent",
      bgColor: "bg-accent/10",
    },
    {
      title: "Вопросы",
      value: stats.totalQuestions,
      icon: BarChart3,
      color: "text-secondary",
      bgColor: "bg-secondary/10",
    },
    {
      title: "Ответы",
      value: stats.totalReplies,
      icon: TrendingUp,
      color: "text-primary-light",
      bgColor: "bg-primary-light/10",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto p-6 space-y-8">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            Дашборд
          </h1>
          <p className="text-muted-foreground">
            Обзор ваших маркетплейсов и активности
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statCards.map((stat, index) => (
            <Card
              key={index}
              className="p-6 hover:shadow-elegant transition-shadow animate-fade-in-up"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">{stat.title}</p>
                  <p className="text-3xl font-bold">
                    {loading ? "..." : stat.value}
                  </p>
                </div>
                <div className={`${stat.bgColor} p-3 rounded-lg`}>
                  <stat.icon className={`w-6 h-6 ${stat.color}`} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card className="p-6">
          <h2 className="text-2xl font-semibold mb-4">Добро пожаловать!</h2>
          <p className="text-muted-foreground mb-4">
            АвтоОтвет поможет вам автоматизировать ответы на отзывы и вопросы покупателей
            на маркетплейсах.
          </p>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-start">
              <span className="mr-2">•</span>
              Подключите ваши маркетплейсы в разделе "Маркетплейсы"
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              Создайте шаблоны ответов для быстрой работы
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              Настройте автоматические ответы с помощью ИИ
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;