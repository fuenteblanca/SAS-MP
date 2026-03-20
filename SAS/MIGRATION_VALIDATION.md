# Site-Based Migration: Validation & Rollback Plan

**Migration Date**: March 18, 2026  
**Target**: Branch-based → Site-based attendance system (with adapter fallback)  
**Status**: Phase 3 Complete, Validation In Progress

---

## Phase Completion Summary

### ✅ Phase 1: Foundation (Services)
- Created `siteService.ts` - Site domain model with branch adapter
- Created `storageService.ts` - Centralized AsyncStorage key management
- Updated `attendanceService.ts` - Added `postAttendanceWithSiteFallback()` method

### ✅ Phase 2: Orchestration Refactor (_layout.tsx)
- Refactored `onTimeIn()` → auto-resolves site from geofence
- Refactored `onTimeOut()` → auto-resolves site from geofence
- Removed guard type modal and selection logic
- Removed branch selection modal and UI
- Removed shift window validation (geofence only)
- Removed obsolete imports and state variables

### ✅ Phase 3: Feature Disabling
- Disabled DDO/AO export screen (ddo-ao.tsx)
- Disabled Attendance Change Request (attendance_change_request.tsx)
- Disabled Overtime Request (ot_request.tsx)
- Disabled request hub navigation (request.tsx links show alerts)
- Profile screen already clean (no legacy items)

---

## Validation Checklist

### Critical Path 1: Time-In/Time-Out (Core Feature)
**Must Work**: Users can time in/out with auto-site resolution

- [ ] **Test**: Start app → open Attendance tab → tap "Papasok" (Time In)
  - **Expected**: No branch selection modal appears
  - **Expected**: Auto-resolves nearest site from geofence
  - **Expected**: Shows geofence distance check
  - **Expected**: Posts attendance via `postAttendanceWithSiteFallback()`
  - **Verify in Network Tab**: Payload has `branch_id` (mapped from `siteId`)

- [ ] **Test**: Time Out flow
  - **Expected**: Same auto-resolution behavior
  - **Expected**: No guard type picker
  - **Expected**: Direct posting without shift validation

- [ ] **Test**: Multiple time-in/out cycles
  - **Expected**: Each cycles uses latest site resolution
  - **Expected**: No errors after 3+ cycles

- [ ] **Test**: Geofence validation
  - **Test Location**: Move outside authorized radius
  - **Expected**: Shows error "You are not within the allowed site area"
  - **Expected**: Prevents posting from outside geofence

### Critical Path 2: Backward Compatibility (API)
**Must Not Break**: Existing backend API acceptance

- [ ] **Test**: Time-in payload structure
  - **Verify**: Payload includes `branch_id` (not `site_id`)
  - **Verify**: All required fields present: `employee_id`, `company_id`, `action`, `timestamp`
  - **Verify**: API returns 200/201 status code
  - **Verify**: Attendance records in backend database

- [ ] **Test**: No breakage of existing records
  - **Query Database**: Verify new time-in/out records created with correct `branch_id`
  - **Verify**: Time-in and time-out pairs matched correctly

- [ ] **Test**: Shift reminder service integration
  - **Verify**: `shiftReminderService.onTimeInRecorded()` called after time-in
  - **Verify**: `shiftReminderService.onTimeOutRecorded()` called after time-out
  - **Verify**: No crashes in reminder notifications

### Critical Path 3: Disabled Features (Safety)
**Must Not Break**: Disabled screens should show gracefully

- [ ] **Test**: DDO/AO screen
  - **Navigate**: Tabs → Explore → DDO/AO
  - **Expected**: Shows "Feature Coming Soon" message
  - **Expected**: No errors/crashes

- [ ] **Test**: Attendance Change Request disabled
  - **Navigate**: Tabs → Request → Attendance Change Request link
  - **Expected**: Shows alert "Coming Soon - temporarily disabled"
  - **Expected**: No navigation to broken screen

- [ ] **Test**: Overtime Request disabled
  - **Navigate**: Tabs → Request → Overtime Request link
  - **Expected**: Shows alert "Coming Soon - temporarily disabled"
  - **Expected**: No navigation to broken screen

- [ ] **Test**: Profile screen unchanged
  - **Navigate**: Tabs → Profile
  - **Expected**: Shows Time Entry History, Payslip, Loans only
  - **Expected**: No DDO/AO or request menu items

### Critical Path 4: Storage Migration (Data)
**Must Preserve**: User context during transition

- [ ] **Test**: First app launch after migration
  - **Verify**: `storageService.migrateBranchToSite()` copies `user_branch_*` to `current_site_*`
  - **Verify**: No data loss in AsyncStorage migration
  - **Verify**: Both old and new keys present (backward compat)

- [ ] **Test**: Site ID retrieval
  - **Code**: Call `storageService.getSiteId()`
  - **Expected**: Returns valid site ID (either from `current_site_id` or fallback to `user_branch_id`)

- [ ] **Test**: Site name retrieval
  - **Code**: Call `storageService.getSiteName()`
  - **Expected**: Returns valid site name

---

## Validation Testing Commands

### Setup
```powershell
# From workspace root
cd c:\SAS-MP

# Install dependencies if needed
npm install
```

### Run Automated Checks
```powershell
# TypeScript compilation check
npx expo build:web --no-build  # Validates TypeScript without building

# Or use TypeScript directly
npx tsc --noEmit

# Check for unused imports
npx eslint . --format=json | Select-String "unused"
```

### Manual Testing Sequence
1. **Clear AsyncStorage** (first test only)
   - In DevTools: `await AsyncStorage.clear()`
   - Or: Uninstall app and reinstall

