import { useUser } from '@/hooks/use-auth';
import { useThemeColors } from '@/hooks/use-theme';
import attendanceService from '@/services/attendanceService';
import authService from '@/services/authService';
import eventBus from '@/services/eventBus';
import { mapRequests } from '@/services/requestMapper';
import { formatDate } from '@/services/timeService';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type ThemeShape = ReturnType<typeof useThemeColors>;

function formatToday(date = new Date()) {
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const w = weekdays[(date.getDay() + 6) % 7]; // JS week starts on Sunday
  const m = months[date.getMonth()];
  return `${w}, ${date.getDate()} ${m} ${date.getFullYear()} (today)`;
}

export default function HomeScreen() {
  const today = formatToday();
  const { userName } = useUser();
  const theme = useThemeColors();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const stylesRequest = useMemo(() => createRequestStyles(theme), [theme]);
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [clockInTime, setClockInTime] = useState('-- : -- : --');
  const [clockOutTime, setClockOutTime] = useState('-- : -- : --');
  const [siteName, setSiteName] = useState('');
  const [siteCode, setSiteCode] = useState('');
  const [shiftIn, setShiftIn] = useState('');
  const [shiftOut, setShiftOut] = useState('');
  const [provinceName, setProvinceName] = useState('');
  const [lguName, setLguName] = useState('');
  const [requests, setRequests] = useState<any[]>([]);
  const [approvedTimeInChange, setApprovedTimeInChange] = useState<string | null>(null);
  const [approvedTimeOutChange, setApprovedTimeOutChange] = useState<string | null>(null);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [showTrackingModal, setShowTrackingModal] = useState(false);
  const [trackingItem, setTrackingItem] = useState<any | null>(null);
  const appliedApprovedIdsRef = React.useRef<Set<string>>(new Set());
  const attendanceFetchSeqRef = React.useRef(0);

  // Helper to resolve reviewer display name from mapped/raw fields
  const getReviewerDisplayName = (item: any): string => {
    const raw = item?.raw || {};
    const fromFields =
      item?.reviewerName ||
      raw.reviewer_name ||
      raw.reviewed_by_name ||
      (raw.reviewer && (raw.reviewer.name || raw.reviewer.full_name)) ||
      (raw.reviewed_by_user && raw.reviewed_by_user.name);
    if (fromFields) return String(fromFields);
    // Do NOT display numeric ID; show a neutral placeholder until name is resolved
    return 'Reviewer';
  };

  useEffect(() => {
    updateTime();
    const interval = setInterval(updateTime, 1000);
    fetchTodayAttendance();
    loadChangeRequests();
    loadSiteInfo();
    // Subscribe to request/attendance events so Home refreshes immediately.
    const unsubRequests = eventBus.on('requestsUpdated', () => {
      loadChangeRequests();
    });
    const unsubAttendance = eventBus.on('attendanceUpdated', () => {
      loadSiteInfo();
      fetchTodayAttendance();
    });
    return () => {
      clearInterval(interval);
      try { if (typeof unsubRequests === 'function') unsubRequests(); } catch (e) { /* ignore */ }
      try { if (typeof unsubAttendance === 'function') unsubAttendance(); } catch (e) { /* ignore */ }
    };
  }, []);

  // Refresh attendance data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      fetchTodayAttendance();
      loadChangeRequests();
      loadSiteInfo();

      // Set up polling to refresh attendance every 5 seconds while on this screen
      const pollInterval = setInterval(() => {
        loadSiteInfo();
        fetchTodayAttendance();
        loadChangeRequests();
      }, 5000);

      return () => clearInterval(pollInterval);
    }, [])
  );

  const updateTime = () => {
    // Use device time adjusted to Asia/Manila timezone
    const now = new Date();
    
    // Format time as HH:MM
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    setCurrentTime(`${hours}:${minutes}`);
    
    // Format date as "Monday | July 03"
    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const dayName = weekdays[now.getDay()];
    const monthName = months[now.getMonth()];
    const day = now.getDate().toString().padStart(2, '0');
    setCurrentDate(`${dayName} | ${monthName} ${day}`);
  };

  // Helper function to format display time
  const formatDisplayTime = (timeStr: string | null) => {
    if (!timeStr) return '-- : -- : --';
    
    try {
      const cleaned = String(timeStr).trim();

      // Handle ISO date/time quickly
      if (cleaned.includes('T')) {
        const timePart = cleaned.split('T')[1]?.split('.')[0] || '';
        return timePart || cleaned;
      }

      // If time is in format "HH:MM:SS" or "HH:MM:SS.000000", extract HH:MM:SS
      const timePart = cleaned.split('.')[0];

      // If it's a datetime with a space, extract just the time part
      if (timePart.includes(' ')) {
        return timePart.split(' ')[1] || timePart;
      }

      return timePart;
    } catch (e) {
      console.error('Error formatting time:', e);
      return timeStr;
    }
  };

  const normalizeDateOnly = (value: any): string => {
    const raw = String(value || '').trim();
    if (!raw) return '';
    if (raw.includes('T')) return raw.split('T')[0];
    if (raw.includes(' ')) return raw.split(' ')[0];
    return raw;
  };

  const normalizeAction = (value: any): string =>
    String(value || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/-/g, '_');

  const getLogComparableTimestamp = (log: any, today: string): number => {
    const candidates = [
      log.timestamp,
      log.created_at,
      log.updated_at,
      log.datetime,
      log.date_time,
      log.time,
      log.time_in,
      log.time_out,
      log.in_time,
      log.out_time,
    ];

    for (const item of candidates) {
      if (!item) continue;
      const raw = String(item).trim();
      let isoCandidate = raw;
      if (/^\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(raw)) {
        const t = raw.split('.')[0];
        isoCandidate = `${today}T${t.length === 5 ? `${t}:00` : t}`;
      } else if (/^\d{4}-\d{2}-\d{2} /.test(raw)) {
        isoCandidate = raw.replace(' ', 'T');
      }
      const parsed = Date.parse(isoCandidate);
      if (!Number.isNaN(parsed)) return parsed;
    }

    return Number.NEGATIVE_INFINITY;
  };

  const loadSiteInfo = async () => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const [name, code, sIn, sOut, provName, lgu] = await Promise.all([
        AsyncStorage.getItem('current_site_name'),
        AsyncStorage.getItem('current_site_code'),
        AsyncStorage.getItem('current_site_shift_in'),
        AsyncStorage.getItem('current_site_shift_out'),
        AsyncStorage.getItem('current_site_province_name'),
        AsyncStorage.getItem('current_site_lgu_name'),
      ]);
      if (name) setSiteName(name);
      if (code) setSiteCode(code);
      if (sIn) setShiftIn(sIn);
      if (sOut) setShiftOut(sOut);
      if (provName) setProvinceName(provName);
      if (lgu) setLguName(lgu);
    } catch (e) {
      console.warn('[Home] loadSiteInfo error', e);
    }
  };

  const fetchTodayAttendance = async () => {
    const fetchSeq = ++attendanceFetchSeqRef.current;
    try {
      const userData = await authService.getUserData();
      const isGuest = userData?.is_guest === 'true';
      if (!userData.access_token || !userData.employee_id) {
        if (!isGuest) {
          console.log('No user data available');
          return;
        }
      }

      const today = formatDate(new Date());
      console.log('DEBUG: Fetching attendance for employee_id=', userData.employee_id, 'date=', today, 'isGuest=', isGuest);
      
      if (fetchSeq !== attendanceFetchSeqRef.current) return;

      let approvedTimeInRequest: any = null;
      let approvedTimeOutRequest: any = null;

      // Check for approved change requests for today
      if (!isGuest) {
        const changeRequestResult = await attendanceService.getChangeRequests(Number(userData.employee_id), today);
        console.log('DEBUG: Change request result:', JSON.stringify(changeRequestResult));
        if (changeRequestResult?.success) {
        let apiRequests: any[] = [];
        if (Array.isArray(changeRequestResult.data)) {
          apiRequests = changeRequestResult.data;
        } else if (changeRequestResult.data && Array.isArray(changeRequestResult.data.data)) {
          apiRequests = changeRequestResult.data.data;
        } else if (changeRequestResult.data && typeof changeRequestResult.data === 'object') {
          apiRequests = [changeRequestResult.data];
        }

        console.log('DEBUG: Processing', apiRequests.length, 'change requests');

        // Find approved time in/out change requests for today
        for (const req of apiRequests) {
          console.log('DEBUG: Full Request:', JSON.stringify(req));
          if (req && typeof req === 'object') {
            // Extract date - handle both "YYYY-MM-DD" and "YYYY-MM-DDTHH:MM:SS" formats
            let reqDate = (req.date || '').toString();
            if (reqDate.includes('T')) {
              reqDate = reqDate.split('T')[0]; // ISO format: split by 'T'
            } else if (reqDate.includes(' ')) {
              reqDate = reqDate.split(' ')[0]; // Space format: split by space
            }
            
            const reqStatus = (req.status || '').toString().toLowerCase();
            const reqAction = (req.action || '').toString().toLowerCase();
            
            console.log('DEBUG: Parsed values:');
            console.log('  - Request date:', reqDate);
            console.log('  - Today:', today);
            console.log('  - Date match:', reqDate === today);
            console.log('  - Status (raw):', req.status);
            console.log('  - Status (lower):', reqStatus);
            console.log('  - Status is approved:', reqStatus === 'approved');
            console.log('  - Action (raw):', req.action);
            console.log('  - Action (lower):', reqAction);
            console.log('  - Requested time:', req.requested_time);
            
            if (reqDate === today && reqStatus === 'approved') {
              if (reqAction === 'time_in' && !approvedTimeInRequest) {
                approvedTimeInRequest = req;
                console.log('Γ£ô DEBUG: Found approved TIME_IN request:', req.requested_time);
              } else if (reqAction === 'time_out' && !approvedTimeOutRequest) {
                approvedTimeOutRequest = req;
                console.log('Γ£ô DEBUG: Found approved TIME_OUT request:', req.requested_time);
              }
            } else {
              console.log('Γ£ù DEBUG: Request not matched - Date match:', reqDate === today, 'Status match:', reqStatus === 'approved');
            }
          }
        }
        
        console.log('DEBUG: Final approved requests - TimeIn:', approvedTimeInRequest?.requested_time, 'TimeOut:', approvedTimeOutRequest?.requested_time);

        // Auto-apply approved requests to DB so changes persist beyond UI override
        const applyIfNeeded = async (approvedReq: any) => {
          try {
            const requestId = String(approvedReq.id || approvedReq.request_id || '');
            if (!requestId || appliedApprovedIdsRef.current.has(requestId)) return;
            const reqAction = (approvedReq.action || '').toString().toLowerCase();
            if (reqAction !== 'time_in' && reqAction !== 'time_out') return;

            const attendanceInfo = await attendanceService.getAttendanceForDate(today, true);
            const branchId = attendanceInfo?.branchId || 0;
            const guardAttendanceId = reqAction === 'time_in' ? attendanceInfo?.timeInId : attendanceInfo?.timeOutId;
            const requestedTime = String(approvedReq.requested_time || approvedReq.time || '').trim();

            if (!requestedTime) return; // nothing to apply

            const applyRes = await attendanceService.applyApprovedChangeRequest({
              requestId,
              employeeId: Number(userData.employee_id),
              branchId: Number(branchId || 0),
              date: formatDate(new Date()),
              action: reqAction,
              requestedTime,
              guardAttendanceId: guardAttendanceId ? Number(guardAttendanceId) : undefined,
            });
            console.log('Home auto-apply result =>', applyRes);
            if (applyRes?.success) appliedApprovedIdsRef.current.add(requestId);
          } catch (e) {
            console.log('Home auto-apply error', e);
          }
        };
        if (approvedTimeInRequest) await applyIfNeeded(approvedTimeInRequest);
        if (approvedTimeOutRequest) await applyIfNeeded(approvedTimeOutRequest);
        }
      }

      // Use the attendance logs API - fetch only today's data
      const result = await authService.getTimeEntryHistory(
        parseInt(userData.employee_id),
        userData.access_token || ''
      );

      console.log('DEBUG: Attendance logs API result:', JSON.stringify(result));

      if (result.success && result.data && result.data.length > 0) {
        const attendanceLogs = result.data;
        
        // Find time in and time out actions for today ONLY
        let latestTimeIn = null;
        let latestTimeOut = null;
        
        // Strictly filter records for today only
        const todayLogs = attendanceLogs.filter((log: any) => {
          const logDate = normalizeDateOnly(log.date || log.attendance_date || log.timestamp || log.created_at);
          return logDate === today;
        });

        console.log('DEBUG: Total logs received:', attendanceLogs.length, 'Today only:', todayLogs.length);

        // Extract province/LGU/site info from any of today's logs and update display state
        for (const log of todayLogs) {
          const pName = log.province_name ?? log.province?.name ?? null;
          const lName = log.lgu_name ?? log.lgu?.name ?? log.lgu?.city_name ?? log.city_name ?? null;
          const sName = log.site_name ?? log.site?.name ?? null;
          const sIn   = log.shift_in ?? null;
          const sOut  = log.shift_out ?? null;
          if (pName) { setProvinceName(pName); }
          if (lName) { setLguName(lName); }
          if (sName) { setSiteName(sName); }
          if (sIn)   { setShiftIn(sIn); }
          if (sOut)  { setShiftOut(sOut); }
          // Persist to AsyncStorage so the card shows even before an API response
          try {
            const AS = require('@react-native-async-storage/async-storage').default;
            if (pName) await AS.setItem('current_site_province_name', pName);
            if (lName) await AS.setItem('current_site_lgu_name', lName);
            if (sName) await AS.setItem('current_site_name', sName);
            if (sIn)   await AS.setItem('current_site_shift_in', sIn);
            if (sOut)  await AS.setItem('current_site_shift_out', sOut);
          } catch (_) { /* ignore */ }
          if (pName || lName || sName) break; // got what we need
        }

        // Process only today's logs to find the latest TIME_IN and TIME_OUT
        for (const log of todayLogs) {
          const action = normalizeAction(log.action);
          const isTimeIn = action === 'time_in' || action === 'in' || action === 'clock_in';
          const isTimeOut = action === 'time_out' || action === 'out' || action === 'clock_out';
          const logTime =
            log.time ||
            log.time_in ||
            log.time_out ||
            log.in_time ||
            log.out_time ||
            log.timestamp ||
            log.created_at ||
            null;

          const ts = getLogComparableTimestamp(log, today);

          if (isTimeIn) {
            const currentBest = latestTimeIn
              ? getLogComparableTimestamp({ time: latestTimeIn }, today)
              : Number.NEGATIVE_INFINITY;
            if (ts >= currentBest) {
              latestTimeIn = logTime;
            }
          } else if (isTimeOut) {
            const currentBest = latestTimeOut
              ? getLogComparableTimestamp({ time: latestTimeOut }, today)
              : Number.NEGATIVE_INFINITY;
            if (ts >= currentBest) {
              latestTimeOut = logTime;
            }
          }
        }

        // Only update state if we have actual data
        let formattedTimeIn = formatDisplayTime(latestTimeIn);
        let formattedTimeOut = formatDisplayTime(latestTimeOut);
        
        console.log('DEBUG: Before override - TimeIn:', formattedTimeIn, 'TimeOut:', formattedTimeOut);
        
        // Override with approved change request time if available
        if (approvedTimeInRequest && approvedTimeInRequest.requested_time) {
          formattedTimeIn = formatDisplayTime(approvedTimeInRequest.requested_time);
          setApprovedTimeInChange(approvedTimeInRequest.requested_time);
          console.log('Γ£ô DEBUG: Overriding TimeIn with approved request:', formattedTimeIn);
        } else {
          setApprovedTimeInChange(null);
          console.log('Γ£ù DEBUG: No approved TimeIn request to override');
        }
        
        if (approvedTimeOutRequest && approvedTimeOutRequest.requested_time) {
          formattedTimeOut = formatDisplayTime(approvedTimeOutRequest.requested_time);
          setApprovedTimeOutChange(approvedTimeOutRequest.requested_time);
          console.log('Γ£ô DEBUG: Overriding TimeOut with approved request:', formattedTimeOut);
        } else {
          setApprovedTimeOutChange(null);
          console.log('Γ£ù DEBUG: No approved TimeOut request to override');
        }
        
        if (fetchSeq !== attendanceFetchSeqRef.current) return;
        
        // Always compare cache vs API; cache wins if it is more recent (API may lag behind)
        try {
          const AS = require('@react-native-async-storage/async-storage').default;
          const cachedInDate = await AS.getItem('last_time_in_date');
          if (cachedInDate === today) {
            const cachedIn = await AS.getItem('last_time_in');
            if (cachedIn) {
              const cachedTs = getLogComparableTimestamp({ time: cachedIn }, today);
              const apiTs    = latestTimeIn ? getLogComparableTimestamp({ time: latestTimeIn }, today) : Number.NEGATIVE_INFINITY;
              if (cachedTs >= apiTs) {
                latestTimeIn = cachedIn;
                formattedTimeIn = formatDisplayTime(cachedIn);
              }
            }
          }
          const cachedOutDate = await AS.getItem('last_time_out_date');
          if (cachedOutDate === today) {
            const cachedOut = await AS.getItem('last_time_out');
            if (cachedOut) {
              const cachedTs = getLogComparableTimestamp({ time: cachedOut }, today);
              const apiTs    = latestTimeOut ? getLogComparableTimestamp({ time: latestTimeOut }, today) : Number.NEGATIVE_INFINITY;
              if (cachedTs >= apiTs) {
                latestTimeOut = cachedOut;
                formattedTimeOut = formatDisplayTime(cachedOut);
              }
            }
          }
        } catch (_) { /* ignore */ }

        // Always update both time displays (use '-- : -- : --' if truly nothing found)
        setClockInTime(latestTimeIn ? formattedTimeIn : '-- : -- : --');
        setClockOutTime(latestTimeOut ? formattedTimeOut : '-- : -- : --');

        console.log('DEBUG: Updated times - Time In:', latestTimeIn, 'Time Out:', latestTimeOut);
        console.log('DEBUG: Final displayed times - Time In:', formattedTimeIn, 'Time Out:', formattedTimeOut);
      } else {
        console.log('DEBUG: No attendance data found. Message:', result.message);

        // Fall back to locally cached times written by _layout.tsx after a successful time-in/out
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const cachedDate = await AsyncStorage.getItem('last_time_in_date');
          if (cachedDate === today) {
            const cachedIn = await AsyncStorage.getItem('last_time_in');
            if (cachedIn) {
              setClockInTime(formatDisplayTime(cachedIn));
              console.log('DEBUG: Set time in from local cache:', cachedIn);
            }
          }
          const cachedOutDate = await AsyncStorage.getItem('last_time_out_date');
          if (cachedOutDate === today) {
            const cachedOut = await AsyncStorage.getItem('last_time_out');
            if (cachedOut) {
              setClockOutTime(formatDisplayTime(cachedOut));
              console.log('DEBUG: Set time out from local cache:', cachedOut);
            }
          }
        } catch (e) {
          console.warn('DEBUG: Could not read cached times:', e);
        }

        // Even if no attendance data, check if we have approved change requests to display
        if (fetchSeq !== attendanceFetchSeqRef.current) return;
        if (approvedTimeInRequest && approvedTimeInRequest.requested_time) {
          const formattedTimeIn = formatDisplayTime(approvedTimeInRequest.requested_time);
          setClockInTime(formattedTimeIn);
          setApprovedTimeInChange(approvedTimeInRequest.requested_time);
          console.log('DEBUG: Set time in from approved request (no attendance):', formattedTimeIn);
        }
        
        if (approvedTimeOutRequest && approvedTimeOutRequest.requested_time) {
          const formattedTimeOut = formatDisplayTime(approvedTimeOutRequest.requested_time);
          setClockOutTime(formattedTimeOut);
          setApprovedTimeOutChange(approvedTimeOutRequest.requested_time);
          console.log('DEBUG: Set time out from approved request (no attendance):', formattedTimeOut);
        }
      }
    } catch (error) {
      console.error('DEBUG: Error fetching attendance:', error);
    }
  };

  const loadChangeRequests = async () => {
    try {
      const user = await authService.getUserData();
      if (user?.is_guest === 'true') {
        setRequests([]);
        return;
      }
      const employeeId = Number(user?.employee_id || 0);
      if (!employeeId) return;

      const result = await attendanceService.getChangeRequests(employeeId);
      let apiRequests: any[] = [];
      if (result?.success) {
        if (Array.isArray(result.data)) {
          apiRequests = apiRequests.concat(result.data);
        } else if (result.data && Array.isArray(result.data.data)) {
          apiRequests = apiRequests.concat(result.data.data);
        } else if (result.data && typeof result.data === 'object') {
          apiRequests.push(result.data);
        }
      }

      // Also fetch OT requests using authenticated endpoint and merge (some backends require auth)
      try {
        const otRes = await attendanceService.fetchOtRequests(employeeId);
        if (otRes?.success) {
          if (Array.isArray(otRes.data)) {
            apiRequests = apiRequests.concat(otRes.data);
          } else if (otRes.data && Array.isArray(otRes.data.data)) {
            apiRequests = apiRequests.concat(otRes.data.data);
          } else if (otRes.data && typeof otRes.data === 'object') {
            apiRequests.push(otRes.data);
          }
        }
      } catch (e) {
        console.log('DEBUG: fetchOtRequests failed', e);
      }

      if (apiRequests.length > 0) {
        // Map and normalize requests (includes OT) and sort newest-first
        const mapped = mapRequests(apiRequests);

        // Pre-resolve reviewer names from reviewed_by IDs to avoid placeholders
        try {
          const userData = await authService.getUserData();
          const token = userData?.access_token || undefined;
          const idSet = new Set<string>();
          for (const m of mapped) {
            const reviewerId = String(m?.reviewedBy || (m?.raw && m.raw.reviewed_by) || '')?.trim();
            if (reviewerId && !m.reviewerName) idSet.add(reviewerId);
          }
          if (idSet.size > 0) {
            const ids = Array.from(idSet);
            const lookups = await Promise.all(ids.map(async (id) => {
              try {
                const res = await authService.getUserById(Number(id), token);
                return [id, res?.name || ''] as [string, string];
              } catch {
                return [id, ''] as [string, string];
              }
            }));
            const nameMap = new Map<string, string>(lookups);
            for (const m of mapped) {
              const reviewerId = String(m?.reviewedBy || (m?.raw && m.raw.reviewed_by) || '')?.trim();
              if (reviewerId && !m.reviewerName) {
                const nm = nameMap.get(reviewerId);
                if (nm) m.reviewerName = nm;
              }
            }
          }
        } catch (e) {
          // silent
        }

        const displayMapped = mapped.map((m: any) => ({ ...m, date: formatDateReadable(m.date) }));
        setRequests(displayMapped);
      } else {
        // no requests found
        setRequests([]);
      }
    } catch (e) {
      console.error('Error loading requests:', e);
    } finally {
      setLoadingRequests(false);
    }
  };

  // When tracking modal opens, if we only have reviewer ID, attempt to resolve name via API
  useEffect(() => {
    const resolveReviewerName = async () => {
      if (!showTrackingModal || !trackingItem) return;
      const raw = trackingItem?.raw || {};
      const hasName = !!(
        trackingItem?.reviewerName ||
        raw.reviewer_name ||
        raw.reviewed_by_name ||
        (raw.reviewer && (raw.reviewer.name || raw.reviewer.full_name)) ||
        (raw.reviewed_by_user && raw.reviewed_by_user.name)
      );
      const reviewerId = raw.reviewed_by || trackingItem?.reviewedBy || trackingItem?.reviewerId;
      if (hasName || !reviewerId) return;
      try {
        const userData = await authService.getUserData();
        console.log('DEBUG: Resolving reviewer by ID', reviewerId);
        const res = await authService.getUserById(String(reviewerId), userData.access_token || undefined);
        if (res?.success && res?.name) {
          setTrackingItem((prev: any) => ({ ...(prev || {}), reviewerName: res.name }));
          console.log('DEBUG: Resolved reviewer name', res.name);
        }
      } catch (e) {
        // ignore lookup failures
        console.log('DEBUG: Reviewer name lookup failed', e);
      }
    };
    resolveReviewerName();
  }, [showTrackingModal, trackingItem]);

  const formatDateReadable = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      const s = String(dateStr).trim();
      const d = s.length === 10 ? new Date(s + 'T00:00:00') : new Date(s);
      if (isNaN(d.getTime())) return s.split('T')[0] || s;
      const month = d.toLocaleString('en-US', { month: 'short' });
      const day = d.getDate();
      const year = d.getFullYear();
      return `${month} ${day}, ${year}`;
    } catch (e) {
      return String(dateStr);
    }
  };

  const renderStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
      Pending: { bg: '#FFF3CD', color: '#856404', icon: 'time-outline' },
      Approved: { bg: '#E8F5E9', color: '#2E7D32', icon: 'checkmark-circle-outline' },
      Declined: { bg: '#F8D7DA', color: '#721C24', icon: 'close-circle-outline' },
      Disapproved: { bg: '#F8D7DA', color: '#721C24', icon: 'close-circle-outline' },
    };
    const normalized = status === 'Disapproved' ? 'Declined' : status;
    const style = config[normalized] || config['Pending'];
    return (
      <View style={[stylesRequest.statusBadge, { backgroundColor: style.bg }]}> 
        <Ionicons name={style.icon} size={14} color={style.color} />
        <Text style={[stylesRequest.statusText, { color: style.color }]}>{status}</Text>
      </View>
    );
  };

  const getRequestCardBorderColor = (status: string) => {
    switch (status) {
      case 'Pending': return '#F59E0B'; // Orange
      case 'Approved': return '#10B981'; // Green
      case 'Declined': return '#EF4444'; // Red
      default: return '#F59E0B'; // Default to orange for pending
    }
  };
   
  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 100 }}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.welcomeText}>
          <Text style={styles.welcomeLabel}>Welcome, </Text>
          <Text style={styles.userName}>{userName || 'Guest'}</Text>
        </Text>
        
        <View style={styles.timeContainer}>
          <Text style={styles.timeText}>{currentTime}</Text>
          <Text style={styles.dateText}>{currentDate}</Text>
          
          <View style={styles.timeCard}>
            {/* Site / location info */}
            {(lguName || siteName) ? (
              <View style={styles.siteInfoSection}>
                {lguName ? (
                  <Text style={styles.siteCity}>{lguName}</Text>
                ) : null}
                {provinceName ? (
                  <Text style={styles.siteProvince}>{provinceName}</Text>
                ) : null}
                {(siteCode || siteName) ? (
                  <View style={styles.siteNameRow}>
                    <Ionicons name="location-outline" size={14} color={theme.muted} />
                    <Text style={styles.siteNameText} numberOfLines={1}>
                      {siteCode && siteName ? `${siteCode} - ${siteName}` : siteCode || siteName}
                    </Text>
                  </View>
                ) : null}
                {(shiftIn || shiftOut) ? (
                  <Text style={styles.shiftTimeText}>
                    Shift Time ({shiftIn || '--'} - {shiftOut || '--'})
                  </Text>
                ) : null}
                <View style={styles.siteInfoDivider} />
              </View>
            ) : null}
            <View style={styles.clockInOutContainer}>
            <View style={styles.clockInOutItem}>
              <Text style={styles.clockInOutLabel}>Time In</Text>
              <Text style={clockInTime === '-- : -- : --' ? styles.clockInOutValueGrey : styles.clockInOutValueGreen}>
                {clockInTime} 
              </Text>
            </View>
            
            <View style={styles.clockDivider} />
            
            <View style={styles.clockInOutItem}>
              <Text style={styles.clockInOutLabel}>Time Out</Text>
              <Text style={clockOutTime === '-- : -- : --' ? styles.clockInOutValueGrey : styles.clockInOutValueGreen}>
                {clockOutTime}
              </Text>
            </View>
          </View>
          </View>
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {requests.length > 0 && (
          <View style={stylesRequest.requestSection}>
            <View style={stylesRequest.sectionHeader}>
              <Ionicons name="list" size={22} color={theme.primary} />
              <Text style={stylesRequest.sectionTitle}>Requests</Text>
            </View>
            {loadingRequests ? (
              <View style={stylesRequest.loadingContainer}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={stylesRequest.loadingText}>Loading...</Text>
              </View>
            ) : (
              <FlatList
                data={requests}
                keyExtractor={(item: any) => String(item.id)}
                scrollEnabled={false}
                renderItem={({ item }: { item: any }) => (
                  <TouchableOpacity
                    style={[stylesRequest.requestCard, { borderLeftColor: getRequestCardBorderColor(item.status) }]}
                    activeOpacity={0.85}
                    onPress={() => { console.log('Request pressed', item.id); setTrackingItem(item); setShowTrackingModal(true); }}
                  >
                    <View style={stylesRequest.requestHeader}>
                      <View style={stylesRequest.requestTypeContainer}>
                        <Ionicons
                          name={item.iconName || 'list'}
                          size={20}
                          color={item.iconColor || theme.text}
                        />
                        <Text style={stylesRequest.requestType}>{item.type}</Text>
                      </View>
                      {renderStatusBadge(item.status)}
                    </View>
                    <View style={stylesRequest.requestBody}>
                      <View style={stylesRequest.requestRow}>
                        <Text style={stylesRequest.requestLabel}>Date:</Text>
                        <Text style={stylesRequest.requestValue}>{item.date}</Text>
                      </View>
                      <View style={stylesRequest.requestRow}>
                        <Text style={stylesRequest.requestLabel}>Requested Time:</Text>
                        <Text style={[stylesRequest.requestValue, stylesRequest.highlightedValue]}>
                          {item.requestedTime}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}
      </View>
    {/* Tracking modal */}
    <Modal visible={showTrackingModal} transparent animationType="slide" onRequestClose={() => setShowTrackingModal(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Request Tracking</Text>
            <TouchableOpacity onPress={() => setShowTrackingModal(false)}>
              <Ionicons name="close" size={20} color={theme.muted} />
            </TouchableOpacity>
          </View>
          {trackingItem ? (
            <View>
              <View style={styles.modalSummaryCard}>
                <Text style={styles.modalSummaryLabel}>Requested Date</Text>
                <Text style={styles.modalSummaryValue}>{trackingItem.date || '--'}</Text>
                <Text style={[styles.modalSummaryLabel, { marginTop: 8 }]}>Requested Time</Text>
                <Text style={styles.modalSummaryValue}>{trackingItem.requestedTime || '--'}</Text>
              </View>

              <View>
                <View style={styles.modalTimelineRow}>
                  <View style={styles.modalTimelineTrack}>
                    <View style={[styles.modalTimelineDot, { backgroundColor: theme.primary }]} />
                    <View style={styles.modalTimelineLine} />
                  </View>
                  <View style={styles.modalTimelineContent}>
                    <Text style={styles.modalTimelineTitle}>Requested</Text>
                    <Text style={styles.modalTimelineSubtitle}>{trackingItem.reason || 'No reason provided'}</Text>
                  </View>
                </View>

                {trackingItem.status ? (
                  <View style={styles.modalTimelineRow}>
                    <View style={styles.modalTimelineTrack}>
                      <View
                        style={[
                          styles.modalTimelineDot,
                          { backgroundColor: trackingItem.status === 'Approved' ? theme.success : theme.danger },
                        ]}
                      />
                    </View>
                    <View style={styles.modalTimelineContent}>
                      <Text style={styles.modalTimelineTitle}>{trackingItem.status}</Text>
                      <View style={styles.modalApproverRow}>
                        <Ionicons name="person-circle" size={28} color={theme.secondaryText} />
                        <View style={styles.modalApproverDetails}>
                          <Text style={styles.modalApproverName}>{getReviewerDisplayName(trackingItem)}</Text>
                        </View>
                      </View>
                      {/* Reviewer Notes follow below */}
                      {(trackingItem.reviewerNotes || (trackingItem.raw && (trackingItem.raw.reviewer_notes || trackingItem.raw.reviewerNotes))) ? (
                        <>
                          <Text style={styles.modalTimelineTitle}>Reviewer Notes</Text>
                          <Text style={styles.modalTimelineSubtitle}>
                            {trackingItem.reviewerNotes || (trackingItem.raw && (trackingItem.raw.reviewer_notes || trackingItem.raw.reviewerNotes))}
                          </Text>
                        </>
                      ) : null}
                    </View>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </Modal>
    </ScrollView>
  );
}

const createStyles = (theme: ThemeShape) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: theme.background },
    header: {
      paddingTop: 60,
      paddingHorizontal: 20,
      paddingBottom: 20,
      backgroundColor: theme.background,
      alignItems: 'center',
    },
    welcomeText: {
      fontSize: 20,
      marginBottom: 6,
      fontFamily: 'Poppins',
      color: theme.secondaryText,
    },
    welcomeLabel: {
      color: theme.primary,
      fontWeight: '700',
      fontFamily: 'Poppins',
    },
    userName: {
      color: theme.text,
      fontWeight: '700',
      fontFamily: 'Poppins',
    },
    timeContainer: {
      marginTop: 25,
      alignItems: 'center',
    },
    timeText: {
      fontSize: 40,
      fontWeight: '600',
      color: theme.text,
      fontFamily: 'Poppins',
      marginBottom: 4,
    },
    dateText: {
      fontSize: 14,
      color: theme.muted,
      fontFamily: 'Poppins',
      fontWeight: '600',
      marginBottom: 20,
    },
    timeCard: {
      borderWidth: 1.5,
      borderColor: theme.primary,
      borderRadius: 16,
      padding: 20,
      backgroundColor: theme.card,
      width: '100%',
      maxWidth: 340,
      shadowColor: theme.cardShadow,
      shadowOpacity: theme.scheme === 'dark' ? 0.45 : 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: theme.scheme === 'dark' ? 10 : 5,
    },
    clockInOutContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    clockInOutItem: {
      alignItems: 'center',
      paddingHorizontal: 20,
    },
    clockInOutLabel: {
      fontSize: 14,
      color: theme.muted,
      fontFamily: 'Poppins',
      fontWeight: '500',
      marginBottom: 8,
    },
    clockInOutValueGreen: {
      fontSize: 25,
      color: theme.success,
      fontFamily: 'Poppins',
      fontWeight: '700',
      letterSpacing: 1,
    },
    clockInOutValueGrey: {
      fontSize: 20,
      color: theme.muted,
      fontFamily: 'Poppins',
      fontWeight: '700',
      letterSpacing: 1.5,
    },
    clockInOutValueOrange: {
      fontSize: 25,
      color: theme.warning,
      fontFamily: 'Poppins',
      fontWeight: '700',
      letterSpacing: 1,
    },
    clockInOutValueRed: {
      fontSize: 25,
      color: theme.danger,
      fontFamily: 'Poppins',
      fontWeight: '700',
      letterSpacing: 1,
    },
    clockDivider: {
      width: 1,
      height: 50,
      backgroundColor: theme.border,
    },
    siteInfoSection: {
      alignItems: 'center',
      marginBottom: 12,
    },
    siteCity: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
      fontFamily: 'Poppins',
      textAlign: 'center',
    },
    siteProvince: {
      fontSize: 15,
      fontWeight: '600',
      fontFamily: 'Poppins',
      marginBottom: 6,
      textAlign: 'center',
    },
    siteNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 4,
    },
    siteNameText: {
      fontSize: 18,
      color: theme.text,
      fontFamily: 'Poppins',
      fontWeight: '700',
      flexShrink: 1,
    },
    shiftTimeText: {
      fontSize: 12,
      color: theme.muted,
      fontFamily: 'Poppins',
      marginBottom: 4,
      textAlign: 'center',
    },
    siteInfoDivider: {
      width: '100%',
      height: 1,
      backgroundColor: theme.border,
      marginTop: 8,
      marginBottom: 12,
    },
    content: { padding: 20, flex: 1 },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 16,
      letterSpacing: 0.2,
      fontFamily: 'Poppins',
    },
    card: {
      backgroundColor: theme.card,
      borderRadius: 16,
      shadowColor: theme.cardShadow,
      shadowOpacity: theme.scheme === 'dark' ? 0.45 : 0.1,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: theme.scheme === 'dark' ? 10 : 6,
      overflow: 'hidden',
    },
    cardHeader: {
      padding: 20,
      backgroundColor: theme.card,
    },
    cardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    calendarIconContainer: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: theme.scheme === 'dark' ? 'rgba(79, 155, 255, 0.25)' : theme.ripple,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    calendarIcon: { fontSize: 16, color: theme.primary },
    cardDateText: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
      flex: 1,
      letterSpacing: 0.2,
      fontFamily: 'Poppins',
    },
    shiftText: {
      fontSize: 13,
      color: theme.muted,
      fontWeight: '500',
      marginLeft: 44,
      fontFamily: 'Poppins',
    },
    divider: {
      height: 1,
      backgroundColor: theme.border,
      marginHorizontal: 20,
    },
    clockSection: {
      padding: 20,
    },
    clockRow: { flexDirection: 'row', alignItems: 'center' },
    clockItem: {
      flex: 1,
      alignItems: 'center',
    },
    clockLabel: {
      fontSize: 12,
      color: theme.muted,
      fontWeight: '600',
      marginBottom: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontFamily: 'Poppins',
    },
    clockValueGreen: {
      fontSize: 20,
      letterSpacing: 1.5,
      color: theme.success,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      fontFamily: 'Poppins',
    },
    clockValueGrey: {
      fontSize: 20,
      letterSpacing: 1.5,
      color: theme.muted,
      fontWeight: '800',
      fontVariant: ['tabular-nums'],
      fontFamily: 'Poppins',
    },
    separator: {
      width: 1,
      height: 60,
      backgroundColor: theme.border,
      marginHorizontal: 20,
    },
    statusIndicator: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.success,
      marginTop: 8,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.overlay,
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: theme.card,
      padding: 16,
      borderTopLeftRadius: 12,
      borderTopRightRadius: 12,
      maxHeight: '75%',
      shadowColor: theme.cardShadow,
      shadowOpacity: theme.scheme === 'dark' ? 0.45 : 0.2,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: -4 },
      elevation: theme.scheme === 'dark' ? 20 : 10,
    },
    modalHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
    },
    modalSummaryCard: {
      backgroundColor: theme.surface,
      padding: 10,
      borderRadius: 10,
      marginBottom: 10,
    },
    modalSummaryLabel: {
      fontSize: 12,
      color: theme.muted,
      fontWeight: '600',
    },
    modalSummaryValue: {
      fontSize: 14,
      color: theme.text,
      fontWeight: '700',
      marginTop: 4,
    },
    modalTimelineRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    modalTimelineTrack: {
      width: 36,
      alignItems: 'center',
    },
    modalTimelineDot: {
      width: 12,
      height: 12,
      borderRadius: 8,
      marginTop: 6,
    },
    modalTimelineLine: {
      width: 2,
      flex: 1,
      backgroundColor: theme.border,
      marginTop: 6,
    },
    modalTimelineContent: {
      flex: 1,
      paddingLeft: 8,
    },
    modalTimelineTitle: {
      fontWeight: '700',
      color: theme.text,
    },
    modalTimelineSubtitle: {
      color: theme.muted,
      marginTop: 4,
    },
    modalApproverRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 6,
    },
    modalApproverDetails: {
      marginLeft: 8,
    },
    modalApproverName: {
      fontWeight: '700',
      color: theme.text,
    },
    modalApproverMeta: {
      color: theme.muted,
      marginTop: 4,
      fontSize: 12,
    },
  });

