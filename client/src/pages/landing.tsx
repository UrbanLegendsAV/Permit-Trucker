import { Truck, Shield, Award, Zap, MapPin, ArrowRight, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const features = [
  {
    icon: MapPin,
    title: "Town-by-Town Guidance",
    description: "Curated requirements for Connecticut towns with confidence scores",
  },
  {
    icon: Shield,
    title: "Smart Document Handling",
    description: "Upload, parse, and auto-fill your applications",
  },
  {
    icon: Award,
    title: "Earn Pioneer Badges",
    description: "Be the first to permit in new towns and earn rewards",
  },
  {
    icon: Zap,
    title: "AI-Powered Assistance",
    description: "Intelligent form filling and portal navigation",
  },
];

const steps = [
  "Add your food truck or trailer details",
  "Select your target town and permit type",
  "Complete requirements checklist",
  "Submit or print your application",
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-background" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent" />
        
        <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-24">
          <div className="flex flex-col items-center text-center space-y-6">
            <Badge className="bg-primary/10 text-primary border-primary/20" data-testid="badge-launch">
              Now Live in Connecticut
            </Badge>
            
            <div className="flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-2">
              <Truck className="w-10 h-10 text-primary" />
            </div>
            
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight max-w-3xl">
              Food Truck Permits,{" "}
              <span className="text-primary">Simplified</span>
            </h1>
            
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl">
              Navigate the complex world of food truck and trailer permitting with PermitTruck. 
              Your AI-powered assistant for Connecticut and beyond.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button 
                size="lg" 
                className="h-14 px-8 text-lg font-semibold"
                onClick={() => window.location.href = "/auth"}
                data-testid="button-get-started"
              >
                Get Started Free
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <Button 
                variant="outline" 
                size="lg" 
                className="h-14 px-8 text-lg"
                data-testid="button-learn-more"
              >
                Learn More
              </Button>
            </div>
            
            <p className="text-sm text-muted-foreground pt-4">
              No credit card required. Start permitting in minutes.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Everything You Need to Permit
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              From application to approval, PermitTruck guides you every step of the way
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="p-6 hover-elevate transition-all"
                data-testid={`feature-card-${index}`}
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="font-display text-3xl md:text-4xl font-bold mb-6">
                How It Works
              </h2>
              <p className="text-muted-foreground mb-8">
                Get your food truck permitted in four simple steps. Our system handles the complexity 
                so you can focus on what matters - serving great food.
              </p>
              
              <div className="space-y-4">
                {steps.map((step, index) => (
                  <div 
                    key={index} 
                    className="flex items-start gap-4"
                    data-testid={`step-${index}`}
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-sm font-bold shrink-0">
                      {index + 1}
                    </div>
                    <p className="text-lg pt-1">{step}</p>
                  </div>
                ))}
              </div>
            </div>
            
            <Card className="p-8 bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">Joe's Tacos</p>
                    <p className="text-sm text-muted-foreground">Food Truck</p>
                  </div>
                </div>
                
                <div className="space-y-3">
                  {["Danbury - Yearly Permit", "Stamford - Event Permit", "Norwalk - Seasonal"].map((permit, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-background rounded-lg">
                      <CheckCircle className="w-5 h-5 text-green-500" />
                      <span className="text-sm">{permit}</span>
                      <Badge className="ml-auto bg-green-500/10 text-green-500">Approved</Badge>
                    </div>
                  ))}
                </div>
                
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center gap-2">
                    <Award className="w-5 h-5 text-amber-500" />
                    <span className="text-sm font-medium">3 Pioneer Badges Earned</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <section className="py-16 md:py-24 bg-primary/5">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            Ready to Start Permitting?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
            Join food truck owners across Connecticut who are using PermitTruck 
            to simplify their permitting process.
          </p>
          <Button 
            size="lg" 
            className="h-14 px-8 text-lg font-semibold"
            onClick={() => window.location.href = "/api/login"}
            data-testid="button-cta-bottom"
          >
            Get Started Now
            <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </section>

      <footer className="py-8 border-t border-border">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-primary" />
              <span className="font-display font-bold">PermitTruck</span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Always verify permit requirements with official town sources.
            </p>
            <p className="text-sm text-muted-foreground">
              2024 PermitTruck. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
