const { pool } = require('../config/db');

exports.getOverview = async (req, res) => {
  try {
    // Mock data for preview
    res.json({
      totalUsers: 150,
      totalTeachers: 45,
      totalParents: 105,
      pendingRentApplications: 3,
      totalVaultItems: 28,
    });
  } catch (err) {
    console.error('Admin overview error:', err);
    res.status(500).json({ error: 'Could not fetch admin overview' });
  }
};

exports.listRentApplications = async (req, res) => {
  try {
    // Mock data
    res.json([
      { id: 1, teacher_name: 'John Doe', amount: 50000, status: 'pending', application_date: '2024-01-15' },
      { id: 2, teacher_name: 'Jane Smith', amount: 30000, status: 'approved', application_date: '2024-01-10' },
    ]);
  } catch (err) {
    console.error('Rent applications fetch error:', err);
    res.status(500).json({ error: 'Could not fetch rent applications' });
  }
};

exports.processRentApplication = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!['approved', 'rejected', 'cancelled', 'active', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    // Mock response
    res.json({ id, status, message: 'Application updated successfully' });
  } catch (err) {
    console.error('Process rent application error:', err);
    res.status(500).json({ error: 'Could not update rent application' });
  }
};

exports.listAmbassadors = async (req, res) => {
  try {
    // Mock data
    res.json([
      { id: 1, name: 'Alice Johnson', referrals: 12, earnings: 2400 },
      { id: 2, name: 'Bob Wilson', referrals: 8, earnings: 1600 },
    ]);
  } catch (err) {
    console.error('Ambassadors fetch error:', err);
    res.status(500).json({ error: 'Could not fetch ambassadors' });
  }
};

exports.listVettingQueue = async (req, res) => {
  try {
    // Mock data
    res.json([
      { id: 1, full_name: 'John Doe', email: 'john@example.com', role: 'teacher', base_hourly_rate: 2000, credentials_url: 'http://example.com/cred1', is_approved: false },
      { id: 2, full_name: 'Jane Smith', email: 'jane@example.com', role: 'teacher', base_hourly_rate: 2500, credentials_url: 'http://example.com/cred2', is_approved: false },
    ]);
  } catch (err) {
    console.error('List vetting queue error:', err);
    res.status(500).json({ error: 'Could not fetch vetting queue' });
  }
};

exports.processVetting = async (req, res) => {
  const { teacherId } = req.params;
  const { action, comment } = req.body;

  if (!['approve', 'reject'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be approve or reject.' });
  }

  try {
    // Mock response
    res.json({ message: `Teacher ${action}d successfully`, teacherId, action });
  } catch (err) {
    console.error('Process vetting error:', err);
    res.status(500).json({ error: 'Could not process vetting' });
  }
};

exports.payoutEscrow = async (req, res) => {
  const { bookingId } = req.params;

  try {
    // Mock response
    res.json({ message: 'Escrow payout executed', bookingId });
  } catch (err) {
    console.error('Escrow payout error:', err);
    res.status(500).json({ error: 'Could not execute escrow payout' });
  }
};

exports.listDisputes = async (req, res) => {
  try {
    // Mock data
    res.json([
      { id: 1, booking_id: 101, issue: 'Late payment', status: 'open', created_at: '2024-01-15T10:00:00Z' },
      { id: 2, booking_id: 102, issue: 'Quality concern', status: 'resolved', created_at: '2024-01-10T14:30:00Z' },
    ]);
  } catch (err) {
    console.error('List disputes error:', err);
    res.status(500).json({ error: 'Could not fetch disputes' });
  }
};

exports.createDispute = async (req, res) => {
  const { bookingId, issue, notes } = req.body;
  if (!bookingId || !issue) return res.status(400).json({ error: 'bookingId and issue are required' });

  try {
    // Mock response
    res.status(201).json({ id: Date.now(), bookingId, issue, notes, status: 'open', created_at: new Date().toISOString() });
  } catch (err) {
    console.error('Create dispute error:', err);
    res.status(500).json({ error: 'Could not create dispute' });
  }
};

exports.updateDispute = async (req, res) => {
  const { disputeId } = req.params;
  const { status, resolution, handlerNotes } = req.body;
  if (!['open','in_review','resolved','rejected'].includes(status)) {
    return res.status(400).json({ error: 'Invalid dispute status' });
  }

  try {
    // Mock response
    res.json({ id: disputeId, status, resolution, handlerNotes, message: 'Dispute updated successfully' });
  } catch (err) {
    console.error('Update dispute error:', err);
    res.status(500).json({ error: 'Could not update dispute' });
  }
};

exports.resolveDispute = async (req, res) => {
  const { disputeId } = req.params;
  const { resolution, notes } = req.body;

  try {
    // Mock response
    res.json({ message: 'Dispute resolved', disputeId, resolution, notes });
  } catch (err) {
    console.error('Dispute resolution error:', err);
    res.status(500).json({ error: 'Could not resolve dispute' });
  }
};

exports.getWelfareAnalytics = async (req, res) => {
  try {
    // Mock data for welfare analytics
    res.json({
      totalAccumulated: 1250000, // ₦1,250,000 total accumulated
      totalAvailable: 750000, // ₦750,000 available
      totalLocked: 500000, // ₦500,000 locked
      teachersWithFunds: 35,
      averageWelfarePerTeacher: 35714, // ₦35,714
      housingUnlocks: 8,
      monthlyContributions: [
        { month: '2024-01', amount: 45000 },
        { month: '2024-02', amount: 52000 },
        { month: '2024-03', amount: 48000 },
      ],
      topContributors: [
        { teacherId: 1, name: 'John Doe', totalFund: 85000 },
        { teacherId: 2, name: 'Jane Smith', totalFund: 72000 },
      ]
    });
  } catch (err) {
    console.error('Welfare analytics error:', err);
    res.status(500).json({ error: 'Could not fetch welfare analytics' });
  }
};

