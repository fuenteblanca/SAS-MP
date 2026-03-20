# Deployment Checklist & Communication Template

**Project**: SAS Mobile App v2.0.0 (Site-Based Multi-Posting)  
**Date**: March 18, 2026  
**Release Manager**: [Your Name]  
**Status**: Ready for Deployment

---

## Pre-Deployment Tasks

### Code Quality & Compilation
- [ ] All TypeScript strict mode errors resolved
- [ ] ESLint passes with 0 errors
- [ ] No console warnings in core attendance flow
- [ ] All imports resolved (no TS2307 errors)
- [ ] Build succeeds: `npm run build` or `eas build`
- [ ] No circular dependencies detected

### Testing & Validation
- [ ] Manual testing complete (see MIGRATION_VALIDATION.md)
- [ ] All 40+ checklist items passed
- [ ] Green lights on all 4 critical paths:
  - ✅ Time-In/Out Flow
  - ✅ Backward API Compatibility
  - ✅ Disabled Features (graceful degradation)
  - ✅ Storage Migration
- [ ] Device testing on Android (primary) and iOS (optional)
- [ ] Network capture validated (payloads correct)

### Documentation & Visibility
- [ ] RELEASE_NOTES.md created and reviewed
- [ ] MIGRATION_VALIDATION.md accessible to QA team
- [ ] Rollback procedure tested (rollback.ps1 functional)
- [ ] Architecture diagram updated (if applicable)
- [ ] Known issues documented

### Sign-Off Checklist
- [ ] Tech Lead approval: _____________________ (Date: _____)
- [ ] QA Lead approval: _____________________ (Date: _____)
- [ ] Product Owner approval: _____________________ (Date: _____)
- [ ] Release Manager approval: _____________________ (Date: _____)

---

## Deployment Steps

### Step 1: Pre-Deployment Staging (30 minutes)

1. **Create Git Release Branch**
   ```powershell
   # On main/develop branch
   git checkout -b release/v2.0.0-beta
   git log --oneline -10  # Verify clean history
   ```

2. **Tag Release Commit**
   ```powershell
   git tag -a v2.0.0-beta -m "Release: Site-based attendance system"
   git tag -l  # Verify tag created
   ```

3. **Create Release Notes Branch** (optional for review)
   ```powershell
   git commit -am "docs: Release notes for v2.0.0-beta"
   git push origin release/v2.0.0-beta
   ```

### Step 2: Build & Package (45 minutes)

**For Expo/EAS Deployment**:
```powershell
# Build for preview/testing
eas build --platform android --profile preview

# OR build for production
eas build --platform android --profile production
```

**For Android APK/AAB**:
```powershell
# From project root
cd SAS/android
gradlew bundleRelease  # Creates AAB for Play Store
# OR
gradlew assembleRelease  # Creates APK for sideload
```

**Build Artifacts**:
- [ ] APK/AAB size: < 100MB
- [ ] Build log: No warnings related to core files
- [ ] Version code incremented
- [ ] SDK versions match `android/build.gradle`

### Step 3: Production Deployment (varies)

**Option A: Google Play Store**
1. [ ] Upload AAB to Play Store Console
2. [ ] Review changelog (use RELEASE_NOTES.md)
3. [ ] Select rollout: Staged (10% → 25% → 50% → 100%)
4. [ ] Monitor crash rates (first 4 hours critical)

**Option B: Direct APK Distribution**
1. [ ] Sign APK with release keystore
2. [ ] Distribute via OTA or app portal
3. [ ] Notify users of update availability
4. [ ] Monitor feedback channel

**Option C: Enterprise/MDM**
1. [ ] Upload to MDM portal
2. [ ] Set update policy (immediate or scheduled)
3. [ ] Verify device sync
4. [ ] Monitor enrollment metrics

### Step 4: Post-Deployment Monitoring (24 hours)

Monitor for first 24 hours:
- [ ] Crash rate: < 0.5% (green light)
- [ ] Time-in/out success rate: > 99%
- [ ] API errors: < 0.1%
- [ ] User complaints: Monitor support channels
- [ ] Disabled feature access: Document any unexpected behavior

**What to Watch**:
```
RED LIGHT (Immediate Rollback):
- Crash rate > 2%
- Time-in/out success < 95%
- API returns consistently fail with 500
- Storage migration corrupts user data

YELLOW LIGHT (Monitor closely):
- Geofence edge cases (out of range at boundary)
- Location permission denials
- Slow network (>5s to post)
- Disabled feature links still work (low priority)

GREEN LIGHT (Expected):
- Smooth time-in/out 95%+ success
- 0 new crash types unrelated to migration
- Storage keys successfully migrated
- Disabled features show proper "Coming Soon" message
```

