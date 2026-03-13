import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { HashRouter, Routes, Route } from "react-router-dom";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";

const App = () => {
  // Request notification permission on first launch so the macOS dialog
  // appears at startup, not silently at the moment the timer fires.
  useEffect(() => {
    isPermissionGranted()
      .then((granted) => {
        if (!granted) requestPermission().catch(() => {});
      })
      .catch(() => {});
  }, []);

  return (
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </HashRouter>
    </TooltipProvider>
  );
};

export default App;
