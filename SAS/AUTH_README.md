# Authentication Setup

## Overview
This React Native app uses the same authentication API as the Flutter version, connecting to `https://api.rds.ismis.com.ph/api/mobile-login`.

## Files Created

### 1. `services/authService.ts`
Authentication service that handles:
- **Login**: POST to `/api/mobile-login` with email and password
- **Logout**: Clears all stored user data
- **User Data Storage**: Saves to AsyncStorage:
  - `employee_id`
  - `userName`
  - `user_company_id`
  - `access_token`

### 2. `app/login.tsx`
Login screen with:
- Email and password input fields
- Show/hide password toggle
- Form validation
- Loading state with ActivityIndicator
- Error handling with user-friendly messages

### 3. Updated `app/_layout.tsx`
- Login screen is now the initial route
- Users must log in before accessing tabs

## How It Works

1. **User enters credentials** on the login screen
2. **Validation** checks for empty fields and valid email format
3. **API call** to `https://api.rds.ismis.com.ph/api/mobile-login`
4. **Success**: 
   - Stores user data in AsyncStorage
   - Shows welcome message with user's name
   - Navigates to main tabs
5. **Failure**: Shows error message from API

## Stored Data

After successful login, the following data is saved:
```typescript
- employee_id: number
- userName: string
- user_company_id: number  // Used for fetching company branches
- access_token: string
```

## Branch Selection Feature

The app includes a branch selection feature that:
- Fetches branches for the user's company using `user_company_id`
- Uses the device's current GPS location
- Calculates distance to each branch
- Filters branches within their geofence radius
- Sorts by closest distance

### Branch API

**Endpoint**: `GET /api/branches/by-company`

**Query Parameters**:
- `company_id` - User's company ID (from AsyncStorage)
- `latitude` - User's current latitude
- `longitude` - User's current longitude

**Example**: 
```
https://api.rds.ismis.com.ph/api/branches/by-company?company_id=2&latitude=14.620813&longitude=121.046340
```

### Using Branch Service

```typescript
import branchService from '@/services/branchService';
import * as Location from 'expo-location';

// Get user location
const location = await Location.getCurrentPositionAsync({
  accuracy: Location.Accuracy.High,
});

// Fetch all branches for user's company
const result = await branchService.getBranchesByCompanyAndLocation(
  location.coords.latitude,
  location.coords.longitude
);

if (result.success) {
  console.log('Branches:', result.branches);
  // Each branch has: id, branch_name, latitude, longitude, radius, distance, isWithinGeofence
}

// Get only nearby branches (within geofence)
const nearbyResult = await branchService.getNearbyBranches(
  location.coords.latitude,
  location.coords.longitude
);
```

## Using AuthService in Your Code

```typescript
import authService from '@/services/authService';

// Login
const response = await authService.login('user@example.com', 'password');
if (response.success) {
  console.log('User:', response.user);
}

// Check if logged in
const isLoggedIn = await authService.isLoggedIn();

// Get user data
const userData = await authService.getUserData();
console.log('Employee ID:', userData.employee_id);
console.log('User Name:', userData.userName);

// Logout
await authService.logout();
```

## Using Auth Hooks

### `useUser()` Hook
Get current user data in any component:

```typescript
import { useUser } from '@/hooks/use-auth';

function MyComponent() {
  const { userName, employee_id, user_company_id, refresh } = useUser();
  
  return <Text>Welcome, {userName}!</Text>;
}
```

### `useProtectedRoute()` Hook (Optional)
Add auto-login functionality to your `app/_layout.tsx`:

```typescript
import { useProtectedRoute } from '@/hooks/use-auth';

export default function RootLayout() {
  const { isLoading } = useProtectedRoute();
  
  if (isLoading) {
    return <SplashScreen />;
  }
  
  // ... rest of your layout
}
```

This will:
- Automatically redirect logged-in users from login page to tabs
- Automatically redirect logged-out users from tabs to login page

## API Response Format

The API returns:
```json
{
  "access_token": "...",
  "user": {
    "employee_id": 123,
    "name": "John Doe",
    "company_id": 1,
    "email": "user@example.com"
  }
}
```

## Testing

To test the login:
1. Run the app: `npm start` or `npx expo start`
2. Enter valid credentials for your API
3. Check console logs for debugging information

## Next Steps

- [ ] Add auto-login on app start (check AsyncStorage for token)
- [ ] Add token refresh logic
- [ ] Implement sign-up screen
- [ ] Add biometric authentication
- [ ] Handle token expiration
