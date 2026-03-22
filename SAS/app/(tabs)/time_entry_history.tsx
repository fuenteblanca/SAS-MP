import authService from '@/services/authService';
import branchService from '@/services/branchService';
import siteService from '@/services/siteService';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar } from 'react-native-calendars';

function formatDateISO(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDisplayHMS(timeStr?: string | null) {
  if (!timeStr) return '— : — : —';
  try {
    let s = String(timeStr).trim();
    if (s.includes(' ')) s = s.split(' ')[1];
    if (s.includes('.')) s = s.split('.')[0];
    if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
    if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
    return s || '— : — : —';
  } catch {
    return '— : — : —';
  }
}

function normalizeAction(value: any): string {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-/g, '_');
}

export default function TimeEntryHistoryScreen() {
  const router = useRouter();
  const today = formatDateISO(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [markedDates, setMarkedDates] = useState<any>({ [today]: { selected: true, selectedColor: '#F6B91E' } });
  const [latestIn, setLatestIn] = useState<string | null>(null);
  const [latestOut, setLatestOut] = useState<string | null>(null);
  const [shiftInTime, setShiftInTime] = useState<string | null>(null);
  const [shiftOutTime, setShiftOutTime] = useState<string | null>(null);
  const [selectedDateSite, setSelectedDateSite] = useState<string>('N/A');
  const [refreshTick, setRefreshTick] = useState(0);

  useFocusEffect(
    React.useCallback(() => {
      setRefreshTick((prev) => prev + 1);
    }, [])
  );

  useEffect(() => {
    // Load branch shift times from storage
    (async () => {
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const now = new Date();
        const isWeekend = now.getDay() === 0 || now.getDay() === 6;
        const inKey = isWeekend ? 'branch_weekend_in' : 'branch_weekday_in';
        const outKey = isWeekend ? 'branch_weekend_out' : 'branch_weekday_out';
        const inVal = await AsyncStorage.getItem(inKey);
        const outVal = await AsyncStorage.getItem(outKey);
        setShiftInTime(inVal);
        setShiftOutTime(outVal);
      } catch {
        // ignore
      }
    })();
  }, []);



  useEffect(() => {
    // Fetch month logs and mark dates
    const fetchMonth = async () => {
      try {
        const user = await authService.getUserData();
        const isGuest = user?.is_guest === 'true';
        if (!user?.employee_id || (!isGuest && !user?.access_token)) return;
        const d = new Date(selectedDate);
        const first = new Date(d.getFullYear(), d.getMonth(), 1);
        const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        const fmt = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
        const start = fmt(first);
        const end = fmt(last);
        const res = await authService.getTimeEntryHistory(Number(user.employee_id), user.access_token || '', start, end);
        const next: any = {};
        if (res?.success && Array.isArray(res.data)) {
          const byDate: Record<string, { in?: string; out?: string }> = {};
          for (const log of res.data) {
            const date = (log.date || log.attendance_date || '').toString();
            const dateOnly = date.includes('T') ? date.split('T')[0] : (date.includes(' ') ? date.split(' ')[0] : date);
            const action = normalizeAction(log.action);
            const time = log.time || log.time_out || log.out_time || '';
            if (!byDate[dateOnly]) byDate[dateOnly] = {};
            if (action === 'time_in' || action === 'in' || action === 'clock_in') byDate[dateOnly].in = String(time);
            else if (action === 'time_out' || action === 'out' || action === 'clock_out') byDate[dateOnly].out = String(time);
          }
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const weekdayIn = await AsyncStorage.getItem('branch_weekday_in');
          const weekendIn = await AsyncStorage.getItem('branch_weekend_in');
          for (const date of Object.keys(byDate)) {
            const hasIn = !!byDate[date].in;
            const hasOut = !!byDate[date].out;
            let dotColor = '#10B981'; // green complete
            if (!hasIn || !hasOut) dotColor = '#EF4444'; // red missing
            else {
              // late check
              const dt = new Date(date);
              const isWknd = dt.getDay() === 0 || dt.getDay() === 6;
              const shiftIn = (isWknd ? weekendIn : weekdayIn) || shiftInTime;
              const timeIn = (byDate[date].in || '').toString().split('.')[0];
              if (shiftIn && timeIn) {
                const shiftStr = String(shiftIn).split(' ')[0];
                const inStr = timeIn.split(' ')[1] || timeIn;
                if (inStr > shiftStr) dotColor = '#F59E0B'; // yellow late
              }
            }
            next[date] = { marked: true, dotColor };
          }
        }
        next[selectedDate] = { ...(next[selectedDate] || {}), selected: true, selectedColor: '#F6B91E' };
        setMarkedDates(next);
      } catch (e) {
        console.log('History month fetch error', e);
      }
    };
    fetchMonth();
  }, [selectedDate, shiftInTime, refreshTick]);

  useEffect(() => {
    // Fetch latest in/out for selected date for detail section
    const fetchDay = async () => {
      try {
        const user = await authService.getUserData();
        const isGuest = user?.is_guest === 'true';
        if (!user?.employee_id || (!isGuest && !user?.access_token)) return;
        const dateStr: string = selectedDate || today;
        const token: string = String(user.access_token || '');
        const res = await authService.getTimeEntryHistory(Number(user.employee_id), token, dateStr, dateStr);
        let latestIn: string | null = null;
        let latestOut: string | null = null;
        let site: string = 'N/A';
        let siteIdToFetch: number | null = null;
        
        console.log('DEBUG TIME ENTRY HISTORY: Full response:', JSON.stringify(res, null, 2));
        
        if (res?.success && Array.isArray(res.data)) {
          console.log('DEBUG TIME ENTRY HISTORY: Data array length:', res.data.length);
          for (const log of res.data) {
            console.log('DEBUG TIME ENTRY HISTORY: Processing log entry:', JSON.stringify(log, null, 2));
            const date = (log.date || log.attendance_date || '').toString();
            const dateOnly = date.includes('T') ? date.split('T')[0] : (date.includes(' ') ? date.split(' ')[0] : date);
            console.log('DEBUG TIME ENTRY HISTORY: Comparing dateOnly:', dateOnly, 'with dateStr:', dateStr);
            if (dateOnly !== dateStr) continue;
            const action = normalizeAction(log.action);
            const time = log.time || log.time_out || log.out_time || '';
            
            // Extract site - support site and legacy branch fields
            console.log('DEBUG TIME ENTRY HISTORY: Checking site/branch names:', log.site_name, log.branch_name, 'site_id:', log.site_id, 'branch_id:', log.branch_id);
            if (log.site_name) {
              site = String(log.site_name);
            } else if (log.branch_name) {
              site = String(log.branch_name);
            } else if (log.site?.site_name) {
              site = String(log.site.site_name);
            } else if (log.branch?.branch_name) {
              site = String(log.branch.branch_name);
            } else if (log.site_id || log.branch_id) {
              siteIdToFetch = Number(log.site_id || log.branch_id);
              console.log('DEBUG TIME ENTRY HISTORY: Will fetch site name for ID:', siteIdToFetch);
            }
            
            
            if (action === 'time_in' || action === 'in' || action === 'clock_in') latestIn = String(time);
            else if (action === 'time_out' || action === 'out' || action === 'clock_out') latestOut = String(time);
          }
        }
        
        // If we have a site_id but no site_name, fetch it from the API
        if (siteIdToFetch && site === 'N/A') {
          try {
            console.log('DEBUG TIME ENTRY HISTORY: Fetching site details for ID:', siteIdToFetch);
            const siteDetails = await siteService.getById(siteIdToFetch);
            if (siteDetails?.name) {
              site = siteDetails.name;
              console.log('DEBUG TIME ENTRY HISTORY: Fetched site name:', site);
            } else {
              const branchDetails = await branchService.getBranchById(siteIdToFetch);
              if (branchDetails?.branch_name) {
                site = branchDetails.branch_name;
                console.log('DEBUG TIME ENTRY HISTORY: Fetched legacy branch name as site:', site);
              }
            }
          } catch (err) {
            console.log('DEBUG TIME ENTRY HISTORY: Error fetching site details:', err);
          }
        }
        
        console.log('DEBUG TIME ENTRY HISTORY: Final values - site:', site);
        setLatestIn(latestIn);
        setLatestOut(latestOut);
        setSelectedDateSite(site);
      } catch (e) {
        console.log('History day fetch error', e);
        setSelectedDateSite('Error Loading');
      }
    };
    fetchDay();
  }, [selectedDate, refreshTick]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
      <LinearGradient colors={["#f8c952ff", "#f8c952ff"]} style={styles.headerGradient}>
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Time Entry History</Text>
          <View style={{ width: 24 }} />
        </View>
      </LinearGradient>

      <ScrollView style={{ flex: 1, backgroundColor: '#F3F4F6' }} contentContainerStyle={{ padding: 16 }}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Calendar</Text>
          <Calendar
            markedDates={markedDates}
            onDayPress={(day: any) => {
              setSelectedDate(day.dateString);
              setMarkedDates((prev: any) => ({
                ...prev,
                [day.dateString]: { ...(prev[day.dateString] || {}), selected: true, selectedColor: '#F6B91E' },
              }));
            }}
            theme={{
              todayTextColor: '#F59E0B',
              selectedDayBackgroundColor: '#F6B91E',
              selectedDayTextColor: '#fff',
              arrowColor: '#F59E0B',
            }}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Selected Day: {selectedDate}</Text>
          
          <View style={styles.infoRow}>
            <View style={styles.infoItem}>
              <Ionicons name="business" size={20} color="#F6B91E" />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={styles.infoLabel}>Site</Text>
                <Text style={styles.infoValue}>{selectedDateSite}</Text>
              </View>
            </View>
          </View>
          
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Time In</Text>
              <Text style={styles.detailValue}>{formatDisplayHMS(latestIn)}</Text>
            </View>
            <View style={styles.detailBlock}>
              <Text style={styles.detailLabel}>Time Out</Text>
              <Text style={styles.detailValue}>{formatDisplayHMS(latestOut)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <View style={styles.legendItem}><View style={[styles.legendDot,{backgroundColor:'#10B981'}]} /><Text style={styles.legendText}>Complete</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot,{backgroundColor:'#F59E0B'}]} /><Text style={styles.legendText}>Late In</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot,{backgroundColor:'#EF4444'}]} /><Text style={styles.legendText}>Missing</Text></View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  headerGradient: {
    paddingTop: 40,
    paddingBottom: 12,
    paddingHorizontal: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 8,
    backgroundColor: '#F6B91E'
  },
  headerContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  section: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1.5, borderColor: '#E5E7EB' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#0B2545', marginBottom: 8 },
  infoRow: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, borderWidth: 1.5, borderColor: '#E5E7EB' },
  infoItem: { flexDirection: 'row', alignItems: 'center' },
  infoLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600', marginBottom: 4 },
  infoValue: { fontSize: 14, color: '#0B2545', fontWeight: '700' },
  detailBlock: { flex: 1, backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, borderWidth: 1.5, borderColor: '#E5E7EB', marginHorizontal: 4 },
  detailLabel: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  detailValue: { fontSize: 16, color: '#0B2545', fontWeight: '700', marginTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
});
