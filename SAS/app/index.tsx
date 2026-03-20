import { useEffect } from 'react';
import { router } from 'expo-router';
import authService from '@/services/authService';

export default function Index() {
  useEffect(() => {
    (async () => {
      // Decide based on stored userName; send to login if missing
      const user = await authService.getUserData();
      const hasUserName = !!user?.userName && user.userName.trim().length > 0;
      if (hasUserName) {
        router.replace('/(tabs)');
      } else {
        router.replace('/login');
      }
    })();
  }, []);

  // Render nothing while deciding the route
  return null;
}