---

## Rollback Procedures

### Automatic Rollback (Recommended)

**If critical issues detected:**
```powershell
# Quick rollback to previous stable version
./rollback.ps1 -Mode quick

# App will revert to previous commit automatically
# Users may need to force-quit and restart
```

### Manual Rollback

**Step 1: Identify stable commit**
```powershell
git log --oneline | grep -i "stable\|v1.9"  # Find last stable
git tag -l | sort -V | tail -5  # List 5 most recent versions
```

**Step 2: Revert to stable**
```powershell
# Option A: Soft revert (preserve all changes)
git reset --soft <stable-commit-hash>

# Option B: Hard revert (discard all changes)
git reset --hard <stable-commit-hash>
```

**Step 3: Rebuild & redeploy**
```powershell
eas build --platform android --profile production --clear-cache
```

**Step 4: Distribute new APK/AAB**
- Upload to Play Store (as new build)
- Wait for rollout approval
- Rollout to 100% if successful

---

## Communication Templates

### 1. Pre-Deployment Announcement

**To**: User Community / Support Team  
**Timing**: 24-48 hours before release  
**Subject**: SAS Mobile App v2.0.0 - Maintenance Update Coming

---

**Dear Users/Team,**

We're excited to announce a major update to the SAS Mobile App coming ${UPDATE_DATE}.

**What's Changing?**
- ✨ Faster time-in/out: No more manual branch selection
- 🎯 Automatic location detection: App finds your assigned site
- 🔒 Same security: All authentication and data protection unchanged

**What This Means For You:**
1. App will auto-update when you next launch (iOS) or from Play Store (Android)
2. You'll notice time-in/out is much faster (no modals)
3. You must allow location permission for geofence detection
4. A few features are temporarily disabled (will return in v2.1)

**Disabled Features (Temporary):**
- Duty Detail Order (DDO) export → Available in v2.1
- Overtime Request → Available in v2.1
- Attendance Change Request → Available in v2.1

**Nothing to Do:**
- Your past data is preserved
- No manual migration needed
- All settings automatically carried over

**Questions?**
See RELEASE_NOTES.md or contact: [support email]

---

### 2. Deployment Notification

**To**: Tech Team / Operations  
**Timing**: 1 hour before deployment  
**Subject**: [DEPLOYMENT] SAS v2.0.0 Rolling Out

---

**Deploying now: SAS Mobile App v2.0.0**

- **Affected Users**: All (Android/iOS)
- **Rollout**: Staged (10% → 25% → 50% → 100%)
- **Duration**: ~15 min for 10% rollout, full rollout by EOD
- **Risk**: Low (backward compatible, can rollback in 5 min)
- **Rollback**: `./rollback.ps1 -Mode quick` if issues arise

**Monitor**:
- Crash rates in Firebase Crashlytics
- API error rates in server logs
- User feedback in support channel

**Status**: Will update hourly in #deployments Slack channel

---

### 3. Post-Deployment Success Message

**To**: Stakeholders  
**Timing**: After 4+ hours monitoring  
**Subject**: ✅ SAS v2.0.0 Deployment Complete & Stable

---

**Great News!**

SAS Mobile App v2.0.0 successfully rolled out to all users.

**Metrics** (24h post-deploy):
- ✅ Crash rate: 0.2% (target: <0.5%)
- ✅ Time-in/out success: 99.5% (target: >99%)
- ✅ User feedback: Positive (3.5★ avg)
- ✅ Storage migration: 100% success

**What Users Are Seeing**:
- Faster time-in/out (no branch selection)
- Automatic site detection based on location
- All previous features working
- Disabled features show "Coming Soon" (will restore in v2.1)

**No Rollback Needed.** App is stable and ready for normal operations.

---

### 4. Issue Detected - Immediate Action

**To**: Dev Team + Release Manager  
**Timing**: Immediately upon detection  
**Subject**: 🚨 [URGENT] SAS v2.0.0 Issue - Preparing Rollback

---

**Critical Issue Detected!**

- **Issue**: [Describe crash/error]
- **Severity**: [Critical/High]
- **Impact**: [X% of users]
- **Root Cause**: [Investigation ongoing]

