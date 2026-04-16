import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function PricingApp() {
  const [cost, setCost] = useState(5);
  const [margin, setMargin] = useState(0.25);
  const [freight, setFreight] = useState(2500);
  const [volume, setVolume] = useState(24000);

  const price = cost / (1 - margin);
  const revenue = price * volume;
  const totalCost = cost * volume + freight;
  const profit = revenue - totalCost;

  return (
    <div className="p-6 grid gap-6">
      <h1 className="text-2xl font-bold">Lubricant Pricing Dashboard</h1>

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 p-4">
          <Input
            type="number"
            value={cost}
            onChange={(e) => setCost(parseFloat(e.target.value))}
            placeholder="Cost per Liter"
          />
          <Input
            type="number"
            value={margin}
            onChange={(e) => setMargin(parseFloat(e.target.value))}
            placeholder="Margin"
          />
          <Input
            type="number"
            value={freight}
            onChange={(e) => setFreight(parseFloat(e.target.value))}
            placeholder="Freight"
          />
          <Input
            type="number"
            value={volume}
            onChange={(e) => setVolume(parseFloat(e.target.value))}
            placeholder="Volume"
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p>Price / L</p>
            <h2 className="text-xl font-bold">{price.toFixed(2)}</h2>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p>Revenue</p>
            <h2 className="text-xl font-bold">{revenue.toFixed(0)}</h2>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <p>Profit</p>
            <h2 className="text-xl font-bold">{profit.toFixed(0)}</h2>
          </CardContent>
        </Card>
      </div>

      <Button onClick={() => alert("Export quote coming next version")}>Generate Quote</Button>
    </div>
  );
}

