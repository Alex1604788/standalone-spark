import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { ShoppingBag } from "lucide-react";

const ConnectMarketplace = () => {
  const navigate = useNavigate();

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Подключите ваш маркетплейс</h1>
        <p className="text-muted-foreground">
          Сервис «АвтоОтвет» сможет автоматически отвечать на отзывы и вопросы покупателей в вашем магазине.
        </p>
      </div>

      <div className="grid gap-6">
        <Card className="cursor-pointer hover:border-primary transition-colors" onClick={() => navigate('/app/connect/ozon')}>
          <CardHeader>
            <div className="flex items-start gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <ShoppingBag className="w-8 h-8 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-xl mb-2">Ozon</CardTitle>
                <CardDescription>
                  Подключите магазин на Ozon через официальный API или безопасный UI-режим
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button className="w-full">Подключить Ozon</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ConnectMarketplace;
