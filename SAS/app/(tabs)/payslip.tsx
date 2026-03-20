import { useUser } from '@/hooks/use-auth';
import { useThemeColors } from '@/hooks/use-theme';
import authService from '@/services/authService';
import payslipService from '@/services/payslipService';
import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import {
    ActivityIndicator,
    Alert,
    BackHandler,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';

interface PayPeriod {
  startDate: Date;
  endDate: Date;
  displayText: string;
}

interface ParsedPayslipData {
  employee_no: string;
  employee_name: string;
  company_name: string;
  period_start: string;
  period_end: string;
  batch: string;
  client: string;
  daily_rate: number;
  earnings: {
    regular: { hours: number; days: number; amount: number };
    overtime: { hours: number; amount: number };
    night_diff: { hours: number; amount: number };
    legal_holiday: { hours: number; amount: number };
    legal_hol_overtime: { hours: number; amount: number };
    legal_hol_night_diff: { hours: number; amount: number };
    special_holiday: { hours: number; amount: number };
    special_hol_overtime: { hours: number; amount: number };
    special_hol_night_diff: { hours: number; amount: number };
    restday: { hours: number; days: number; amount: number };
    restday_overtime: { hours: number; amount: number };
    restday_night_diff: { hours: number; amount: number };
  };
  total_hours: number;
  total_days: number;
  gross_earnings: number;
  deductions: {
    govt_deductions: {
      sss_premium: number;
      ph_premium: number;
      hdmf_premium: number;
      sss_loan: number;
      sss_calamity: number;
      sss_condonation: number;
      hdmf_loan: number;
      hdmf_calamity: number;
    };
    other_deductions: {
      behavioral_bond: number;
      death_assist: number;
      cia_others: number;
      tax_withheld: number;
      insurance: number;
      cia_outright: number;
      paraphernalias: number;
      losses: number;
      uniform_advance: number;
      electronics: number;
      cia_amortized: number;
      cia_coop: number;
      training_fee: number;
    };
  };
  total_deductions: number;
  net_pay: number;
}

type ThemeShape = ReturnType<typeof useThemeColors>;

export default function PayslipScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { userName } = useUser();
  const [loading, setLoading] = useState(false);
  const [loadingPeriods, setLoadingPeriods] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [payslipList, setPayslipList] = useState<ParsedPayslipData[]>([]);
  const [payslipData, setPayslipData] = useState<ParsedPayslipData | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const theme = useThemeColors();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Add header back button on top navigation
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            if ((navigation as any).canGoBack && (navigation as any).canGoBack()) {
              (navigation as any).goBack();
            } else {
              router.replace('/');
            }
          }}
          style={{ paddingHorizontal: 12 }}
        >
          <Ionicons name="chevron-back" size={24} color={theme.primary} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, theme, router]);
  
  // Ref for capturing payslip as image
  const payslipRef = useRef<View>(null);
  
  // Pay period management
  const [availablePeriods, setAvailablePeriods] = useState<PayPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<PayPeriod | null>(null);
  const [hasUserSelectedPeriod, setHasUserSelectedPeriod] = useState(false);
  const [showPeriodPicker, setShowPeriodPicker] = useState(false);
  
  // Cache for fetched payslips
  const [payslipsByPeriod, setPayslipsByPeriod] = useState<Record<string, ParsedPayslipData[]>>({});

  useEffect(() => {
    initializePage();
  }, []);

  // On Android back, stay within Profile tab instead of going Home
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      try {
        router.replace('/(tabs)/profile');
        return true;
      } catch {
        return false;
      }
    });
    return () => sub.remove();
  }, [router]);

  const initializePage = async () => {
    await loadUserData();
    await loadAvailablePeriods();
  };

  const loadUserData = async () => {
    try {
      const userData = await authService.getUserData();
      if (userData.employee_id && userData.user_company_id) {
        const empId = parseInt(userData.employee_id);
        const compId = parseInt(userData.user_company_id);
        setEmployeeId(empId);
        setCompanyId(compId);
      }
    } catch (error) {
      console.error('Error loading user data:', error);
    }
  };

  const loadAvailablePeriods = async () => {
    setLoadingPeriods(true);
    setAvailablePeriods([]);
    
    try {
      const userData = await authService.getUserData();
      const empId = parseInt(userData.employee_id || '0');
      const compId = parseInt(userData.user_company_id || '0');
      const accessToken = userData.access_token || '';

      console.log('DEBUG: Loading periods for employee:', empId, 'company:', compId);

      if (!empId || !compId || !accessToken) {
        console.log('DEBUG: Missing credentials - empId:', empId, 'compId:', compId, 'hasToken:', !!accessToken);
        setLoadingPeriods(false);
        return;
      }

      // Try to fetch all payslip records and derive periods
      const broadUrl = `https://api.rds.ismis.com.ph/api/paydata/view?company_id=${compId}&employee_id=${empId}`;
      console.log('DEBUG: Fetching all payslip records:', broadUrl);

      const response = await fetch(broadUrl, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      console.log('DEBUG: API response status:', response.status);

      if (response.status === 200) {
        const text = await response.text();
        console.log('DEBUG: Raw API response:', text.substring(0, 500)); // Log first 500 chars
        
        let data;
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          console.error('DEBUG: JSON parse error:', parseError);
          console.log('DEBUG: Response was not valid JSON');
          setLoadingPeriods(false);
          return;
        }

        console.log('DEBUG: Parsed API data type:', Array.isArray(data) ? 'array' : typeof data);
        console.log('DEBUG: Data keys:', data ? Object.keys(data).join(', ') : 'null');
        
        const parsedList = parsePayslipList(data, compId);
        console.log('DEBUG: Parsed payslip list length:', parsedList.length);
        
        if (parsedList.length > 0) {
          // Log first record for debugging
          console.log('DEBUG: First payslip record:', JSON.stringify(parsedList[0], null, 2));
          
          const periods = new Map<string, PayPeriod>();
          const cache: Record<string, ParsedPayslipData[]> = {};
          
          parsedList.forEach((p, index) => {
            const ps = p.period_start;
            const pe = p.period_end;
            console.log(`DEBUG: Record ${index}: period_start=${ps}, period_end=${pe}`);
            
            if (!ps || !pe || ps === 'N/A' || pe === 'N/A') {
              console.log(`DEBUG: Skipping record ${index} - invalid period dates`);
              return;
            }
            
            const key = `${ps}|${pe}`;
            
            // Add to cache
            if (!cache[key]) {
              cache[key] = [];
            }
            cache[key].push(p);
            
            // Add to periods
            if (!periods.has(key)) {
              try {
                const startDate = new Date(ps);
                const endDate = new Date(pe);
                
                // Validate dates
                if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
                  console.log(`DEBUG: Invalid date for key ${key}`);
                  return;
                }
                
                const displayText = `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`;
                periods.set(key, { startDate, endDate, displayText });
                console.log(`DEBUG: Added period: ${displayText}`);
              } catch (e) {
                console.error('Error parsing period dates:', e);
              }
            }
          });
          
          const periodsList = Array.from(periods.values());
          periodsList.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
          
          console.log('DEBUG: Built', periodsList.length, 'pay periods from payslip records');
          
          setAvailablePeriods(periodsList);
          setPayslipsByPeriod(cache);
        } else {
          console.log('DEBUG: No valid payslip records found after parsing');
          // Try alternative endpoint for periods
          await tryFetchPeriodsFromSasPeriodsEndpoint(compId, accessToken);
        }
      } else {
        console.log('DEBUG: API returned non-200 status:', response.status);
        const errorText = await response.text();
        console.log('DEBUG: Error response:', errorText.substring(0, 200));
        // Try alternative endpoint
        await tryFetchPeriodsFromSasPeriodsEndpoint(compId, accessToken);
      }
    } catch (error) {
      console.error('DEBUG: Error loading pay periods:', error);
      // Try alternative endpoint as fallback
      try {
        const userData = await authService.getUserData();
        const compId = parseInt(userData.user_company_id || '0');
        const accessToken = userData.access_token || '';
        if (compId && accessToken) {
          await tryFetchPeriodsFromSasPeriodsEndpoint(compId, accessToken);
        }
      } catch (fallbackError) {
        console.error('DEBUG: Fallback also failed:', fallbackError);
      }
    } finally {
      setLoadingPeriods(false);
    }
  };

  const tryFetchPeriodsFromSasPeriodsEndpoint = async (compId: number, accessToken: string) => {
    try {
      const periodsUrl = `https://api.rds.ismis.com.ph/api/sasperiods?company_id=${compId}`;
      console.log('DEBUG: Trying sasperiods endpoint:', periodsUrl);

      const response = await fetch(periodsUrl, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });

      if (response.status === 200) {
        const data = await response.json();
        console.log('DEBUG: sasperiods response:', JSON.stringify(data).substring(0, 300));
        
        const periods: PayPeriod[] = [];
        
        // Try to extract periods from various response structures
        const extractPeriods = (obj: any) => {
          if (Array.isArray(obj)) {
            obj.forEach(item => {
              if (item && typeof item === 'object') {
                const start = item.pay_start || item.pay_start_date || item.payStart || item.start_date;
                const end = item.pay_end || item.pay_end_date || item.payEnd || item.end_date;
                
                if (start && end) {
                  try {
                    const startDate = new Date(start);
                    const endDate = new Date(end);
                    if (!isNaN(startDate.getTime()) && !isNaN(endDate.getTime())) {
                      const displayText = `${formatDisplayDate(startDate)} - ${formatDisplayDate(endDate)}`;
                      periods.push({ startDate, endDate, displayText });
                      console.log('DEBUG: Found period from sasperiods:', displayText);
                    }
                  } catch (e) {
                    console.error('DEBUG: Error parsing period:', e);
                  }
                }
              }
            });
          } else if (obj && typeof obj === 'object') {
            // Check common nested structures
            if (obj.data) extractPeriods(obj.data);
            if (obj.periods) extractPeriods(obj.periods);
          }
        };
        
        extractPeriods(data);
        
        if (periods.length > 0) {
          periods.sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
          setAvailablePeriods(periods);
          console.log('DEBUG: Successfully loaded', periods.length, 'periods from sasperiods endpoint');
        } else {
          console.log('DEBUG: No periods found in sasperiods response');
        }
      } else {
        console.log('DEBUG: sasperiods endpoint returned status:', response.status);
      }
    } catch (error) {
      console.error('DEBUG: Error fetching from sasperiods endpoint:', error);
    }
  };

  const parsePayslipList = (apiData: any, companyId: number): ParsedPayslipData[] => {
    const results: ParsedPayslipData[] = [];
    
    try {
      let rawList: any[] = [];
      
      console.log('DEBUG: parsePayslipList - input type:', Array.isArray(apiData) ? 'array' : typeof apiData);
      
      if (Array.isArray(apiData)) {
        rawList = apiData;
        console.log('DEBUG: Using direct array with', rawList.length, 'items');
      } else if (apiData?.data && Array.isArray(apiData.data)) {
        rawList = apiData.data;
        console.log('DEBUG: Using apiData.data array with', rawList.length, 'items');
      } else if (typeof apiData === 'object' && apiData !== null) {
        // Check if it's a single payslip object
        if (apiData.period_start || apiData.pay_start || apiData.employee_id) {
          rawList = [apiData];
          console.log('DEBUG: Using single object as array');
        } else {
          console.log('DEBUG: Object does not look like payslip data, keys:', Object.keys(apiData).join(', '));
        }
      }
      
      if (rawList.length === 0) {
        console.log('DEBUG: No raw payslip data to parse');
        return results;
      }
      
      rawList.forEach((item, index) => {
        if (item && typeof item === 'object') {
          console.log(`DEBUG: Parsing item ${index}, keys:`, Object.keys(item).slice(0, 10).join(', '));
          const parsed = parseSinglePayslip(item, companyId);
          results.push(parsed);
        } else {
          console.log(`DEBUG: Skipping item ${index} - not an object`);
        }
      });
      
      console.log('DEBUG: Successfully parsed', results.length, 'payslip record(s)');
    } catch (error) {
      console.error('Error parsing payslip list:', error);
    }
    
    return results;
  };

  const parseSinglePayslip = (data: any, companyId: number): ParsedPayslipData => {
    const safeNumber = (val: any): number => {
      const num = parseFloat(val);
      return isNaN(num) ? 0 : num;
    };

    const safeString = (val: any): string => {
      return val ? String(val) : 'N/A';
    };

    // Log all available fields for debugging
    console.log('DEBUG: parseSinglePayslip - All available fields:', Object.keys(data).join(', '));
    console.log('DEBUG: Complete raw data object:', JSON.stringify(data).substring(0, 1000));

    // Construct full name from last_name, first_name, middle_name
    const fullName = [data.first_name, data.middle_name, data.last_name]
      .filter(Boolean)
      .join(' ') || safeString(data.employee_name || data.name);

    // Calculate daily rate from basic_amount (if it's the daily rate) or from reg_amount/reg_days
    const regHours = safeNumber(data.reg_hours);
    const regAmount = safeNumber(data.reg_amount);
    const calculatedDailyRate = regHours > 0 ? (regAmount / regHours) * 8 : safeNumber(data.basic_amount);

    return {
      employee_no: safeString(data.employee_no || data.employee_id),
      employee_name: fullName,
      company_name: safeString(data.comp_name || data.company_name || data.company),
      period_start: safeString(data.pay_start || data.pay_start_date || data.period_start),
      period_end: safeString(data.pay_end || data.pay_end_date || data.period_end),
      batch: safeString(data.pay_batch || data.batch),
      client: safeString(data.client_name || data.client_no || data.client_id),
      daily_rate: calculatedDailyRate,
      
      earnings: {
        regular: {
          hours: safeNumber(data.reg_hours),
          days: safeNumber(data.reg_hours) / 8,
          amount: safeNumber(data.reg_amount),
        },
        overtime: {
          hours: safeNumber(data.ot_hours),
          amount: safeNumber(data.ot_amount),
        },
        night_diff: {
          hours: safeNumber(data.nd_hours),
          amount: safeNumber(data.nd_amount),
        },
        legal_holiday: {
          hours: safeNumber(data.lh_hours),
          amount: safeNumber(data.lh_amount),
        },
        legal_hol_overtime: {
          hours: safeNumber(data.lhot_hours),
          amount: safeNumber(data.lhot_amount),
        },
        legal_hol_night_diff: {
          hours: safeNumber(data.lhnd_hours),
          amount: safeNumber(data.lhnd_amount),
        },
        special_holiday: {
          hours: safeNumber(data.sh_hours),
          amount: safeNumber(data.sh_amount),
        },
        special_hol_overtime: {
          hours: safeNumber(data.shot_hours),
          amount: safeNumber(data.shot_amount),
        },
        special_hol_night_diff: {
          hours: safeNumber(data.shnd_hours),
          amount: safeNumber(data.shnd_amount),
        },
        restday: {
          hours: safeNumber(data.rd_hours),
          days: safeNumber(data.rd_hours) / 8,
          amount: safeNumber(data.rd_amount),
        },
        restday_overtime: {
          hours: safeNumber(data.rdot_hours),
          amount: safeNumber(data.rdot_amount),
        },
        restday_night_diff: {
          hours: safeNumber(data.rdnd_hours),
          amount: safeNumber(data.rdnd_amount),
        },
      },
      
      total_hours: safeNumber(data.reg_hours || 0) + safeNumber(data.ot_hours || 0) + safeNumber(data.nd_hours || 0) + 
                    safeNumber(data.rd_hours || 0) + safeNumber(data.lh_hours || 0) + safeNumber(data.sh_hours || 0),
      total_days: (safeNumber(data.reg_hours || 0) + safeNumber(data.rd_hours || 0)) / 8,
      gross_earnings: safeNumber(data.gross_amount),
      
      deductions: {
        govt_deductions: {
          sss_premium: safeNumber(data.sss_employee),
          ph_premium: safeNumber(data.ph_employee),
          hdmf_premium: safeNumber(data.hdmf_employee),
          sss_loan: safeNumber(data.dedn01),
          sss_calamity: safeNumber(data.dedn02),
          sss_condonation: safeNumber(data.dedn17),
          hdmf_loan: safeNumber(data.dedn03),
          hdmf_calamity: safeNumber(data.dedn04),
        },
        other_deductions: {
          behavioral_bond: safeNumber(data.cashbond),
          death_assist: safeNumber(data.death_assist),
          cia_others: safeNumber(data.dedn11),
          tax_withheld: safeNumber(data.tax_wheld),
          insurance: safeNumber(data.dedn14),
          cia_outright: safeNumber(data.dedn05),
          paraphernalias: safeNumber(data.dedn06),
          losses: safeNumber(data.dedn08),
          uniform_advance: safeNumber(data.dedn09),
          electronics: safeNumber(data.dedn07),
          cia_amortized: safeNumber(data.dedn10),
          cia_coop: safeNumber(data.dedn12),
          training_fee: safeNumber(data.dedn18),
        },
      },
      
      total_deductions: safeNumber(data.deduction_amount),
      net_pay: safeNumber(data.netpay_amount),
    };
  };

  const fetchPayslipData = async (period?: PayPeriod) => {
    const periodToUse = period || selectedPeriod;
    
    if (!periodToUse || !companyId || !employeeId) {
      Alert.alert('Error', 'Please select a pay period');
      return;
    }

    setLoading(true);
    setErrorMessage('');

    try {
      const payStart = formatApiDate(periodToUse.startDate);
      const payEnd = formatApiDate(periodToUse.endDate);
      const periodKey = `${payStart}|${payEnd}`;

      // Check cache first
      if (payslipsByPeriod[periodKey]) {
        setPayslipList(payslipsByPeriod[periodKey]);
        setPayslipData(payslipsByPeriod[periodKey][0] || null);
        setLoading(false);
        console.log('DEBUG: Used cached payslip data for period', periodKey);
        return;
      }

      // Fetch from API
      console.log('DEBUG: Fetching payslip for period:', payStart, 'to', payEnd);
      console.log('DEBUG: Using companyId:', companyId, 'employeeId:', employeeId);
      const result = await payslipService.fetchPayslip(companyId, payStart, payEnd, employeeId);

      console.log('DEBUG: fetchPayslip result success:', result.success);
      console.log('DEBUG: fetchPayslip result status:', result.status);
      console.log('DEBUG: fetchPayslip result data type:', Array.isArray(result.data) ? 'array' : typeof result.data);
      
      if (result.data) {
        console.log('DEBUG: Raw data structure:', JSON.stringify(result.data).substring(0, 500));
      }

      if (result.success && result.data) {
        const parsedList = parsePayslipList(result.data, companyId);
        
        console.log('DEBUG: Parsed list length:', parsedList.length);
        if (parsedList.length > 0) {
          console.log('DEBUG: First parsed payslip sample:', JSON.stringify({
            employee_no: parsedList[0].employee_no,
            employee_name: parsedList[0].employee_name,
            period_start: parsedList[0].period_start,
            period_end: parsedList[0].period_end,
            gross_earnings: parsedList[0].gross_earnings,
            net_pay: parsedList[0].net_pay,
          }));
          
          // Update cache
          setPayslipsByPeriod((prev) => ({
            ...prev,
            [periodKey]: parsedList,
          }));
          
          setPayslipList(parsedList);
          setPayslipData(parsedList[0]);
          console.log('DEBUG: Successfully set payslipList with length:', parsedList.length);
          console.log('DEBUG: payslipList should now contain:', parsedList.length, 'items');
          
          // Force a small delay to see if state updates
          setTimeout(() => {
            console.log('DEBUG: After timeout - checking if state persisted');
          }, 100);
        } else {
          console.log('DEBUG: Parsed list is empty');
          setErrorMessage('No payslip data available for the selected period.');
        }
      } else {
        console.log('DEBUG: API call failed or no data returned');
        setErrorMessage(result.error || 'Failed to load payslip data');
      }
    } catch (error: any) {
      console.error('Error fetching payslip:', error);
      setErrorMessage(error.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodSelect = async (period: PayPeriod) => {
    console.log('DEBUG: Period selected:', period.displayText);
    console.log('DEBUG: Period dates:', period.startDate, period.endDate);
    
    setSelectedPeriod(period);
    setHasUserSelectedPeriod(true);
    setShowPeriodPicker(false);
    
    // Check if data is already cached
    const payStart = formatApiDate(period.startDate);
    const payEnd = formatApiDate(period.endDate);
    const periodKey = `${payStart}|${payEnd}`;
    
    console.log('DEBUG: Looking for cached data with key:', periodKey);
    console.log('DEBUG: Available cache keys:', Object.keys(payslipsByPeriod).join(', '));
    
    if (payslipsByPeriod[periodKey]) {
      console.log('DEBUG: Found cached data, using it immediately');
      setPayslipList(payslipsByPeriod[periodKey]);
      setPayslipData(payslipsByPeriod[periodKey][0]);
    }
    
    // Always fetch to ensure fresh data
    await fetchPayslipData(period);
  };

  const handleDownloadPayslip = async () => {
    if (downloading || payslipList.length === 0 || !hasUserSelectedPeriod) {
      Alert.alert('Error', 'Please select a pay period and ensure payslip data is loaded first');
      return;
    }

    try {
      setDownloading(true);

      // Capture the payslip view as image
      if (payslipRef.current) {
        const uri = await captureRef(payslipRef, {
          format: 'png',
          quality: 1,
        });

        // Generate filename
        const timestamp = new Date().getTime();
        const employeeName = payslipList[0]?.employee_name?.replace(/\s+/g, '_') || 'employee';
        const periodStart = selectedPeriod ? formatApiDate(selectedPeriod.startDate) : '';
        const periodEnd = selectedPeriod ? formatApiDate(selectedPeriod.endDate) : '';
        const fileName = `Payslip_${employeeName}_${periodStart}_to_${periodEnd}_${timestamp}.png`;
        
        // Create file in documents directory using new File API
        const file = new File(Paths.document, fileName);
        
        // Read the captured image and write to file
        const response = await fetch(uri);
        const blob = await response.blob();
        
        // Convert blob to base64 using FileReader
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onloadend = () => {
            const base64data = reader.result as string;
            const base64 = base64data.split(',')[1]; // Remove data:image/png;base64, prefix
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        
        const base64 = await base64Promise;
        
        // Convert base64 to Uint8Array
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        await file.create();
        const writer = await file.writableStream();
        const writerInstance = writer.getWriter();
        await writerInstance.write(bytes);
        await writerInstance.close();

        // Share the file
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, {
            mimeType: 'image/png',
            dialogTitle: 'Save Payslip',
          });
          Alert.alert('Success', 'Payslip image saved successfully!');
        } else {
          Alert.alert('Success', `Payslip saved to ${file.uri}`);
        }
      } else {
        throw new Error('Failed to capture payslip');
      }
    } catch (error: any) {
      console.error('Error downloading payslip:', error);
      Alert.alert('Error', `Failed to save payslip: ${error.message || error}`);
    } finally {
      setDownloading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    if (!amount) return '₱0.00';
    return `₱${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDisplayDate = (date: Date): string => {
    try {
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  const formatApiDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const formatHoursDays = (hours: number, days: number, showDays: boolean = false): string => {
    if (hours === 0) return '-';
    const h = hours.toFixed(2);
    if (showDays && days > 0) {
      const d = days.toFixed(2);
      return `${h}hrs = ${d}days`;
    }
    return `${h}hrs`;
  };

  const renderEarningsRow = (label: string, hours: number, days: number, amount: number, showDays: boolean = false) => (
    <View key={label} style={styles.tableRow}>
      <Text style={[styles.tableCell, styles.tableCellLabel]}>{label}</Text>
      <Text style={[styles.tableCell, styles.tableCellCenter]}>
        {formatHoursDays(hours, days, showDays)}
      </Text>
      <Text style={[styles.tableCell, styles.tableCellRight]}>
        {amount === 0 ? '-' : formatCurrency(amount)}
      </Text>
    </View>
  );

  const renderDeductionRow = (
    govtLabel: string,
    govtAmount: number,
    otherLabel: string,
    otherAmount: number
  ) => (
    <View key={`${govtLabel}-${otherLabel}`} style={styles.deductionRow}>
      <View style={styles.deductionCol}>
        <Text style={styles.deductionLabel}>{govtLabel}</Text>
        <Text style={styles.deductionValue}>
          {govtAmount === 0 ? '-' : formatCurrency(govtAmount)}
        </Text>
      </View>
      <View style={styles.deductionCol}>
        <Text style={styles.deductionLabel}>{otherLabel}</Text>
        <Text style={styles.deductionValue}>
          {otherAmount === 0 ? '-' : formatCurrency(otherAmount)}
        </Text>
      </View>
    </View>
  );

  const renderPayslipTemplate = (data: ParsedPayslipData, position: number, total: number) => {
    console.log('DEBUG: renderPayslipTemplate called for position', position, 'of', total);
    console.log('DEBUG: Data received:', {
      employee_no: data.employee_no,
      employee_name: data.employee_name,
      net_pay: data.net_pay,
      gross_earnings: data.gross_earnings,
    });
    
    const { earnings, deductions } = data;
    
    return (
      <View key={position} style={styles.payslipTemplate}>
        {/* Header */}
        <View style={styles.payslipHeader}>
          <Text style={styles.companyName}>{data.company_name}</Text>
          <Text style={styles.payslipTitle}>PAYSLIP REPORT</Text>
          {total > 1 && (
            <Text style={styles.recordNumber}>Record {position} of {total}</Text>
          )}
        </View>

        {/* Employee Info */}
        <View style={styles.employeeInfo}>
          <Text style={styles.employeeText}>
            EMPLOYEE NO & NAME: {data.employee_no} - {data.employee_name}
          </Text>
          <Text style={styles.employeeText}>
            PERIOD COVERED: {data.period_start} - {data.period_end} Batch ({data.batch})
          </Text>
        </View>

        {/* Earnings Table */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 3 }]}>EARNINGS</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>MANHOUR</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>AMOUNT</Text>
          </View>
          
          {renderEarningsRow('Regular', earnings.regular.hours, earnings.regular.days, earnings.regular.amount, true)}
          {renderEarningsRow('Overtime', earnings.overtime.hours, 0, earnings.overtime.amount)}
          {renderEarningsRow('Night Diff', earnings.night_diff.hours, 0, earnings.night_diff.amount)}
          {renderEarningsRow('Legal Holiday', earnings.legal_holiday.hours, 0, earnings.legal_holiday.amount)}
          {renderEarningsRow('Legal Hol Overtime', earnings.legal_hol_overtime.hours, 0, earnings.legal_hol_overtime.amount)}
          {renderEarningsRow('Legal Hol Night Diff', earnings.legal_hol_night_diff.hours, 0, earnings.legal_hol_night_diff.amount)}
          {renderEarningsRow('Special Holiday', earnings.special_holiday.hours, 0, earnings.special_holiday.amount)}
          {renderEarningsRow('Special Hol Overtime', earnings.special_hol_overtime.hours, 0, earnings.special_hol_overtime.amount)}
          {renderEarningsRow('Special Hol Night Diff', earnings.special_hol_night_diff.hours, 0, earnings.special_hol_night_diff.amount)}
          {renderEarningsRow('RestDay', earnings.restday.hours, earnings.restday.days, earnings.restday.amount, true)}
          {renderEarningsRow('RestDay Overtime', earnings.restday_overtime.hours, 0, earnings.restday_overtime.amount)}
          {renderEarningsRow('RestDay Night Diff', earnings.restday_night_diff.hours, 0, earnings.restday_night_diff.amount)}
          
          <View style={styles.tableTotalRow}>
            <Text style={[styles.tableTotalCell, { flex: 3 }]}>TOTAL MANHOURS</Text>
            <Text style={[styles.tableTotalCell, { flex: 1, textAlign: 'center' }]}>
              {formatHoursDays(data.total_hours, data.total_days, true)}
            </Text>
            <Text style={[styles.tableTotalCell, { flex: 1 }]} />
          </View>
          
          <View style={styles.tableGrossRow}>
            <Text style={[styles.tableGrossCell, { flex: 3 }]}>GROSS EARNINGS</Text>
            <Text style={[styles.tableGrossCell, { flex: 1 }]} />
            <Text style={[styles.tableGrossCell, { flex: 1, textAlign: 'center' }]}>
              {formatCurrency(data.gross_earnings)}
            </Text>
          </View>
        </View>

        {/* Deductions Table */}
        <View style={[styles.table, { marginTop: 20 }]}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>GOVERNMENT DEDUCTIONS</Text>
            <Text style={[styles.tableHeaderCell, { flex: 1, textAlign: 'center' }]}>OTHER DEDUCTIONS</Text>
          </View>
          
          {renderDeductionRow('SSS Premium', deductions.govt_deductions.sss_premium, 'Behavioral Bond', deductions.other_deductions.behavioral_bond)}
          {renderDeductionRow('PH Premium', deductions.govt_deductions.ph_premium, 'Death Assist', deductions.other_deductions.death_assist)}
          {renderDeductionRow('HDMF Premium', deductions.govt_deductions.hdmf_premium, 'C/A - Others', deductions.other_deductions.cia_others)}
          {renderDeductionRow('SSS LOAN', deductions.govt_deductions.sss_loan, 'Tax Withheld', deductions.other_deductions.tax_withheld)}
          {renderDeductionRow('SSS Calamity', deductions.govt_deductions.sss_calamity, 'Insurance', deductions.other_deductions.insurance)}
          {renderDeductionRow('SSS Condonation', deductions.govt_deductions.sss_condonation, 'C/A Outright', deductions.other_deductions.cia_outright)}
          {renderDeductionRow('HDMF LOAN', deductions.govt_deductions.hdmf_loan, 'Paraphernalias', deductions.other_deductions.paraphernalias)}
          {renderDeductionRow('HDMF Calamity', deductions.govt_deductions.hdmf_calamity, 'Losses', deductions.other_deductions.losses)}
          {renderDeductionRow('', 0, 'Uniform Advance', deductions.other_deductions.uniform_advance)}
          {renderDeductionRow('', 0, 'Electronics', deductions.other_deductions.electronics)}
          {renderDeductionRow('', 0, 'C/A Amortized', deductions.other_deductions.cia_amortized)}
          {renderDeductionRow('', 0, 'C/A Co-op', deductions.other_deductions.cia_coop)}
          {renderDeductionRow('', 0, 'Training Fee', deductions.other_deductions.training_fee)}
          
          <View style={styles.tableDeductionTotalRow}>
            <Text style={[styles.tableDeductionTotalCell, { flex: 1, textAlign: 'center' }]}>TOTAL DEDUCTIONS</Text>
            <Text style={[styles.tableDeductionTotalCell, styles.tableDeductionTotalDanger, { flex: 1, textAlign: 'center' }]}>
              {formatCurrency(data.total_deductions)}
            </Text>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.payslipFooter}>
          <View style={styles.footerLeft}>
            <Text style={styles.footerLabel}>Signature</Text>
            <View style={styles.signatureLine} />
            <Text style={styles.footerEmployeeName}>{data.employee_name}</Text>
            <Text style={styles.footerNote}>
              This is a computer-generated payslip and does not require a signature.
            </Text>
          </View>
          
          <View style={styles.footerRight}>
            <Text style={styles.footerClient}>Client: {data.client}</Text>
            <View style={styles.footerRateRow}>
              <Text style={styles.footerRateLabel}>DAILY RATE</Text>
              <Text style={styles.footerRateValue}>{formatCurrency(data.daily_rate)}</Text>
            </View>
            <View style={styles.footerNetPayRow}>
              <Text style={styles.footerNetPayLabel}>NETPAY</Text>
              <Text style={styles.footerNetPayValue}>{formatCurrency(data.net_pay)}</Text>
            </View>
          </View>
        </View>

        {/* Divider between payslips */}
        {position < total && <View style={styles.payslipDivider} />}
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      {/* Period Selector */}
      <View style={styles.periodSelector}>
        <View style={styles.periodHeader}>
          <Ionicons name="calendar-outline" size={20} color={theme.icon} />
          <Text style={styles.periodHeaderTitle}>Select Pay Period</Text>
          {loadingPeriods && (
            <ActivityIndicator size="small" color={theme.primary} style={{ marginLeft: 'auto' }} />
          )}
          {!loadingPeriods && (
            <View style={styles.periodActions}>
              <TouchableOpacity
                onPress={handleDownloadPayslip}
                disabled={downloading || !selectedPeriod}
                style={{ opacity: downloading || !selectedPeriod ? 0.5 : 1 }}
              >
                {downloading ? (
                  <ActivityIndicator size="small" color={theme.primary} />
                ) : (
                  <Ionicons name="download-outline" size={20} color={theme.icon} />
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={loadAvailablePeriods}>
                <Ionicons name="refresh-outline" size={20} color={theme.icon} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {loadingPeriods ? (
          <View style={styles.loadingBar} />
        ) : availablePeriods.length === 0 ? (
          <View style={styles.noPeriodsContainer}>
            <Ionicons name="warning-outline" size={20} color={theme.warning} />
            <Text style={styles.noPeriodsText}>No pay periods found</Text>
            <TouchableOpacity onPress={loadAvailablePeriods} style={styles.reloadButton}>
              <Text style={styles.reloadButtonText}>Reload</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.periodPickerButton}
            onPress={() => setShowPeriodPicker(!showPeriodPicker)}
          >
            <Text style={styles.periodPickerText}>
              {selectedPeriod ? selectedPeriod.displayText : 'Select Pay Period'}
            </Text>
            <Ionicons
              name={showPeriodPicker ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.icon}
            />
          </TouchableOpacity>
        )}

        {/* Period Dropdown */}
        {showPeriodPicker && availablePeriods.length > 0 && (
          <View style={styles.periodDropdown}>
            <ScrollView style={styles.periodDropdownScroll}>
              {availablePeriods.map((period, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.periodOption}
                  onPress={() => handlePeriodSelect(period)}
                >
                  <Text style={styles.periodOptionText}>{period.displayText}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      {/* Content */}
      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.primary} />
            <Text style={styles.loadingText}>Loading payslip...</Text>
          </View>
        ) : errorMessage ? (
          <View style={styles.errorContainer}>
            <Ionicons name="alert-circle-outline" size={64} color={theme.danger} />
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={() => fetchPayslipData()}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : !hasUserSelectedPeriod ? (
          <View style={styles.emptyStateContainer}>
            <Ionicons name="calendar-outline" size={64} color={theme.primary} />
            <Text style={styles.emptyStateText}>
              Please select a pay period from the dropdown above to view your payslip
            </Text>
          </View>
        ) : payslipList.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <Ionicons name="document-outline" size={64} color={theme.muted} />
            <Text style={styles.emptyStateText}>No payslip record for selected period</Text>
          </View>
        ) : (
          <View ref={payslipRef} collapsable={false} style={styles.payslipWrapper}>
            {payslipList.length > 1 && (
              <View style={styles.multiRecordNotice}>
                <Ionicons name="information-circle-outline" size={20} color={theme.primary} />
                <Text style={styles.multiRecordNoticeText}>
                  Found {payslipList.length} payslip records for the selected period
                </Text>
              </View>
            )}
            {payslipList.map((data, index) => 
              renderPayslipTemplate(data, index + 1, payslipList.length)
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: ThemeShape) => {
  const accentBorder = theme.scheme === 'dark' ? 'rgba(246, 185, 30, 0.35)' : 'rgba(246, 185, 30, 0.25)';
  const warningBackground = theme.scheme === 'dark' ? 'rgba(246, 185, 30, 0.16)' : 'rgba(246, 185, 30, 0.1)';
  const noticeBackground = theme.scheme === 'dark' ? 'rgba(246, 185, 30, 0.22)' : 'rgba(246, 185, 30, 0.12)';
  const tableHeaderBackground = theme.scheme === 'dark' ? 'rgba(79, 155, 255, 0.16)' : 'rgba(15, 23, 42, 0.04)';
  const grossRowBackground = theme.scheme === 'dark' ? 'rgba(246, 185, 30, 0.22)' : 'rgba(246, 185, 30, 0.12)';
  const deductionTotalBackground = theme.scheme === 'dark' ? 'rgba(248, 113, 113, 0.2)' : 'rgba(248, 113, 113, 0.12)';
  const dividerColor = theme.scheme === 'dark' ? 'rgba(148, 163, 184, 0.24)' : theme.border;

  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.background,
    },
    periodSelector: {
      top: 60,
      margin: 16,
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: accentBorder,
      shadowColor: theme.cardShadow,
      shadowOpacity: theme.scheme === 'dark' ? 0.4 : 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: theme.scheme === 'dark' ? 6 : 2,
    },
    periodHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
    },
    periodActions: {
      flexDirection: 'row',
      marginLeft: 'auto',
      gap: 12,
    },
    periodHeaderTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.text,
      fontFamily: 'Poppins',
      marginLeft: 8,
    },
    loadingBar: {
      height: 4,
      backgroundColor: theme.primary,
      borderRadius: 2,
    },
    noPeriodsContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 12,
      backgroundColor: warningBackground,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.warning,
    },
    noPeriodsText: {
      flex: 1,
      fontSize: 14,
      color: theme.text,
      marginLeft: 8,
      fontFamily: 'Poppins',
    },
    reloadButton: {
      backgroundColor: theme.primary,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 6,
    },
    reloadButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.onPrimary,
      fontFamily: 'Poppins',
    },
    periodPickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 12,
      backgroundColor: theme.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: dividerColor,
    },
    periodPickerText: {
      fontSize: 14,
      color: theme.text,
      fontFamily: 'Poppins',
    },
    periodDropdown: {
      marginTop: 8,
      backgroundColor: theme.card,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: dividerColor,
      maxHeight: 200,
    },
    periodDropdownScroll: {
      maxHeight: 200,
    },
    periodOption: {
      padding: 12,
      borderBottomWidth: 1,
      borderBottomColor: dividerColor,
    },
    periodOptionText: {
      fontSize: 14,
      color: theme.text,
      fontFamily: 'Poppins',
    },
    content: {
      marginTop: 50,
      flex: 1,
    },
    loadingContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },
    loadingText: {
      marginTop: 12,
      fontSize: 14,
      color: theme.muted,
      fontFamily: 'Poppins',
    },
    errorContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      paddingHorizontal: 20,
    },
    errorText: {
      marginTop: 16,
      fontSize: 16,
      color: theme.danger,
      textAlign: 'center',
      fontFamily: 'Poppins',
    },
    retryButton: {
      marginTop: 16,
      backgroundColor: theme.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    retryButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.onPrimary,
      fontFamily: 'Poppins',
    },
    emptyStateContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
      paddingHorizontal: 20,
    },
    emptyStateText: {
      marginTop: 16,
      fontSize: 16,
      color: theme.muted,
      textAlign: 'center',
      fontFamily: 'Poppins',
    },
    multiRecordNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      margin: 16,
      padding: 16,
      backgroundColor: noticeBackground,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.primary,
    },
    multiRecordNoticeText: {
      flex: 1,
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
      marginLeft: 12,
      fontFamily: 'Poppins',
    },
    payslipWrapper: {
      backgroundColor: theme.card,
    },
    payslipTemplate: {
      margin: 16,
      backgroundColor: theme.card,
      borderRadius: 12,
      padding: 16,
      shadowColor: theme.cardShadow,
      shadowOpacity: theme.scheme === 'dark' ? 0.35 : 0.08,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
      elevation: theme.scheme === 'dark' ? 6 : 4,
    },
    payslipHeader: {
      padding: 16,
      backgroundColor: theme.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: dividerColor,
      alignItems: 'center',
    },
    companyName: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.text,
      textAlign: 'center',
      fontFamily: 'Poppins',
    },
    payslipTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.text,
      marginTop: 8,
      fontFamily: 'Poppins',
    },
    recordNumber: {
      fontSize: 11,
      color: theme.muted,
      marginTop: 4,
      fontFamily: 'Poppins',
    },
    employeeInfo: {
      marginTop: 16,
      padding: 12,
      backgroundColor: theme.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: dividerColor,
    },
    employeeText: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 4,
      fontFamily: 'Poppins',
    },
    table: {
      marginTop: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: dividerColor,
      overflow: 'hidden',
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: tableHeaderBackground,
      padding: 8,
    },
    tableHeaderCell: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.text,
      fontFamily: 'Poppins',
    },
    tableRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: dividerColor,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    tableCell: {
      fontSize: 11,
      color: theme.text,
      fontFamily: 'Poppins',
    },
    tableCellLabel: {
      flex: 3,
      fontWeight: '500',
      color: theme.text,
    },
    tableCellCenter: {
      flex: 1,
      textAlign: 'center',
      color: theme.text,
    },
    tableCellRight: {
      flex: 1,
      textAlign: 'center',
      fontWeight: '500',
      color: theme.text,
    },
    tableTotalRow: {
      flexDirection: 'row',
      backgroundColor: tableHeaderBackground,
      padding: 8,
      borderTopWidth: 1,
      borderTopColor: dividerColor,
    },
    tableTotalCell: {
      fontSize: 11,
      fontWeight: '700',
      color: theme.text,
      fontFamily: 'Poppins',
    },
    tableGrossRow: {
      flexDirection: 'row',
      backgroundColor: grossRowBackground,
      padding: 8,
      borderTopWidth: 1,
      borderTopColor: dividerColor,
    },
    tableGrossCell: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.text,
      fontFamily: 'Poppins',
    },
    deductionRow: {
      flexDirection: 'row',
      borderBottomWidth: 1,
      borderBottomColor: dividerColor,
      paddingVertical: 6,
      paddingHorizontal: 8,
    },
    deductionCol: {
      flex: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
    },
    deductionLabel: {
      fontSize: 11,
      fontWeight: '500',
      color: theme.text,
      fontFamily: 'Poppins',
    },
    deductionValue: {
      fontSize: 11,
      fontWeight: '500',
      color: theme.text,
      textAlign: 'right',
      fontFamily: 'Poppins',
    },
    tableDeductionTotalRow: {
      flexDirection: 'row',
      backgroundColor: deductionTotalBackground,
      padding: 8,
      borderTopWidth: 1,
      borderTopColor: dividerColor,
    },
    tableDeductionTotalCell: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.text,
      fontFamily: 'Poppins',
    },
    tableDeductionTotalDanger: {
      color: theme.danger,
    },
    payslipFooter: {
      flexDirection: 'row',
      marginTop: 16,
    },
    footerLeft: {
      flex: 1,
      paddingRight: 8,
    },
    footerLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text,
      fontFamily: 'Poppins',
    },
    signatureLine: {
      height: 1,
      backgroundColor: dividerColor,
      marginTop: 20,
      marginBottom: 8,
    },
    footerEmployeeName: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text,
      fontFamily: 'Poppins',
    },
    footerNote: {
      fontSize: 10,
      color: theme.muted,
      marginTop: 20,
      fontFamily: 'Poppins',
    },
    footerRight: {
      flex: 1,
      paddingLeft: 8,
    },
    footerClient: {
      fontSize: 12,
      fontWeight: '600',
      color: theme.text,
      marginBottom: 16,
      fontFamily: 'Poppins',
    },
    footerRateRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    footerRateLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
      fontFamily: 'Poppins',
    },
    footerRateValue: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.text,
      fontFamily: 'Poppins',
    },
    footerNetPayRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 8,
    },
    footerNetPayLabel: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
      fontFamily: 'Poppins',
    },
    footerNetPayValue: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.text,
      fontFamily: 'Poppins',
    },
    payslipDivider: {
      height: 2,
      backgroundColor: theme.primary,
      marginVertical: 32,
    },
  });
};
