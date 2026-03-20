import authService from './authService';

const BASE = 'https://api.rds.ismis.com.ph/api/guard-attendance';

async function safeParse(text: string) {
	try { return JSON.parse(text); } catch { return text; }
}

export default {
	/**
	 * Fetch overtime-related attendance records for a given employee and date.
	 * This calls: GET /api/guard-attendance/overtime?employee_id=...&date=...&action=time_out
	 */
	fetchOvertimeAttendances: async (employeeId: number, date: string, action = 'time_out') => {
		try {
			const user = await authService.getUserData();
			const token = user?.access_token;
			const url = `${BASE}/overtime?employee_id=${encodeURIComponent(String(employeeId))}&date=${encodeURIComponent(date)}&action=${encodeURIComponent(action)}`;
			const res = await fetch(url, {
				method: 'GET',
				headers: {
					Accept: 'application/json',
					Authorization: token ? `Bearer ${token}` : '',
				},
			});
			const text = await res.text();
			const data = await safeParse(text);
			return { success: res.ok, status: res.status, data };
		} catch (e: any) {
			return { success: false, error: e.message || e };
		}
	},

	/**
	 * Get attendance details for a specific date for the current user.
	 * Returns latestTimeIn/latestTimeOut, branchId, guardType and timeInId/timeOutId when available.
	 */
	getAttendanceForDate: async (date: string, includeIds = false) => {
		try {
			const user = await authService.getUserData();
			const employeeId = Number(user?.employee_id || 0);
			const token = user?.access_token || '';
			if (!employeeId) return null;

			const res = await authService.getTimeEntryHistory(employeeId, token, date, date);
			if (!res || !res.success || !Array.isArray(res.data)) return null;

			let latestIn: string | null = null;
			let latestOut: string | null = null;
			let latestInTs = -Infinity;
			let latestOutTs = -Infinity;
			let timeInId: number | undefined;
			let timeOutId: number | undefined;
			let branchId: number | undefined;
			let guardType: string | undefined;

			// Normalize and pick the latest IN and OUT for the exact requested date
			res.data.forEach((rec: any) => {
				try {
					// Determine record date (YYYY-MM-DD)
					const recDateRaw = (rec.date || rec.created_at || rec.timestamp || '').toString();
					const recDate = recDateRaw.split(' ')[0];
					if (!recDate || recDate !== date) return; // ignore other dates

					const action = (rec.action || '').toString().toLowerCase();
					// Determine a timestamp for ordering. Prefer explicit datetime fields, fallback to combining date+time
					let ts = NaN as number;
					if (rec.timestamp || rec.created_at) {
						const parsed = Date.parse(rec.timestamp || rec.created_at);
						if (!isNaN(parsed)) ts = parsed;
					}
					if (isNaN(ts)) {
						// Try time-like fields
						const timeStr = rec.time || rec.time_out || rec.out_time || '';
						if (/^\d{2}:\d{2}(?::\d{2})?$/.test(String(timeStr).trim())) {
							const t = String(timeStr).trim().split(':');
							const hh = Number(t[0]);
							const mm = Number(t[1] || 0);
							const ss = Number(t[2] || 0);
							const dt = new Date(`${date}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:${String(ss).padStart(2,'0')}`);
							ts = dt.getTime();
						}
					}

					if (!branchId && (rec.branch_id || rec.branchId || rec.branch?.id)) {
						branchId = Number(rec.branch_id || rec.branchId || rec.branch?.id);
					}
					if (!guardType && rec.guard_type) guardType = rec.guard_type;

					if (action.includes('in')) {
						if (!isNaN(ts) && ts > latestInTs) {
							latestInTs = ts;
							latestIn = rec.time || rec.created_at || rec.timestamp || null;
							if (includeIds) timeInId = Number(rec.id || rec.guard_attendance_id || 0);
						}
					} else if (action.includes('out')) {
						if (!isNaN(ts) && ts > latestOutTs) {
							latestOutTs = ts;
							latestOut = rec.time || rec.time_out || rec.out_time || rec.created_at || rec.timestamp || null;
							if (includeIds) timeOutId = Number(rec.id || rec.guard_attendance_id || 0);
						}
					}
				} catch (e) {
					// ignore record parsing errors
				}
			});

			return {
				latestTimeIn: latestIn,
				latestTimeOut: latestOut,
				branchId,
				guardType,
				timeInId,
				timeOutId,
			};
		} catch (e: any) {
			return null;
		}
	},

	/**
	 * Get today's attendance summary for quick display (latest in/out).
	 */
	getTodayAttendance: async (includeIds = false) => {
		const today = new Date();
		const yyyy = today.getFullYear();
		const mm = String(today.getMonth() + 1).padStart(2, '0');
		const dd = String(today.getDate()).padStart(2, '0');
		const date = `${yyyy}-${mm}-${dd}`;
		// @ts-ignore - use this export to call getAttendanceForDate
		return (module.exports.default || module.exports).getAttendanceForDate(date, includeIds);
	},

	/**
	 * Fetch change/OT requests for an employee. Flexible endpoint handling.
	 */
	getChangeRequests: async (employeeId: number, date?: string) => {
		const endpoints = [
			`${BASE}/change-requests`,
			`${BASE}/requests`,
			`${BASE}/ot-requests`,
			`${BASE}`,
		];
		for (const ep of endpoints) {
			try {
				const url = date ? `${ep}?employee_id=${employeeId}&date=${encodeURIComponent(date)}` : `${ep}?employee_id=${employeeId}`;
				const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
				const text = await res.text();
				const data = await safeParse(text);
				if (res.ok) return { success: true, status: res.status, data };
			} catch (e) {
				// try next
			}
		}
		return { success: false };
	},

	/**
	 * Fetch OT requests specifically (uses authorization header).
	 * Calls: GET /api/guard-attendance/ot-requests?employee_id=...
	 */
	fetchOtRequests: async (employeeId: number, date?: string) => {
		try {
			const user = await authService.getUserData();
			const token = user?.access_token;
			const url = date ? `${BASE}/ot-requests?employee_id=${employeeId}&date=${encodeURIComponent(date)}` : `${BASE}/ot-requests?employee_id=${employeeId}`;
			const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json', Authorization: token ? `Bearer ${token}` : '' } });
			const text = await res.text();
			const data = await safeParse(text);
			return { success: res.ok, status: res.status, data };
		} catch (e: any) {
			return { success: false, error: e.message || e };
		}
	},

	/**
	 * Submit a generic change request. Tries a few endpoints.
	 */
	submitChangeRequest: async (payload: any) => {
		const endpoints = [
			`${BASE}/change-requests`,
			`${BASE}/requests`,
			`${BASE}`,
		];
		for (const ep of endpoints) {
			try {
				const res = await fetch(ep, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
					body: JSON.stringify(payload),
				});
				const text = await res.text();
				const data = await safeParse(text);
				if (res.ok) return { success: true, status: res.status, data };
				// if server returned errors, return that
				return { success: false, status: res.status, data };
			} catch (e) {
				// try next
			}
		}
		return { success: false, error: 'Failed to submit change request' };
	},

	/**
	 * Submit an OT request using the ot-requests endpoint.
	 * Payload shape expected by backend:
	 * { employee_id, branch_id, guard_attendance_id, date, reason }
	 */
	submitOtRequest: async (payload: any) => {
		try {
			const user = await authService.getUserData();
			const token = user?.access_token;
			const url = `${BASE}/ot-requests`;
			const res = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					Authorization: token ? `Bearer ${token}` : '',
				},
				body: JSON.stringify(payload),
			});
			const text = await res.text();
			const data = await safeParse(text);
			return { success: res.ok, status: res.status, data };
		} catch (e: any) {
			return { success: false, error: e.message || e };
		}
	},

	/**
	 * Apply an approved change request to guard attendance.
	 * Tries common endpoints with authorization.
	 * Args: { requestId, employeeId, branchId, date, action: 'time_in'|'time_out', requestedTime, guardAttendanceId?, guardType? }
	 */
	applyApprovedChangeRequest: async (args: {
		requestId: string;
		employeeId: number;
		branchId: number;
		date: string;
		action: 'time_in' | 'time_out';
		requestedTime: string;
		guardAttendanceId?: number;
		guardType?: string;
	}) => {
		try {
			const user = await authService.getUserData();
			const token = user?.access_token;
			const userId = Number((user as any)?.user_id || 0);
			const companyId = Number((user as any)?.user_company_id || 0);
			const guardName = (user as any)?.userName || undefined;
			const processedAt = new Date().toISOString();

			// normalize requestedTime -> if HH:mm or HH:mm:ss => convert to ISO-like dateTime `${date}T...`
			const t = String(args.requestedTime || '').trim();
			const hhmm = /^\d{2}:\d{2}(:\d{2})?$/.test(t);
			const normalizedTime = hhmm ? `${args.date}T${t.length === 5 ? `${t}:00` : t}` : t;

			// Build direct update payload to match guard_attendance schema
			const directBody: any = {
				action: args.action,
				time: normalizedTime,
				date: args.date,
				employee_id: Number(args.employeeId),
				branch_id: Number(args.branchId),
				company_id: companyId || undefined,
				processed_at: processedAt,
				is_processed: 1,
			};
			// only include updated_by if we have a sensible user id (>0)
			if (userId && userId > 0) directBody.updated_by = userId;
			if (guardName) directBody.guard_name = guardName;
			if (args.guardType) directBody.guard_type = args.guardType;

			// helper to call an endpoint and return verbose result
			const call = async (url: string, method: string, body: any) => {
				const res = await fetch(url, {
					method,
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json',
						Authorization: token ? `Bearer ${token}` : '',
					},
					body: JSON.stringify(body),
				});
				const text = await res.text();
				const data = await safeParse(text);
				return { ok: res.ok, status: res.status, url, method, body, text, data };
			};

			// If we have guardAttendanceId, try direct update on that row
			if (args.guardAttendanceId && token) {
				const target = `${BASE}/${encodeURIComponent(String(args.guardAttendanceId))}`;
				try {
					// Try PATCH
						let patchRes = await call(target, 'PATCH', directBody);
					console.log('applyApproved direct PATCH =>', patchRes);
					if (patchRes.ok) return { success: true, appliedVia: 'PATCH', result: patchRes };

					// Try PUT
					let putRes = await call(target, 'PUT', directBody);
					console.log('applyApproved direct PUT =>', putRes);
					if (putRes.ok) return { success: true, appliedVia: 'PUT', result: putRes };

					// Try POST to same resource
					let postRes = await call(target, 'POST', directBody);
					console.log('applyApproved direct POST =>', postRes);
					if (postRes.ok) return { success: true, appliedVia: 'POST', result: postRes };

					// If none succeeded, continue to fallback endpoints
					// If we hit a foreign key error (updated_by not found), retry without updated_by
					const last = (typeof putRes !== 'undefined' && putRes) || (typeof patchRes !== 'undefined' && patchRes) || null;
					const fkError = last && typeof last.text === 'string' && /foreign key|1452|updated_by_foreign/i.test(last.text);
					if (fkError) {
						const bodyNoUpdated = { ...directBody };
						delete bodyNoUpdated.updated_by;
						try {
							const retryPatch = await call(target, 'PATCH', bodyNoUpdated);
							console.log('applyApproved retry PATCH w/o updated_by =>', retryPatch);
							if (retryPatch.ok) return { success: true, appliedVia: 'PATCH-no-updated_by', result: retryPatch };
							const retryPut = await call(target, 'PUT', bodyNoUpdated);
							console.log('applyApproved retry PUT w/o updated_by =>', retryPut);
							if (retryPut.ok) return { success: true, appliedVia: 'PUT-no-updated_by', result: retryPut };
							const retryPost = await call(target, 'POST', bodyNoUpdated);
							console.log('applyApproved retry POST w/o updated_by =>', retryPost);
							if (retryPost.ok) return { success: true, appliedVia: 'POST-no-updated_by', result: retryPost };
						} catch (e2) {
							console.log('applyApproved retry without updated_by error', e2);
						}
					}
				} catch (e) {
					console.log('applyApproved direct update error', e);
				}
			}

			// Fallback endpoints (POST payload expects request context)
			const fallbackPayload = {
				request_id: args.requestId,
				guard_attendance_id: args.guardAttendanceId,
				employee_id: args.employeeId,
				branch_id: args.branchId,
				date: args.date,
				action: args.action,
				requested_time: args.requestedTime,
				guard_type: args.guardType,
				company_id: companyId || undefined,
				updated_by: userId || undefined,
			};
			const endpoints = [
				`${BASE}/apply-approved`,
				`${BASE}/change-requests/apply`,
				`${BASE}/requests/apply`,
				`${BASE}/apply-approved-by-id`,
				`${BASE}/attendance/apply`,
			];
			for (const ep of endpoints) {
				try {
					const res = await fetch(ep, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							Accept: 'application/json',
							Authorization: token ? `Bearer ${token}` : '',
						},
						body: JSON.stringify(fallbackPayload),
					});
					const text = await res.text();
					const data = await safeParse(text);
					const info = { ok: res.ok, status: res.status, endpoint: ep, payload: fallbackPayload, text, data };
					console.log('applyApproved fallback =>', info);
					if (res.ok) return { success: true, appliedVia: ep, result: info };
					// return detailed failure so caller can inspect exact server response
					return { success: false, appliedVia: ep, result: info };
				} catch (e) {
					console.log('applyApproved fallback error for', ep, e);
				}
			}

			return { success: false, error: 'All apply attempts failed' };
		} catch (e: any) {
			return { success: false, error: e?.message || e };
		}
	},

	/**
	 * Directly fetches the guard_attendance row by id, merges in the approved requested time
	 * and audit fields, then PUTs the full record back (falls back to PATCH if PUT fails).
	 */
	applyDirectUpdateById: async (args: {
		guardAttendanceId: number;
		requestId?: string;
		employeeId: number;
		branchId: number;
		date: string;
		action: 'time_in' | 'time_out';
		requestedTime: string;
		guardType?: string;
	}) => {
		try {
			const user = await authService.getUserData();
			const token = user?.access_token;
			const userId = Number((user as any)?.user_id || 0);
			const companyId = Number((user as any)?.user_company_id || 0);
			const guardName = (user as any)?.userName || undefined;
			const processedAt = new Date().toISOString();

			if (!args.guardAttendanceId) return { success: false, error: 'No guardAttendanceId provided' };

			// normalize requestedTime -> if HH:mm or HH:mm:ss => convert to ISO-like datetime `${date}T...`
			const t = String(args.requestedTime || '').trim();
			const hhmm = /^\d{2}:\d{2}(:\d{2})?$/.test(t);
			const normalizedTime = hhmm ? `${args.date}T${t.length === 5 ? `${t}:00` : t}` : t;

			const target = `${BASE}/${encodeURIComponent(String(args.guardAttendanceId))}`;

			// 1) GET the existing record
			const getRes = await fetch(target, {
				method: 'GET',
				headers: {
					Accept: 'application/json',
					Authorization: token ? `Bearer ${token}` : '',
				},
			});
			const getText = await getRes.text();
			const getData = await safeParse(getText);
			if (!getRes.ok) {
				return { success: false, step: 'GET', status: getRes.status, text: getText, data: getData };
			}

			// normalize server response object (some APIs return { data: {...} } )
			const existing = (getData && (getData.data || getData)) || {};

			// 2) Merge updates into full record
			const updatedRecord: any = {
				...existing,
				action: args.action,
				time: normalizedTime,
				date: args.date,
				employee_id: Number(args.employeeId),
				branch_id: Number(args.branchId),
				company_id: companyId || existing.company_id,
				updated_by: userId || existing.updated_by,
				processed_at: processedAt,
				is_processed: 1,
			};
			if (guardName) updatedRecord.guard_name = guardName;
			if (args.guardType) updatedRecord.guard_type = args.guardType;

			// ensure numeric fields are numbers
			const numericFields = ['employee_id','branch_id','company_id','is_processed','updated_by'];
			for (const k of numericFields) {
				if (updatedRecord[k] !== undefined) updatedRecord[k] = Number(updatedRecord[k]);
			}

			// 3) PUT the full updated record back (some APIs expect PUT for full resource replace)
			const putRes = await fetch(target, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					Authorization: token ? `Bearer ${token}` : '',
				},
				body: JSON.stringify(updatedRecord),
			});
			const putText = await putRes.text();
			const putData = await safeParse(putText);

			// 4) If PUT fails, try PATCH as fallback with the same body
			if (!putRes.ok) {
				const patchRes = await fetch(target, {
					method: 'PATCH',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json',
						Authorization: token ? `Bearer ${token}` : '',
					},
					body: JSON.stringify(updatedRecord),
				});
				const patchText = await patchRes.text();
				const patchData = await safeParse(patchText);
				if (patchRes.ok) {
					return { success: true, appliedVia: 'PATCH-after-PUT-failed', get: { status: getRes.status, data: getData }, patch: { status: patchRes.status, text: patchText, data: patchData } };
				}
				// return both PUT and PATCH results for debugging
				return { success: false, step: 'PUT+PATCH', put: { status: putRes.status, text: putText, data: putData }, patch: { status: patchRes.status, text: patchText, data: patchData } };
			}

			// success
			return { success: true, appliedVia: 'PUT', get: { status: getRes.status, data: getData }, put: { status: putRes.status, text: putText, data: putData } };
		} catch (e: any) {
			return { success: false, error: e?.message || e };
		}
	},

	/**
	 * Post attendance (time in/out) with site-first payload and branch fallback compatibility
	 * Internally maps site_id to branch_id for legacy API during transition
	 * Args: { siteId, action: 'time_in'|'time_out', timestamp, employeeId, companyId, guardType? }
	 */
	postAttendanceWithSiteFallback: async (args: {
		siteId: number;
		action: 'time_in' | 'time_out';
		timestamp: string;
		employeeId: number;
		companyId: number;
		guardType?: string;
	}) => {
		try {
			const user = await authService.getUserData();
			const token = user?.access_token;

			// Build payload with site-first intent but branch-compatible structure for current API
			const payload: any = {
				employee_id: args.employeeId,
				branch_id: args.siteId, // Fallback: map site_id to branch_id for legacy API
				company_id: args.companyId,
				action: args.action,
				timestamp: args.timestamp,
				time: args.timestamp,
			};

			if (args.guardType) {
				payload.guard_type = args.guardType;
			}

			const url = `${BASE}`;
			const res = await fetch(url, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
					Authorization: token ? `Bearer ${token}` : '',
				},
				body: JSON.stringify(payload),
			});

			const text = await res.text();
			const data = await safeParse(text);

			console.log(
				`[AttendanceService] ${args.action} posted. Site/Branch ID: ${args.siteId}, Status: ${res.status}`
			);

			return { success: res.ok, status: res.status, data };
		} catch (e: any) {
			console.error(`[AttendanceService] Error posting ${args.action}:`, e);
			return { success: false, error: e.message || e };
		}
	},
};

