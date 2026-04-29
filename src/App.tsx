import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import NotFound from "./pages/NotFound";
import { useAuth } from "./hooks/useAuth";
import Icon from "@/components/ui/icon";

const queryClient = new QueryClient();

function AppRoutes() {
  const { user, loading, login, register } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "hsl(220,16%,5%)" }}>
        <Icon name="Loader2" size={24} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <AuthPage onLogin={login} onRegister={register} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AppRoutes />
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
