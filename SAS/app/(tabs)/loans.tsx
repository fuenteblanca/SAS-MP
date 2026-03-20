import { useThemeColors } from '@/hooks/use-theme';
import authService from '@/services/authService';
import loanService from '@/services/loanService';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type ThemeShape = ReturnType<typeof useThemeColors>;

export default function LoansScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loans, setLoans] = useState<any[]>([]);
  // companyId will be derived from the logged in user (user_company_id)
  const [companyId, setCompanyId] = useState<number | null>(null);
  // Loan type filter
  const [selectedLoanType, setSelectedLoanType] = useState<string>('All');
  const [showLoanTypePicker, setShowLoanTypePicker] = useState<boolean>(false);
  const [expandedPeriods, setExpandedPeriods] = useState<Set<string>>(new Set());
  const theme = useThemeColors();
  const styles = useMemo(() => createStyles(theme), [theme]);

  // Add header back button on top navigation
  React.useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => {
            // Prefer native back if available; else fallback
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

  const load = async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError(null);
    try {
      const user = await authService.getUserData();
      const employeeId = Number(user?.employee_id || 0);
      const derivedCompanyId = user?.user_company_id ? Number(user.user_company_id) : null;

      if (!employeeId) {
        setError('No employee id available. Please login.');
        setLoans([]);
        return;
      }

      if (!derivedCompanyId) {
        setError('No company associated with this user.');
        setLoans([]);
        return;
      }

      // Persist the derived companyId in local state so UI can react if needed
      if (companyId !== derivedCompanyId) setCompanyId(derivedCompanyId);

      const res = await loanService.getLoans(employeeId, derivedCompanyId);
      if (!res || !res.success) {
        const msg = res?.error || (res?.data && (res.data.message || JSON.stringify(res.data))) || `Status ${res?.status}`;
        setError(String(msg));
        setLoans([]);
        return;
      }

      // Normalize response: array or object
      let items: any[] = [];
      if (Array.isArray(res.data)) items = res.data;
      else if (res.data && Array.isArray(res.data.data)) items = res.data.data;
      else if (res.data && typeof res.data === 'object') items = [res.data];

      setLoans(items);
    } catch (e: any) {
      setError(String(e?.message || e));
      setLoans([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Load once on mount. companyId is derived from user data inside `load`.
  useEffect(() => { load({ silent: false }); }, []);

  // On Android back, stay within Profile tab instead of going Home
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      try {
        router.replace('/(tabs)/profile');
        return true; // prevent default behavior
      } catch {
        return false;
      }
    });
    return () => sub.remove();
  }, [router]);

  const onRefresh = () => { setRefreshing(true); load({ silent: true }); };

  // Group loans by header (loan_date .. loan_name) and collect per-pay-period deductions
  const groupedLoans = useMemo(() => {
    const groups: Record<string, any> = {};

    for (const item of loans) {
      const loan_date = item.loan_date || item.date || item.loanDate || '';
      const employee_id = item.employee_id || item.emp_id || item.employeeId || '';
      const loan_amount = item.loan_amount || item.amount || item.principal || '';
      const loan_amortization = item.loan_amortization || item.amortization || '';
      const loan_balance = item.loan_balance || item.balance || '';
      const reference = item.reference || item.remarks || '';
      const loan_name = item.loan_name || item.name || item.loanName || '';

      const headerKey = `${loan_date}|${employee_id}|${loan_amount}|${loan_amortization}|${loan_balance}|${reference}|${loan_name}`;

      const deduction = {
        amount_deducted: item.amount_deducted || item.deduction || item.amount || item.loan_amortization || '',
        pay_year: item.pay_year || item.year || '',
        pay_period: item.pay_period || item.period || item.pay_period_no || '',
      };

      if (!groups[headerKey]) {
        groups[headerKey] = {
          header: { loan_date, employee_id, loan_amount, loan_amortization, loan_balance, reference, loan_name },
          deductions: [],
        };
      }

      // Only push deduction if it has pay_period or amount
      if (deduction.pay_period || deduction.amount_deducted) groups[headerKey].deductions.push(deduction);
    }

    // Convert to array and sort by header.loan_date desc
    const arr = Object.values(groups).map((g: any) => ({ ...g }));
    arr.sort((a: any, b: any) => (b.header.loan_date || '').localeCompare(a.header.loan_date || ''));
    return arr;
  }, [loans]);

  // Unique loan types
  const loanTypes = useMemo(() => {
    const set = new Set<string>();
    for (const item of loans) {
      const name = item.loan_name || item.name || item.loanName || 'Unknown';
      if (name) set.add(String(name));
    }
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    return ['All', ...arr];
  }, [loans]);

  // Filter groups by selected type
  const filteredGroupedLoans = useMemo(() => {
    if (!selectedLoanType || selectedLoanType === 'All') return groupedLoans;
    return groupedLoans.filter((g: any) => {
      const name = g?.header?.loan_name || 'Unknown';
      return String(name) === selectedLoanType;
    });
  }, [groupedLoans, selectedLoanType]);

  // Aggregate loans when a specific type is selected
  const displayLoans = useMemo(() => {
    if (selectedLoanType && selectedLoanType !== 'All' && filteredGroupedLoans.length > 0) {
      // Calculate totals and collect loan details
      let totalOutstandingBalance = 0;
      const allDeductions: any[] = [];
      const loanDetails: any[] = [];

      filteredGroupedLoans.forEach((loan: any) => {
        const h = loan.header;
        totalOutstandingBalance += parseFloat(h.loan_balance || 0);
        
        // Add loan reference to each deduction for breakdown
        loan.deductions.forEach((d: any) => {
          allDeductions.push({
            ...d,
            loan_ref: h.reference || h.loan_name || 'Loan'
          });
        });
        
        // Store individual loan details
        loanDetails.push({
          description: h.reference || h.loan_name || 'Loan',
          loanAmount: h.loan_amount || '0.00',
          monthlyAmort: h.loan_amortization || '0.00',
          balance: h.loan_balance || '0.00'
        });
      });

      // Group deductions by period and calculate totals
      const groupedDeductions: Record<string, any> = {};
      allDeductions.forEach((d) => {
        const key = `${d.pay_year || ''}-${d.pay_period || ''}`;
        if (!groupedDeductions[key]) {
          groupedDeductions[key] = {
            pay_year: d.pay_year,
            pay_period: d.pay_period,
            total_amount: 0,
            breakdown: []
          };
        }
        groupedDeductions[key].total_amount += parseFloat(d.amount_deducted || 0);
        groupedDeductions[key].breakdown.push({
          loan_ref: d.loan_ref,
          amount: d.amount_deducted || '0.00'
        });
      });

      // Convert to array and sort by year and period (most recent first)
      const sortedDeductions = Object.values(groupedDeductions).sort((a: any, b: any) => {
        const yearA = parseInt(a.pay_year || '0');
        const yearB = parseInt(b.pay_year || '0');
        const periodA = parseInt(a.pay_period || '0');
        const periodB = parseInt(b.pay_period || '0');
        if (yearB !== yearA) return yearB - yearA;
        return periodB - periodA;
      });

      // Return single aggregated loan with details
      return [{
        header: {
          loan_name: selectedLoanType,
          loan_balance: totalOutstandingBalance.toFixed(2),
        },
        loanDetails: loanDetails,
        deductions: sortedDeductions,
        isAggregated: true
      }];
    }
    return filteredGroupedLoans;
  }, [filteredGroupedLoans, selectedLoanType]);

  const renderGroup = ({ item, index }: { item: any; index: number }) => {
    const h = item.header;
    const headerLoanAmount = h.loan_amount || '';
    const headerBalance = h.loan_balance || '';
    const headerAmort = h.loan_amortization || '';
    const headerRef = h.reference || '';
    const headerName = h.loan_name || 'Loan';
    const headerDate = h.loan_date || '';
    const isAggregated = item.isAggregated || false;

    return (
      <View style={styles.card}>
        {/* Header Section */}
        <View style={styles.cardHeader}>
          <View style={styles.loanTitleContainer}>
            <Text style={[styles.loanName, isAggregated && styles.aggregatedTitle]}>{headerName}</Text>
            {!isAggregated && headerRef ? <Text style={styles.referenceText}>{headerRef}</Text> : null}
          </View>
          <View style={styles.dateBalanceContainer}>
            {!isAggregated && headerDate ? <Text style={styles.dateText}>{headerDate}</Text> : null}
          </View>
        </View>

        {/* Aggregated Display for Selected Loan Type */}
        {isAggregated && item.loanDetails ? (
          <View>
            {/* Loan Details Table */}
            <View style={styles.loanDetailsTable}>
              {/* Table Header */}
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableHeaderCell, styles.descriptionColumn]}>Description of Loans</Text>
                <Text style={[styles.tableHeaderCell, styles.amountColumn]}>Loan Amount</Text>
                <Text style={[styles.tableHeaderCell, styles.amountColumn]}>Amorti{'\n'}zation</Text>
                <Text style={[styles.tableHeaderCell, styles.amountColumn]}>Balance</Text>
              </View>
              {/* Table Rows */}
              {item.loanDetails.map((detail: any, idx: number) => (
                <View key={idx} style={styles.tableDataRow}>
                  <Text style={[styles.tableDataCell, styles.descriptionColumn]}>{detail.description}</Text>
                  <Text style={[styles.tableDataCell, styles.amountColumn]}>₱{detail.loanAmount}</Text>
                  <Text style={[styles.tableDataCell, styles.amountColumn]}>₱{detail.monthlyAmort}</Text>
                  <Text style={[styles.tableDataCell, styles.amountColumn]}>₱{detail.balance}</Text>
                </View>
              ))}
            </View>

            {/* Outstanding Balance */}
            <View style={styles.totalBalanceSection}>
              <Text style={styles.outstandingLabel}>Outstanding Balance</Text>
              <Text style={styles.outstandingAmount}>₱{headerBalance || '0.00'}</Text>
            </View>
          </View>
        ) : (
          /* Regular Balance Display for non-aggregated loans */
          <View style={styles.balanceSection}>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Loan Amount</Text>
              <Text style={styles.balanceAmount}>₱{headerLoanAmount || '0.00'}</Text>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>Amortization</Text>
              <Text style={styles.amortAmount}>₱{headerAmort || '0.00'}</Text>
            </View>
            <View style={[styles.balanceRow, styles.outstandingRow]}>
              <Text style={styles.outstandingLabel}>Outstanding Balance</Text>
              <Text style={styles.outstandingAmount}>₱{headerBalance || '0.00'}</Text>
            </View>
          </View>
        )}

        {/* Deductions Section */}
        <View style={styles.deductionsSection}>
          <Text style={styles.deductionsTitle}>Payment History</Text>
          {item.deductions.length === 0 ? (
            <View style={styles.emptyDeductions}>
              <Text style={styles.emptyText}>No payment records yet</Text>
            </View>
          ) : (
            <View style={styles.deductionsList}>
              {item.deductions.map((d: any, idx: number) => {
                const py = d.pay_year ? Number(d.pay_year) : undefined;
                const pp = d.pay_period ? Number(d.pay_period) : undefined;
                const range = (py && pp) ? computePayPeriodRange(py, pp) : null;
                const fallbackDate = d.loan_date || d.date || null;
                const periodKey = `${d.pay_year || ''}-${d.pay_period || ''}`;
                const isExpanded = expandedPeriods.has(periodKey);
                const hasBreakdown = isAggregated && d.breakdown && d.breakdown.length > 0;
                
                const toggleExpand = () => {
                  if (!hasBreakdown) return;
                  setExpandedPeriods(prev => {
                    const newSet = new Set(prev);
                    if (newSet.has(periodKey)) {
                      newSet.delete(periodKey);
                    } else {
                      newSet.add(periodKey);
                    }
                    return newSet;
                  });
                };

                return (
                  <View key={`deduction-${idx}-${d.pay_year || ''}-${d.pay_period || ''}`}>
                    <TouchableOpacity 
                      onPress={toggleExpand}
                      style={[styles.deductionItem, hasBreakdown && styles.clickableDeduction]}
                      disabled={!hasBreakdown}
                    >
                      <View style={styles.deductionLeft}>
                        <Text style={styles.periodText}>{range ? range : (fallbackDate ? fallbackDate : '—')}</Text>
                      </View>
                      <View style={styles.deductionRight}>
                        <Text style={styles.deductionAmount}>
                          {d.total_amount ? `₱${d.total_amount.toFixed(2)}` : (d.amount_deducted ? `₱${d.amount_deducted}` : '-')}
                        </Text>
                        {hasBreakdown && (
                          <Ionicons 
                            name={isExpanded ? 'chevron-up' : 'chevron-down'} 
                            size={16} 
                            color={theme.muted} 
                            style={{ marginLeft: 8 }}
                          />
                        )}
                      </View>
                    </TouchableOpacity>
                    
                    {/* Breakdown Section */}
                    {hasBreakdown && isExpanded && (
                      <View style={styles.breakdownContainer}>
                        {d.breakdown.map((b: any, bIdx: number) => (
                          <View key={bIdx} style={styles.breakdownItem}>
                            <Text style={styles.breakdownLoan}>{b.loan_ref}</Text>
                            <Text style={styles.breakdownAmount}>₱{b.amount}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>
      </View>
    );
  };

  // Compute pay period date range. Assumes semi-monthly (24 periods) by default.
  // For period 1..24: odd => 1st-15th of month ceil(n/2), even => 16th-lastday of month.
  // If period is >24 and <=26, fall back to a simple biweekly assumption starting Jan 1.
  const computePayPeriodRange = (year: number, period: number): string | null => {
    if (!year || !period) return null;

    // Semi-monthly
    if (period >= 1 && period <= 24) {
      const month = Math.ceil(period / 2); // 1..12
      const isFirstHalf = period % 2 === 1;
      const start = isFirstHalf ? new Date(year, month - 1, 1) : new Date(year, month - 1, 16);
      const end = isFirstHalf ? new Date(year, month - 1, 15) : new Date(year, month, 0); // last day of month
      const opts: Intl.DateTimeFormatOptions = { month: 'short', day: '2-digit' };
      const s = start.toLocaleDateString('en-US', opts);
      const e = end.toLocaleDateString('en-US', opts);
      return `${s} - ${e}, ${year}`;
    }

    // Simple biweekly fallback (assume period 1 starts Jan 1, each period is 14 days)
    if (period >= 1 && period <= 26) {
      const start = new Date(year, 0, 1 + (period - 1) * 14);
      const end = new Date(start);
      end.setDate(start.getDate() + 13);
      const opts: Intl.DateTimeFormatOptions = { month: 'short', day: '2-digit' };
      const s = start.toLocaleDateString('en-US', opts);
      const e = end.toLocaleDateString('en-US', opts);
      return `${s} - ${e}, ${year} (biweekly assumed)`;
    }

    return null;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Loans</Text>
        <Text style={styles.subtitle}>Track your loan balances and payments</Text>
      </View>

      {/* Loan Type Selector (styled like pay period selector) */}
      <View style={styles.filterSelector}>
        <View style={styles.filterHeader}>
          <Ionicons name="funnel-outline" size={20} color={theme.icon} />
          <Text style={styles.filterHeaderTitle}>Select Loan Type</Text>
          <View style={styles.filterActions}>
            {/* Optional: refresh list */}
            <TouchableOpacity onPress={() => load({ silent: false })}>
              <Ionicons name="refresh-outline" size={20} color={theme.icon} />
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingBar} />
        ) : loanTypes.length <= 1 ? (
          <View style={styles.noFilterContainer}>
            <Ionicons name="warning-outline" size={20} color={theme.warning} />
            <Text style={styles.noFilterText}>No loan types found</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.filterPickerButton}
            onPress={() => setShowLoanTypePicker(!showLoanTypePicker)}
          >
            <Text style={styles.filterPickerText}>{selectedLoanType || 'All'}</Text>
            <Ionicons
              name={showLoanTypePicker ? 'chevron-up' : 'chevron-down'}
              size={20}
              color={theme.icon}
            />
          </TouchableOpacity>
        )}

        {showLoanTypePicker && loanTypes.length > 1 && (
          <View style={styles.filterDropdown}>
            <FlatList
              data={loanTypes}
              keyExtractor={(t) => t}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.filterOption}
                  onPress={() => { setSelectedLoanType(item); setShowLoanTypePicker(false); }}
                >
                  <Text style={styles.filterOptionText}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={theme.primary} />
      ) : error ? (
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.danger }}>Error: {error}</Text>
          <TouchableOpacity style={{ marginTop: 12 }} onPress={() => load({ silent: false })}>
            <Text style={{ color: theme.accent, fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : loans.length === 0 ? (
        <View style={{ padding: 20 }}>
          <Text style={{ color: theme.muted }}>No loans found for this company.</Text>
        </View>
      ) : (
        <FlatList
          data={displayLoans}
          keyExtractor={(g, idx) => String((g.header && g.header.reference) || idx)}
          renderItem={renderGroup}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
    </View>
  );
}

const createStyles = (theme: ThemeShape) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.background },
    header: {
      padding: 20,
      paddingTop: 24,
      paddingBottom: 20,
      backgroundColor: theme.card,
      borderBottomWidth: 0,
      shadowColor: theme.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.scheme === 'dark' ? 0.35 : 0.08,
      shadowRadius: 3,
      elevation: theme.scheme === 'dark' ? 6 : 3,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: theme.text,
      fontFamily: 'Poppins-Bold',
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 13,
      color: theme.muted,
      fontFamily: 'Poppins-Regular',
    },
    // Filter selector styles (adapted from payslip period selector)
    filterSelector: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 4,
    },
    filterHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    filterHeaderTitle: {
      marginLeft: 8,
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
    },
    filterActions: {
      marginLeft: 'auto',
      flexDirection: 'row',
      gap: 12,
    },
    loadingBar: {
      height: 4,
      backgroundColor: theme.border,
      borderRadius: 2,
      marginTop: 6,
    },
    noFilterContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 6,
    },
    noFilterText: {
      color: theme.muted,
      fontSize: 12,
    },
    filterPickerButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 8,
    },
    filterPickerText: {
      color: theme.text,
      fontSize: 14,
      fontWeight: '600',
    },
    filterDropdown: {
      marginTop: 6,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 8,
      backgroundColor: theme.card,
      maxHeight: 220,
    },
    filterOption: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    filterOptionText: {
      color: theme.text,
      fontSize: 14,
    },
    companyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
    companyBtn: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      marginRight: 8,
      backgroundColor: theme.card,
      borderWidth: 1,
      borderColor: theme.border,
    },
    companyBtnActive: {
      backgroundColor: theme.accent,
    },
    card: {
      backgroundColor: theme.card,
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
      borderLeftWidth: 8,
      borderLeftColor: theme.primary,
      shadowColor: theme.cardShadow,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: theme.scheme === 'dark' ? 0.4 : 0.08,
      shadowRadius: 6,
      elevation: theme.scheme === 'dark' ? 6 : 2,
    },
    aggregatedTitle: {
      color: theme.primary,
      fontSize: 18,
    },
    loanDetailsTable: {
      backgroundColor: theme.surface,
      borderRadius: 8,
      padding: 12,
      marginBottom: 16,
    },
    tableHeaderRow: {
      flexDirection: 'row',
      paddingBottom: 12,
      borderBottomWidth: 2,
      borderBottomColor: theme.border,
      marginBottom: 8,
    },
    tableHeaderCell: {
      fontSize: 12,
      fontWeight: '700',
      color: theme.text,
      fontFamily: 'Poppins-Bold',
    },
    tableDataRow: {
      flexDirection: 'row',
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    tableDataCell: {
      fontSize: 13,
      color: theme.text,
      fontFamily: 'Poppins-Regular',
    },
    descriptionColumn: {
      flex: 1,
      paddingRight: 8,
    },
    amountColumn: {
      flex: 1,
      textAlign: 'center',
    },
    totalBalanceSection: {
      backgroundColor: theme.surface,
      padding: 16,
      borderRadius: 8,
      marginBottom: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 3,
      borderTopColor: theme.primary,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    loanTitleContainer: {
      flex: 1,
    },
    loanName: {
      fontSize: 16,
      fontWeight: '800',
      color: theme.text,
      fontFamily: 'Poppins-Bold',
    },
    referenceText: {
      fontSize: 12,
      color: theme.muted,
      marginTop: 4,
      fontFamily: 'Poppins-Regular',
    },
    dateBalanceContainer: {
      alignItems: 'flex-end',
    },
    dateText: {
      fontSize: 11,
      color: theme.muted,
      fontFamily: 'Poppins-Regular',
    },
    balanceSection: {
      backgroundColor: theme.surface,
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
    },
    balanceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
    },
    balanceLabel: {
      fontSize: 13,
      color: theme.muted,
      fontFamily: 'Poppins-Regular',
    },
    balanceAmount: {
      fontSize: 15,
      fontWeight: '700',
      color: theme.text,
      fontFamily: 'Poppins-SemiBold',
    },
    amortAmount: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.secondaryText,
      fontFamily: 'Poppins-SemiBold',
    },
    outstandingRow: {
      marginTop: 4,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: theme.border,
    },
    outstandingLabel: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
      fontFamily: 'Poppins-Bold',
    },
    outstandingAmount: {
      fontSize: 18,
      fontWeight: '800',
      color: theme.primary,
      fontFamily: 'Poppins-Bold',
    },
    deductionsSection: {
      marginTop: 4,
    },
    deductionsTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
      marginBottom: 12,
      fontFamily: 'Poppins-SemiBold',
    },
    emptyDeductions: {
      padding: 16,
      backgroundColor: theme.surface,
      borderRadius: 8,
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 13,
      color: theme.muted,
      fontStyle: 'italic',
      fontFamily: 'Poppins-Regular',
    },
    deductionsList: {
      backgroundColor: theme.surface,
      borderRadius: 8,
      padding: 8,
    },
    deductionItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    clickableDeduction: {
      backgroundColor: theme.surface,
    },
    deductionLeft: {
      flex: 1,
      marginRight: 12,
    },
    deductionRight: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    periodText: {
      fontSize: 12,
      color: theme.secondaryText,
      fontFamily: 'Poppins-Regular',
    },
    deductionAmount: {
      fontSize: 14,
      fontWeight: '700',
      color: theme.text,
      fontFamily: 'Poppins-Bold',
    },
    breakdownContainer: {
      backgroundColor: theme.background,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
    },
    breakdownItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 6,
      paddingLeft: 12,
    },
    breakdownLoan: {
      fontSize: 12,
      color: theme.secondaryText,
      fontFamily: 'Poppins-Regular',
      flex: 1,
    },
    breakdownAmount: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.text,
      fontFamily: 'Poppins-SemiBold',
    },
  });
