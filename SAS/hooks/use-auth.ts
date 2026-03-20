import { useEffect, useState } from 'react';
import { useRouter, useSegments } from 'expo-router';
import authService from '@/services/authService';

/**
 * Hook to handle authentication state and routing
 * Place this in your root _layout.tsx to enable auto-login
 */
export function useProtectedRoute() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const loggedIn = await authService.isLoggedIn();
      setIsLoggedIn(loggedIn);
    } catch (error) {
      console.error('Error checking auth:', error);
      setIsLoggedIn(false);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === '(tabs)';

    if (!isLoggedIn && inAuthGroup) {
      // Redirect to login if not authenticated
      router.replace('/login');
    } else if (isLoggedIn && !inAuthGroup) {
      // Redirect to tabs if authenticated and on login page
      router.replace('/(tabs)');
    }
  }, [isLoggedIn, segments, isLoading]);

  return { isLoading, isLoggedIn };
}

/**
 * Hook to get current user data
 */
export function useUser() {
  const [userData, setUserData] = useState<{
    employee_id: string | null;
    user_id: string | null;
    userName: string | null;
    user_company_id: string | null;
    access_token: string | null;
  }>({
    employee_id: null,
    user_id: null,
    userName: null,
    user_company_id: null,
    access_token: null,
  });

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    const data = await authService.getUserData();
    setUserData(data);
  };

  const refresh = () => {
    loadUserData();
  };

  return { ...userData, refresh };
}
