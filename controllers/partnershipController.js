const { db, admin } = require('../config/firebase');

/**
 * POST /api/admin/housing/partnerships
 * Create a new partnership (Developer or FMBN)
 */
exports.createPartnership = async (req, res) => {
  const { partnerType, organizationName, contactPerson, email, phone, terms } = req.body;

  try {
    if (!['developer', 'fmbn', 'financial_institution'].includes(partnerType)) {
      return res.status(400).json({ error: 'Invalid partner type' });
    }

    const partnershipId = db.ref('partnerships').push().key;
    const partnership = {
      id: partnershipId,
      partnerType,
      organizationName,
      contactPerson,
      email,
      phone,
      terms: {
        interestRate: terms.interestRate || 8.5,
        loanTerm: terms.loanTerm || 10,
        minimumDownPayment: terms.minimumDownPayment || 0.2,
        maxTeachersPerBatch: terms.maxTeachersPerBatch || 100,
      },
      status: 'active',
      activeSince: admin.database.ServerValue.TIMESTAMP,
      propertiesCount: 0,
      applicationsProcessed: 0,
    };

    await db.ref(`partnerships/${partnershipId}`).set(partnership);

    res.status(201).json({
      success: true,
      partnership,
      message: `Partnership with ${organizationName} created successfully`,
    });
  } catch (err) {
    console.error('Error creating partnership:', err);
    res.status(500).json({ error: 'Failed to create partnership: ' + err.message });
  }
};

/**
 * POST /api/admin/housing/properties
 * Add property to partnership program
 */
exports.addProperty = async (req, res) => {
  const { partnershipId, propertyDetails } = req.body;

  try {
    const {
      address,
      city,
      state,
      price,
      bedrooms,
      bathrooms,
      squareFeet,
      description,
      availableUnits,
    } = propertyDetails;

    // Verify partnership exists
    const partnershipSnapshot = await db.ref(`partnerships/${partnershipId}`).once('value');
    const partnership = partnershipSnapshot.val();

    if (!partnership) {
      return res.status(404).json({ error: 'Partnership not found' });
    }

    // Create property records (one for each available unit)
    const propertyGroupId = db.ref('property_groups').push().key;
    const propertyGroup = {
      id: propertyGroupId,
      partnershipId,
      address,
      city,
      state,
      price,
      bedrooms,
      bathrooms,
      squareFeet,
      description,
      totalUnits: availableUnits,
      occupiedUnits: 0,
      status: 'active',
      createdAt: admin.database.ServerValue.TIMESTAMP,
    };

    await db.ref(`property_groups/${propertyGroupId}`).set(propertyGroup);

    // Create individual property listings
    const properties = [];
    for (let i = 1; i <= availableUnits; i++) {
      const propertyId = db.ref('housing_properties').push().key;
      const property = {
        id: propertyId,
        propertyGroupId,
        partnershipId,
        address: `${address} - Unit ${i}`,
        city,
        state,
        price,
        bedrooms,
        bathrooms,
        squareFeet,
        description,
        unitNumber: i,
        status: 'available',
        createdAt: admin.database.ServerValue.TIMESTAMP,
      };

      await db.ref(`housing_properties/${propertyId}`).set(property);
      properties.push(property);
    }

    // Update partnership properties count
    await db.ref(`partnerships/${partnershipId}`).update({
      propertiesCount: (partnership.propertiesCount || 0) + availableUnits,
    });

    res.status(201).json({
      success: true,
      propertyGroupId,
      properties,
      message: `${availableUnits} properties added to partnership program`,
    });
  } catch (err) {
    console.error('Error adding property:', err);
    res.status(500).json({ error: 'Failed to add property: ' + err.message });
  }
};

/**
 * GET /api/admin/housing/properties
 * Get all available properties
 */
