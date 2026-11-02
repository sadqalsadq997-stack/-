import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClientInstance } from "@/lib/query-client";
import { BrowserRouter as Router, Route, Routes, Navigate, useLocation } from "react-router-dom";
import { loadSession } from "@/lib/security/session";
import { canAccess, defaultPage } from "@/lib/permissions";
import { AuthProvider, useAuth } from "@/lib/AuthContext";
import { I18nProvider } from "@/lib/i18n";
import AppLayout from "@/components/layout/AppLayout";
import AppPINGate from "@/components/AppPINGate";
import PaymentGate from "@/pages/PaymentGate";

// Auth pages
import OwnerLogin    from "@/pages/auth/OwnerLogin";
import SubscribeWizard from "@/pages/subscribe/SubscribeWizard";
import SubscribeReturn from "@/pages/subscribe/SubscribeReturn";
import ForgotPassword from "@/pages/auth/ForgotPassword";
import ResetPassword  from "@/pages/auth/ResetPassword";
import PagerCustomer  from "@/pages/PagerCustomer";
import PagerLookup    from "@/pages/PagerLookup";
import Pager          from "@/pages/Pager";

// App pages
import Dashboard             from "@/pages/Dashboard";
import POSTerminal           from "@/pages/POSTerminal";
import Orders                from "@/pages/Orders";
import Invoices              from "@/pages/Invoices";
import Products            ¶»§q«^