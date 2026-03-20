// Lightweight JS mapper so it can be executed by a simple Node test script

function parseTimestamp(req) {
  const candidates = [
    req.approved_at,
    req.updated_at,
    req.created_at,
    req.date,
    req.timestamp,
    req.time,
    req.time_out_at,
    req.time_out,
  ];
  for (const c of candidates) {
    if (!c) continue;
    const s = String(c);
    const parsed = Date.parse(s);
    if (!isNaN(parsed)) return parsed;
    // Try extracting YYYY-MM-DD or HH:MM from strings
    const dateOnly = s.split(' ')[0];
    const p2 = Date.parse(dateOnly + 'T00:00:00');
    if (!isNaN(p2)) return p2;
  }
  return 0;
}

function formatTime12(timeStr) {
  if (!timeStr) return '';
  try {
    const s = String(timeStr).trim();
    const m = s.match(/^(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (m) {
      let hh = parseInt(m[1], 10);
      const mm = m[2];
      const suffix = hh >= 12 ? 'PM' : 'AM';
      hh = hh % 12;
      if (hh === 0) hh = 12;
      return `${hh}:${mm} ${suffix}`;
    }
    return s;
  } catch (e) {
    return String(timeStr);
  }
}

function mapRequests(apiRequests) {
  if (!Array.isArray(apiRequests)) apiRequests = [];
  const mapped = apiRequests
    .filter(r => r && typeof r === 'object')
    .map(req => {
      const actionRaw = String(req.action || req.type || '').toLowerCase();
      let typeLabel = 'Request';
      let iconName = 'list';
      let iconColor = '#374151';
      if (actionRaw.includes('time_in')) {
        typeLabel = 'Time In'; iconName = 'log-in-outline'; iconColor = '#000000';
      } else if (actionRaw.includes('time_out')) {
        typeLabel = 'Time Out'; iconName = 'log-out-outline'; iconColor = '#000000';
      } else if (actionRaw.includes('ot') || actionRaw.includes('overtime')) {
        typeLabel = 'Overtime'; iconName = 'time-outline'; iconColor = '#000000';
      } else if (req._endpoint && String(req._endpoint).includes('ot')) {
        typeLabel = 'Overtime'; iconName = 'time-outline'; iconColor = '#000000';
      } else if (req.guard_attendance_id || req.time_out_at || req.out_time) {
        // Likely an OT request if it has guard_attendance_id or time_out fields
        typeLabel = 'Overtime'; iconName = 'time-outline'; iconColor = '#000000';
      }
      const requestedTimeRaw = req.requested_time || req.time_out || req.out_time || req.time || req.time_out_at || '';

      // Robust status extraction + normalization
      const statusCandidates = [
        req.status,
        req.approval_status,
        req.request_status,
        req.decision,
        req.state,
        req.approved_status,
      ];
      let rawStatus = statusCandidates.find((x) => x !== undefined && x !== null && String(x).trim() !== '');
      if (rawStatus === undefined) {
        if (req.is_approved === 1 || req.is_approved === true || req.approved === true) rawStatus = 'approved';
        else if (req.is_rejected === 1 || req.rejected === true || req.is_denied === 1 || req.denied === true || req.disapproved === true) rawStatus = 'disapproved';
      }
      let statusLabel = 'Pending';
      if (typeof rawStatus === 'number') {
        // Common numeric scheme: 1 approved, 2/-1 disapproved, 0 pending
        statusLabel = rawStatus === 1 ? 'Approved' : (rawStatus === 2 || rawStatus === -1 ? 'Disapproved' : 'Pending');
      } else {
        const s = String(rawStatus || '').toLowerCase();
        // Important: check disapproval first so 'disapproved' doesn't match 'approved'
        if (['rejected', 'declined', 'denied', 'disapproved', 'disapprove'].some(k => s.includes(k))) statusLabel = 'Disapproved';
        else if (['approved', 'accept', 'accepted', 'approve', 'done', 'applied'].some(k => s.includes(k))) statusLabel = 'Approved';
        else statusLabel = 'Pending';
      }
      // Approver/Reviewer fields
      const approverName = req.approver_name || (req.approver && req.approver.name) || req.approved_by_name || req.approved_by || '';
      const approvedAt = req.approved_at || req.updated_at || req.approved_at_time || req.updated_at || req.created_at || '';
      const reviewerName = req.reviewer_name || req.reviewed_by_name || (req.reviewer && (req.reviewer.name || req.reviewer.full_name)) || (req.reviewed_by_user && req.reviewed_by_user.name) || '';
      const reviewedAt = req.reviewed_at || req.updated_at || '';
      const reviewerId = req.reviewed_by || (req.reviewer && req.reviewer.id) || '';

      const sortKey = parseTimestamp(req) || Date.now();

      return {
        id: String(req.id || Date.now()),
        type: typeLabel,
        iconName,
        iconColor,
        date: req.date || req.created_at || '',
        requestedTime: formatTime12(requestedTimeRaw),
        reason: req.reason || req.remark || '',
        status: statusLabel,
        raw: req,
        approverName,
        approvedAt,
        reviewerName,
        reviewedAt,
        reviewedBy: reviewerId,
        sortKey,
      };
    });

  // Sort newest first by sortKey (desc)
  mapped.sort((a, b) => (b.sortKey || 0) - (a.sortKey || 0));
  return mapped;
}

module.exports = { mapRequests, parseTimestamp, formatTime12 };