**Immediate Action**:
Initiating automatic rollback procedure:
```powershell
./rollback.ps1 -Mode quick
```

**Timeline**:
- T+0: Rollback initiated
- T+3: Previous version builds
- T+8: APK/AAB ready for redistribution
- T+15: Rolling back to users (staged)
- T+30: Full revert to v1.9 complete

**Next Steps**:
1. Root cause analysis (45 min)
2. Fix implementation (30 min)
3. Re-test (15 min)
4. Rebuild and re-deploy (2 hours)

Will provide update in 45 minutes.

---

### 5. Post-Issue Postmortem

**To**: Engineering Team  
**Timing**: 24-48 hours after incident  
**Subject**: Postmortem: SAS v2.0.0 Rollback & Fix

---

**Incident Summary**

| Item | Value |
|------|-------|
| Start Time | [Time] |
| Detection | [How] |
| Duration | [Mins] |
| Users Affected | [Count/Percentage] |
| Severity | [P1/P2/P3] |
| Resolution | Rolled back to v1.9 |

**Root Cause**
[Technical explanation of what failed]

**Why It Wasn't Caught**
- Pre-deployment testing didn't cover [scenario]
- Validation checklist missing item: [item]

**Improvements**
1. Add [test case] to validation suite
2. Add [monitoring] to deployment checklist
3. Add [gate] to pre-deployment validation

**Timeline** (Detailed)
- 10:30 AM - Rollout to 10%
- 10:45 AM - Crash rate detected at 2.1%
- 10:50 AM - Investigation started
- 11:00 AM - Root cause identified
- 11:05 AM - Rollback command executed
- 11:20 AM - v1.9 rolled back to 50%
- 11:35 AM - v1.9 rolled back to 100%
- 11:40 AM - Incident closed

---

## Success Criteria

### ✅ Deployment is Successful If:

1. **Technical**
   - App builds without errors: ✅
   - No new crashes post-deploy: ✅
   - Time-in/out success rate > 99%: ✅
   - API compatibility maintained: ✅

2. **User Experience**
   - Users can time in/out smoothly: ✅
   - Location permission flows clearly: ✅
   - Disabled features show helpful message: ✅
   - No unexpected UI glitches: ✅

3. **Business**
   - User testimonials positive: ✅
   - Support queue stable (no spike): ✅
   - Adoption rate > 80% in 7 days: ✅
   - Zero security issues: ✅

### ⚠️ Deployment Should Be Paused If:

1. **Critical Issues**
   - Compilation fails with TS errors
   - Time-in/out crashes > 25% of attempts
   - API returns wrong payload schema
   - Storage corruption detected

2. **Validation Failures**
   - Checkpoints in MIGRATION_VALIDATION.md fail red lights
   - Unknown third-party dependency conflicts
   - Build size exceeds limits

3. **External Blockers**
   - Backend API unstable
   - Authentication service down
   - App store submission rejected

---

## Appendices

### A. Contact List

| Role | Name | Email | Phone |
|------|------|-------|-------|
| Tech Lead | [Name] | [Email] | [Phone] |
| QA Lead | [Name] | [Email] | [Phone] |
| Product Owner | [Name] | [Email] | [Phone] |
| Release Manager | [Name] | [Email] | [Phone] |
| Backend Lead | [Name] | [Email] | [Phone] |
| DevOps | [Name] | [Email] | [Phone] |

### B. Key Metrics Dashboard

**Monitor These During Rollout**:

```
Time-In/Out Success Rate
========================
Target: > 99%       | Current: ?%
Status: [████████░░] 

Crash Rate
========================
Target: < 0.5%      | Current: ?%
Status: [█░░░░░░░░░]

API Error Rate
========================
Target: < 0.1%      | Current: ?%
Status: [██░░░░░░░░]

User Sentiment
========================
Positive feedback   | Current: ?%
Status: [███████░░░]
```

### C. Escalation Path

**If critical issue detected:**
1. Release Manager notified immediately (Slack + Call)
2. Tech Lead begins root cause analysis
3. If unresolved in 15 min → Trigger rollback
4. Post-rollback: Update stakeholders every 30 min

---

## Final Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Tech Lead | | | |
| QA Lead | | | |
| Release Manager | | | |

---

**Deployment Ready**: [DATE / TIME]  
**Expected Completion**: [DATE / TIME]  
**Rollback Window**: [HOURS] hours  
**Estimated Risk**: LOW