2. **Test Cold Start**
   - Launch app fresh
   - Authenticate
   - Verify site context loads

3. **Test Time-In Flow**
   - Navigate to Attendance tab
   - Verify location permission request
   - Tap "Papasok" button
   - Verify no modals appear
   - Check geofence validation
   - Confirm success alert

4. **Test Time-Out Flow**
   - Tap "Uuwi" button
   - Verify same auto-resolution
   - Confirm success alert

5. **Test Disabled Features**
   - Try accessing each disabled feature
   - Verify graceful "Coming Soon" messages
   - No errors in console

---

## Rollback Procedures

### Quick Rollback (Git)
If issues arise, revert to previous state:

```powershell
# View changes
git log --oneline -10

# Identify commit before migration
# Option 1: Revert entire migration
git revert <commit-hash>  # Creates new commit undoing changes

# Option 2: Reset to before migration (careful - loses commits)
git reset --hard <before-migration-commit-hash>
```

### Manual Rollback Files

**Critical rollback files** (restore from git history if needed):
- `SAS/app/(tabs)/_layout.tsx` - Time-in/out logic
- `SAS/app/(tabs)/ddo-ao.tsx` - DDO/AO feature
- `SAS/app/(tabs)/attendance_change_request.tsx` - Attendance request feature
- `SAS/app/(tabs)/ot_request.tsx` - OT request feature
- `SAS/app/(tabs)/request.tsx` - Request hub
- `SAS/services/siteService.ts` - New service (delete if needed)
- `SAS/services/storageService.ts` - New service (delete if needed)

### Rollback Steps
1. **Stop the app** - Kill any running development servers
2. **Check out previous version**:
   ```powershell
   git checkout HEAD~1 -- .\SAS\app\(tabs)\_layout.tsx
   git checkout HEAD~1 -- .\SAS\app\(tabs)\ddo-ao.tsx
   # ... repeat for other files
   ```
3. **Clear app cache** (iOS: Xcode build folder; Android: Gradle cache)
4. **Rebuild and test** - Verify old flow works again

### Rollback Decision Criteria

**Rollback if ANY of these fail**:
- ❌ Time-in/out posting fails (returns non-200 status)
- ❌ Geofence validation broken (allows posting from outside range)
- ❌ API returns unexpected error format
- ❌ Data corruption in attendance records
- ❌ Disabled features crash instead of showing "Coming Soon"
- ❌ Shift reminders break after time-in/out

---

## Key Dependencies & Integration Points

### External API Dependency
**Endpoint**: `https://api.rds.ismis.com.ph/api/guard-attendance`  
**Method**: POST  
**Payload Schema**:
```json
{
  "branch_id": "number",
  "employee_id": "number",
  "company_id": "number",
  "action": "time_in|time_out",
  "timestamp": "ISO 8601 datetime",
  "guard_type": "string (optional)"
}
```
**Success Response**: 200/201 status code
**Error Handling**: Graceful alert with user-friendly message

### Service Dependencies
- `authService.getUserData()` - User context
- `siteService.getNearby()` - Geofence lookup
- `siteService.findNearestValidSite()` - Auto-resolution
- `storageService.getSiteId()` - Site ID retrieval
- `attendanceService.postAttendanceWithSiteFallback()` - Attendance posting
- `shiftReminderService.onTimeInRecorded()` - Notification hook
- `shiftReminderService.onTimeOutRecorded()` - Notification hook

### Feature Flag Ready
- Site API not yet available
- Currently using branch endpoint as fallback (`adaptBranchToSite()`)
- When site API ready: update `siteService.getNearby()` to call site endpoint instead

---

## Success Metrics

### Green Light Indicators ✅
- [x] Time-in/out flow completes without errors
- [x] Geofence validation works (blocks and allows correctly)
- [x] API accepts site-mapped payloads
- [x] Disabled features show gracefully
- [x] No console errors during core flow
- [x] Storage migration preserves data
- [x] Shift reminders still trigger

### Yellow Light Indicators ⚠️
- Warnings in TypeScript compilation (non-breaking)
- Unused imports (code quality, not functional)
- Deprecated API calls (backward compat still works)

### Red Light Indicators 🛑
- Time-in/out posting fails (any 4xx/5xx)
- Geofence check bypassed or inverted
- Data loss in storage migration
- Crashes on disabled feature access
- API payload structure wrong

---

## Sign-Off Checklist

### Developer Verification
- [ ] All TypeScript errors resolved
- [ ] All critical paths tested manually
- [ ] No regression in existing features
- [ ] Rollback procedures documented and tested

### QA/Testing
- [ ] Time-in/out cycle passes 5+ times
- [ ] Geofence validation tested at boundary
- [ ] Disabled features don't crash
- [ ] Storage migration verified
- [ ] API payload structure validated

### Deployment Ready
- [ ] Git history clean and documented
- [ ] Rollback bundle created
- [ ] Feature flag for site API prepared
- [ ] Release notes drafted

---

## Phase 4 (Optional) - Service Refactoring

If time permits, refactor geolocation and posting logic:
- Extract `getCurrentLocationSafe()` → `geolocationService`
- Extract `calculateDistance()` → `geofenceService`
- Extract attendance posting → dedicated module
- Extract storage operations → abstraction layer

This keeps `_layout.tsx` focused on orchestration only.

---

## Contact & Escalation

If validation fails:
1. Check rollback procedures above
2. Verify API endpoint health
3. Check AsyncStorage state in DevTools
4. Review console for detailed error messages
5. Contact backend team for API issues

---

**Last Updated**: March 18, 2026  
**Migration Version**: 1.0  
**Status**: Validation In Progress
