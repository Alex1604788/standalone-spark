import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Zap, BarChart3, Shield, Check } from "lucide-react";
import { Link } from "react-router-dom";

export default function Landing() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <MessageSquare className="h-8 w-8 text-primary" />
              <Zap className="h-4 w-4 text-accent absolute -bottom-1 -right-1" />
            </div>
            <span className="text-xl font-bold">АвтоОтвет</span>
          </div>
          <nav className="hidden md:flex gap-6">
            <a href="#features" className="text-sm font-medium hover:text-primary transition-colors">Возможности</a>
            <a href="#pricing" className="text-sm font-medium hover:text-primary transition-colors">Тарифы</a>
            <a href="#reviews" className="text-sm font-medium hover:text-primary transition-colors">Отзывы</a>
          </nav>
          <Link to="/auth">
            <Button>Войти</Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <section className="gradient-subtle py-20 md:py-32">
        <div className="container">
          <div className="mx-auto max-w-3xl text-center space-y-8 animate-fade-in-up">
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight">
              Автоматические ответы на отзывы и вопросы покупателей
            </h1>
            <p className="text-xl text-muted-foreground">
              Экономьте время и увеличивайте продажи на маркетплейсах с помощью ИИ-помощника
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/auth">
                <Button size="lg" className="gradient-primary text-white">
                  Начать бесплатно
                </Button>
              </Link>
              <Button size="lg" variant="outline">
                Смотреть демо
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Бесплатно до 30 ответов в месяц • Без кредитной карты
            </p>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20">
        <div className="container">
          <h2 className="text-3xl font-bold text-center mb-12">Как это работает</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { step: "1", title: "Подключите маркетплейсы", desc: "Wildberries, Ozon, Яндекс Маркет и другие" },
              { step: "2", title: "Настройте тон бренда", desc: "Официальный, дружелюбный или экспертный стиль" },
              { step: "3", title: "Получайте ответы автоматически", desc: "ИИ генерирует персонализированные ответы 24/7" },
            ].map((item, i) => (
              <Card key={i} className="shadow-medium hover:shadow-large transition-shadow">
                <CardContent className="pt-6 space-y-4">
                  <div className="w-12 h-12 rounded-full gradient-primary text-white flex items-center justify-center text-xl font-bold">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 gradient-subtle">
        <div className="container">
          <h2 className="text-3xl font-bold text-center mb-12">Возможности</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: MessageSquare, title: "Умные ответы", desc: "ИИ генерирует корректные, вежливые ответы с учетом контекста" },
              { icon: Zap, title: "Три режима работы", desc: "Ручной, полуавтоматический и автоматический" },
              { icon: BarChart3, title: "Аналитика", desc: "Отслеживайте динамику рейтингов и вовлеченность" },
              { icon: Shield, title: "Шаблоны", desc: "Используйте готовые или создавайте свои шаблоны" },
              { icon: Check, title: "Кросс-продажи", desc: "Автоматические рекомендации товаров в ответах" },
              { icon: MessageSquare, title: "Telegram-бот", desc: "Уведомления и публикация ответов из мессенджера" },
            ].map((feature, i) => (
              <Card key={i} className="shadow-soft hover:shadow-medium transition-shadow">
                <CardContent className="pt-6 space-y-3">
                  <feature.icon className="h-10 w-10 text-primary" />
                  <h3 className="text-lg font-semibold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20">
        <div className="container">
          <h2 className="text-3xl font-bold text-center mb-12">Тарифы</h2>
          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              { name: "Free", price: "0", replies: "30", features: ["До 30 ответов в месяц", "1 маркетплейс", "Базовая аналитика", "Шаблоны ответов"] },
              { name: "Pro", price: "2 990", replies: "1000", features: ["До 1000 ответов в месяц", "Все маркетплейсы", "Расширенная аналитика", "Кросс-продажи", "Приоритетная поддержка"], popular: true },
              { name: "Business", price: "9 990", replies: "∞", features: ["Безлимитные ответы", "Все маркетплейсы", "White-label", "Персональный менеджер", "API доступ"] },
            ].map((plan, i) => (
              <Card key={i} className={`shadow-medium hover:shadow-large transition-all ${plan.popular ? 'border-2 border-primary scale-105' : ''}`}>
                <CardContent className="pt-6 space-y-6">
                  {plan.popular && (
                    <div className="gradient-primary text-white text-xs font-semibold px-3 py-1 rounded-full inline-block">
                      Популярный
                    </div>
                  )}
                  <div>
                    <h3 className="text-2xl font-bold">{plan.name}</h3>
                    <div className="mt-4 flex items-baseline">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      <span className="text-muted-foreground ml-2">₽/мес</span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-2">{plan.replies} ответов</p>
                  </div>
                  <ul className="space-y-3">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm">
                        <Check className="h-5 w-5 text-primary flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button className="w-full" variant={plan.popular ? "default" : "outline"}>
                    Выбрать план
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Reviews */}
      <section id="reviews" className="py-20 gradient-subtle">
        <div className="container">
          <h2 className="text-3xl font-bold text-center mb-12">Отзывы клиентов</h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { name: "Анна К.", role: "Владелец магазина на WB", text: "За месяц обработали 500+ отзывов автоматически. Рейтинг вырос с 4.2 до 4.7!" },
              { name: "Дмитрий М.", role: "Менеджер на Ozon", text: "Экономим 3 часа в день на ответах. Качество ответов лучше, чем у операторов" },
              { name: "Елена В.", role: "Селлер на Яндекс Маркет", text: "Кросс-продажи в ответах дали +15% к среднему чеку. Рекомендую!" },
            ].map((review, i) => (
              <Card key={i} className="shadow-soft">
                <CardContent className="pt-6 space-y-4">
                  <p className="text-sm italic">"{review.text}"</p>
                  <div>
                    <p className="font-semibold">{review.name}</p>
                    <p className="text-xs text-muted-foreground">{review.role}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12">
        <div className="container">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-6 w-6 text-primary" />
                <span className="font-bold">АвтоОтвет</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Автоматизация ответов на отзывы для маркетплейсов
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Продукт</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary">Возможности</a></li>
                <li><a href="#" className="hover:text-primary">Тарифы</a></li>
                <li><a href="#" className="hover:text-primary">Интеграции</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Компания</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary">О нас</a></li>
                <li><a href="#" className="hover:text-primary">Блог</a></li>
                <li><a href="#" className="hover:text-primary">Контакты</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Поддержка</h4>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li><a href="#" className="hover:text-primary">Документация</a></li>
                <li><a href="#" className="hover:text-primary">FAQ</a></li>
                <li><a href="#" className="hover:text-primary">Поддержка</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-border mt-8 pt-8 text-center text-sm text-muted-foreground">
            © 2025 АвтоОтвет. Все права защищены.
          </div>
        </div>
      </footer>
    </div>
  );
}
