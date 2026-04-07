import authService from '@/services/authService';
import branchService from '@/services/branchService';
import siteService from '@/services/siteService';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

function getCutoffRange(dateStr: string): { start: string; end: string } {
  const [year, month, day] = dateStr.split('-').map(Number);
  const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
  if (day <= 15) {
    return { start: `${yearMonth}-01`, end: `${yearMonth}-15` };
  } else {
    const lastDay = new Date(year, month, 0).getDate();
    return { start: `${yearMonth}-16`, end: `${yearMonth}-${String(lastDay).padStart(2, '0')}` };
  }
}

export default function TimeEntryHistoryScreen() {
  const router = useRouter();
  const today = formatDateISO(new Date());
  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [markedDates, setMarkedDates] = useState<any>({ [today]: { selected: true, selectedColor: '#F6B91E' } });
  const [dayLogs, setDayLogs] = useState<Array<{ action: string; time: string; site: string }>>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [shiftInTime, setShiftInTime] = useState<string | null>(null);
  const [shiftOutTime, setShiftOutTime] = useState<string | null>(null);
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
    // Fetch cutoff logs and mark dates
    const fetchMonth = async () => {
      try {
        const user = await authService.getUserData();
        const isGuest = user?.is_guest === 'true';
        if (!user?.employee_id || (!isGuest && !user?.access_token)) return;
        const { start, end } = getCutoffRange(selectedDate);
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
    // Fetch all time-in/out entries for selected date
    const fetchDay = async () => {
      setDayLoading(true);
      try {
        const user = await authService.getUserData();
        const isGuest = user?.is_guest === 'true';
        if (!user?.employee_id || (!isGuest && !user?.access_token)) { setDayLoading(false); return; }
        const dateStr: string = selectedDate || today;
        const token: string = String(user.access_token || '');
        const res = await authService.getTimeEntryHistory(Number(user.employee_id), token, dateStr, dateStr);

        const collected: Array<{ action: string; time: string; site: string }> = [];
        let resolvedSite = 'N/A';
        let siteIdToFetch: number | null = null;

        if (res?.success && Array.isArray(res.data)) {
          for (const log of res.data) {
            const date = (log.date || log.attendance_date || '').toString();
            const dateOnly = date.includes('T') ? date.split('T')[0] : (date.includes(' ') ? date.split(' ')[0] : date);
            if (dateOnly !== dateStr) continue;

            const action = normalizeAction(log.action);
            const isIn  = action === 'time_in'  || action === 'in'  || action === 'clock_in';
            const isOut = action === 'time_out' || action === 'out' || action === 'clock_out';
            if (!isIn && !isOut) continue;

            const time = log.time || log.time_out || log.out_time || '';

            // Resolve site name (once)
            if (resolvedSite === 'N/A') {
              if (log.site_name)        resolvedSite = String(log.site_name);
              else if (log.branch_name) resolvedSite = String(log.branch_name);
              else if (log.site?.site_name)     resolvedSite = String(log.site.site_name);
              else if (log.branch?.branch_name) resolvedSite = String(log.branch.branch_name);
              else if (log.site_id || log.branch_id) siteIdToFetch = Number(log.site_id || log.branch_id);
            }

            collected.push({
              action: isIn ? 'Time In' : 'Time Out',
              time: String(time),
              site: resolvedSite,
            });
          }
        }

        // Fetch site name by ID if needed
        if (siteIdToFetch && resolvedSite === 'N/A') {
          try {
            const siteDetails = await siteService.getById(siteIdToFetch);
            if (siteDetails?.name) resolvedSite = siteDetails.name;
            else {
              const branchDetails = await branchService.getBranchById(siteIdToFetch);
              if (branchDetails?.branch_name) resolvedSite = branchDetails.branch_name;
            }
          } catch { /* ignore */ }
          // Backfill resolved site name into collected entries
          for (const entry of collected) {
            if (entry.site === 'N/A') entry.site = resolvedSite;
          }
        }

        setDayLogs(collected);
      } catch (e) {
        console.log('History day fetch error', e);
        setDayLogs([]);
      } finally {
        setDayLoading(false);
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
          <View style={{ flexDirection: 'row', marginTop: 10 }}>
            <View style={styles.legendItem}><View style={[styles.legendDot,{backgroundColor:'#10B981'}]} /><Text style={styles.legendText}>Complete</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot,{backgroundColor:'#F59E0B'}]} /><Text style={styles.legendText}>Late In</Text></View>
            <View style={styles.legendItem}><View style={[styles.legendDot,{backgroundColor:'#EF4444'}]} /><Text style={styles.legendText}>Missing</Text></View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Attendance History – {selectedDate}</Text>

          {/* Table header */}
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>Action</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1 }]}>Time</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1.5 }]}>Site</Text>
          </View>

          {dayLoading ? (
            <ActivityIndicator size="small" color="#F6B91E" style={{ marginTop: 16 }} />
          ) : dayLogs.length === 0 ? (
            <Text style={styles.emptyText}>No attendance records for this date.</Text>
          ) : (
            dayLogs.map((entry, idx) => {
              const isIn = entry.action === 'Time In';
              return (
                <View key={idx} style={[styles.tableRow, idx % 2 === 1 && styles.tableRowAlt]}>
                  <View style={[styles.tableCell, { flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                    <Ionicons
                      name={isIn ? 'log-in' : 'log-out'}
                      size={18}
                      color={isIn ? '#10B981' : '#EF4444'}
                    />
                    <Text style={[styles.tableCellText, { color: isIn ? '#10B981' : '#EF4444', fontWeight: '700' }]}>
                      {entry.action}
                    </Text>
                  </View>
                  <Text style={[styles.tableCell, styles.tableCellText, { flex: 1 }]}>
                    {formatDisplayHMS(entry.time)}
                  </Text>
                  <Text style={[styles.tableCell, styles.tableCellText, { flex: 1.5 }]} numberOfLines={2}>
                    {entry.site}
                  </Text>
                </View>
              );
            })
          )}
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
  tableHeader: { flexDirection: 'row', backgroundColor: '#F6B91E', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginBottom: 4 },
  tableHeaderCell: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  tableRowAlt: { backgroundColor: '#FAFAFA' },
  tableCell: { paddingRight: 6 },
  tableCellText: { fontSize: 13, color: '#0B2545', fontWeight: '500' },
  emptyText: { textAlign: 'center', color: '#9CA3AF', fontSize: 13, paddingVertical: 20 },
});