const createRequestStyles = (theme: ThemeShape) =>
  StyleSheet.create({
    requestSection: {
      marginTop: -15,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
      marginLeft: 10,
      fontFamily: 'Poppins',
    },
    loadingContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    loadingText: {
      marginLeft: 10,
      fontSize: 14,
      color: theme.muted,
      fontFamily: 'Poppins',
    },
    requestCard: {
      backgroundColor: theme.card,
      borderRadius: 10,
      padding: 10,
      marginBottom: 12,
      borderLeftWidth: 10,
      borderLeftColor: theme.primary,
      shadowColor: theme.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.scheme === 'dark' ? 0.4 : 0.1,
      shadowRadius: 6,
      elevation: theme.scheme === 'dark' ? 6 : 2,
    },
    requestHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 5,
    },
    requestTypeContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    requestType: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
      marginLeft: 8,
      fontFamily: 'Poppins',
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 20,
      gap: 4,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '700',
      fontFamily: 'Poppins',
    },
    requestBody: {
      gap: 7,
    },
    requestRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    requestLabel: {
      fontSize: 12,
      color: theme.muted,
      fontWeight: '600',
      fontFamily: 'Poppins',
    },
    requestValue: {
      fontSize: 12,
      color: theme.text,
      fontWeight: '700',
      fontFamily: 'Poppins',
    },
    highlightedValue: {
      color: theme.secondaryText,
      fontSize: 13,
      fontWeight: '700',
    },
    requestReason: {
      fontSize: 13,
      color: theme.secondaryText,
      lineHeight: 20,
      marginTop: 4,
      fontFamily: 'Poppins',
    },
  });