exports.getProperties = async (req, res) => {
  const { status, partnership } = req.query;

  try {
    let query = db.ref('housing_properties');

    if (status) {
      query = query.orderByChild('status').equalTo(status);
    }

    const snapshot = await query.once('value');
    const propertiesData = snapshot.val() || {};
    let properties = Object.values(propertiesData);

    // Filter by partnership if specified
    if (partnership) {
      properties = properties.filter((p) => p.partnershipId === partnership);
    }

    // Group by property group
    const grouped = {};
    properties.forEach((prop) => {
      if (!grouped[prop.propertyGroupId]) {
        grouped[prop.propertyGroupId] = [];
      }
      grouped[prop.propertyGroupId].push(prop);
    });

    res.status(200).json({
      propertyCount: properties.length,
      groupedByAddress: grouped,
      properties,
    });
  } catch (err) {
    console.error('Error getting properties:', err);
    res.status(500).json({ error: 'Failed to retrieve properties: ' + err.message });
  }
};

/**
 * GET /api/admin/housing/applications
 * Get all housing applications for review
 */
exports.getApplications = async (req, res) => {
  const { status, partnership } = req.query;

  try {
    let query = db.ref('housing_applications');

    if (status) {
      query = query.orderByChild('status').equalTo(status);
    }

    const snapshot = await query.once('value');
    const applicationsData = snapshot.val() || {};
    let applications = Object.values(applicationsData);

    // Add teacher details to each application
    applications = await Promise.all(
      applications.map(async (app) => {
        const teacherSnapshot = await db.ref(`users/${app.teacherId}`).once('value');
        const teacher = teacherSnapshot.val();

        return {
          ...app,
          teacherDetails: {
            name: teacher?.fullName,
            email: teacher?.email,
            phone: teacher?.phone,
            rating: teacher?.rating,
            years_teaching: teacher?.years_teaching,
          },
        };
      })
    );

    // Sort by date (newest first)
    applications.sort((a, b) => new Date(b.appliedAt) - new Date(a.appliedAt));

    res.status(200).json({
      totalApplications: applications.length,
      byStatus: {
        approved: applications.filter((a) => a.status === 'approved').length,
        pending: applications.filter((a) => a.status === 'pending').length,
        rejected: applications.filter((a) => a.status === 'rejected').length,
      },
      applications,
    });
  } catch (err) {
    console.error('Error getting applications:', err);
    res.status(500).json({ error: 'Failed to retrieve applications: ' + err.message });
  }
};

/**
 * POST /api/admin/housing/applications/:applicationId/approve
 * Approve housing application
 */
exports.approveApplication = async (req, res) => {
  const { applicationId } = req.params;
  const { notes } = req.body;

  try {
    const appSnapshot = await db.ref(`housing_applications/${applicationId}`).once('value');
    const application = appSnapshot.val();

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Update application status
    await db.ref(`housing_applications/${applicationId}`).update({
      status: 'approved',
      approvedAt: admin.database.ServerValue.TIMESTAMP,
      approverNotes: notes,
    });

    // Update partnership
    const partnershipSnapshot = await db.ref(
      `partnerships/${application.mortgageDetails.partnershipId}`
    ).once('value');
    const partnership = partnershipSnapshot.val();

    if (partnership) {
      await db.ref(`partnerships/${partnership.id}`).update({
        applicationsProcessed: (partnership.applicationsProcessed || 0) + 1,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Application approved successfully',
    });
  } catch (err) {
    console.error('Error approving application:', err);
    res.status(500).json({ error: 'Failed to approve application: ' + err.message });
  }
};

/**
 * POST /api/admin/housing/applications/:applicationId/reject
 * Reject housing application
 */
exports.rejectApplication = async (req, res) => {
  const { applicationId } = req.params;
  const { reason } = req.body;

  try {
    const appSnapshot = await db.ref(`housing_applications/${applicationId}`).once('value');
    const application = appSnapshot.val();

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Update application status
    await db.ref(`housing_applications/${applicationId}`).update({
      status: 'rejected',
      rejectedAt: admin.database.ServerValue.TIMESTAMP,
      rejectionReason: reason,
    });

    // Release property if it was marked as occupied
    if (application.propertyId) {
      await db.ref(`housing_properties/${application.propertyId}`).update({
        status: 'available',
        occupiedBy: null,
      });
    }

    // Cancel mortgage if created
    if (application.mortgageId) {
      await db.ref(`mortgages/${application.mortgageId}`).update({
        status: 'cancelled',
        cancelledAt: admin.database.ServerValue.TIMESTAMP,
      });
    }

    res.status(200).json({
      success: true,
      message: 'Application rejected',
    });
  } catch (err) {
    console.error('Error rejecting application:', err);
    res.status(500).json({ error: 'Failed to reject application: ' + err.message });
  }
};

/**
 * GET /api/admin/housing/dashboard
 * Admin housing program dashboard
 */
exports.getDashboard = async (req, res) => {
  try {
    // Get partnerships
    const partnershipSnapshot = await db.ref('partnerships').once('value');
    const partnerships = partnershipSnapshot.val() || {};

    // Get properties
    const propertySnapshot = await db.ref('housing_properties').once('value');
    const properties = Object.values(propertySnapshot.val() || {});

    // Get applications
    const appSnapshot = await db.ref('housing_applications').once('value');
    const applications = Object.values(appSnapshot.val() || {});

    // Get mortgages
    const mortgageSnapshot = await db.ref('mortgages').once('value');
    const mortgages = Object.values(mortgageSnapshot.val() || {});

    // Calculate stats
    const availableProperties = properties.filter((p) => p.status === 'available').length;
    const occupiedProperties = properties.filter((p) => p.status === 'occupied').length;
    const activeMortgages = mortgages.filter((m) => m.status === 'active').length;
    const completedMortgages = mortgages.filter((m) => m.status === 'completed').length;

    // Calculate total portfolio value
    const totalPortfolioValue = properties.reduce((sum, p) => sum + (p.price || 0), 0);
    const totalMortgageValue = mortgages.reduce((sum, m) => sum + (m.principal || 0), 0);

    res.status(200).json({
      partnerships: {
        total: Object.keys(partnerships).length,
        active: Object.values(partnerships).filter((p) => p.status === 'active').length,
        details: Object.values(partnerships),
      },
      properties: {
        total: properties.length,
        available: availableProperties,
        occupied: occupiedProperties,
        value: totalPortfolioValue,
      },
      applications: {
        total: applications.length,
        approved: applications.filter((a) => a.status === 'approved').length,
        pending: applications.filter((a) => a.status === 'pending').length,
        rejected: applications.filter((a) => a.status === 'rejected').length,
      },
      mortgages: {
        active: activeMortgages,
        completed: completedMortgages,
        totalValue: totalMortgageValue,
      },
      impact: {
        teachersHoused: occupiedProperties,
        teachersBecomingHomeowners: completedMortgages,
        totalInvestedByTeachers: mortgages.reduce((sum, m) => sum + (m.totalPaid || 0), 0),
      },
    });
  } catch (err) {
    console.error('Error getting dashboard:', err);
    res.status(500).json({ error: 'Failed to retrieve dashboard data: ' + err.message });
  }
};

/**
 * GET /api/admin/housing/partnerships/:partnershipId
 * Get partnership details and stats
 */
exports.getPartnershipDetails = async (req, res) => {
  const { partnershipId } = req.params;

  try {
    const partnershipSnapshot = await db.ref(`partnerships/${partnershipId}`).once('value');
    const partnership = partnershipSnapshot.val();

    if (!partnership) {
      return res.status(404).json({ error: 'Partnership not found' });
    }

    // Get properties for this partnership
    const propertySnapshot = await db.ref('housing_properties').once('value');
    const properties = Object.values(propertySnapshot.val() || {}).filter(
      (p) => p.partnershipId === partnershipId
    );

    // Get applications for this partnership
    const appSnapshot = await db.ref('housing_applications').once('value');
    const applications = Object.values(appSnapshot.val() || {});

    res.status(200).json({
      partnership,
      properties: {
        total: properties.length,
        available: properties.filter((p) => p.status === 'available').length,
        occupied: properties.filter((p) => p.status === 'occupied').length,
        list: properties,
      },
      applications: applications.length,
      performanceMetrics: {
        acceptanceRate:
          applications.length > 0
            ? ((applications.filter((a) => a.status === 'approved').length / applications.length) *
                100).toFixed(2) + '%'
            : 'N/A',
        occupancyRate: (
          ((properties.filter((p) => p.status === 'occupied').length / properties.length) * 100) ||
          0
        ).toFixed(2) + '%',
      },
    });
  } catch (err) {
    console.error('Error getting partnership details:', err);
    res.status(500).json({ error: 'Failed to retrieve partnership details: ' + err.message });
  }
};
