import { Request, Response } from 'express';
import { db } from '../database/db';
import { partnerships, propertyGroups, housingProperties, housingApplications, users, mortgages } from '../database/schema';
import { eq, or, desc, sql } from 'drizzle-orm';

/**
 * POST /api/admin/housing/partnerships
 * Create a new partnership (Developer or FMBN)
 */
export const createPartnership = async (req: Request, res: Response) => {
  const { partnerType, organizationName, contactPerson, email, phone, terms } = req.body;

  try {
    if (!['developer', 'fmbn', 'financial_institution'].includes(partnerType)) {
      return res.status(400).json({ error: 'Invalid partner type' });
    }

    const partnershipId = Math.random().toString(36).substring(2, 15);
    const newPartnership = {
      id: partnershipId,
      partnerType,
      organizationName,
      contactPerson,
      email,
      phone,
      terms: {
        interestRate: terms?.interestRate || 8.5,
        loanTerm: terms?.loanTerm || 10,
        minimumDownPayment: terms?.minimumDownPayment || 0.2,
        maxTeachersPerBatch: terms?.maxTeachersPerBatch || 100,
      },
      status: 'active',
      activeSince: new Date(),
      propertiesCount: 0,
      applicationsProcessed: 0,
    };

    await db.insert(partnerships).values(newPartnership);

    res.status(201).json({
      success: true,
      partnership: newPartnership,
      message: `Partnership with ${organizationName} created successfully`,
    });
  } catch (err: any) {
    console.error('Error creating partnership:', err);
    res.status(500).json({ error: 'Failed to create partnership: ' + err.message });
  }
};

/**
 * POST /api/admin/housing/properties
 * Add property to partnership program
 */
export const addProperty = async (req: Request, res: Response) => {
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
    const partnership = await db.query.partnerships.findFirst({
      where: eq(partnerships.id, partnershipId),
    });

    if (!partnership) {
      return res.status(404).json({ error: 'Partnership not found' });
    }

    // Create property group
    const propertyGroupId = Math.random().toString(36).substring(2, 15);
    const newPropertyGroup = {
      id: propertyGroupId,
      partnershipId,
      address,
      city,
      state,
      price: price.toString(),
      bedrooms,
      bathrooms,
      squareFeet,
      description,
      totalUnits: availableUnits,
      occupiedUnits: 0,
      status: 'active',
      createdAt: new Date(),
    };

    await db.insert(propertyGroups).values(newPropertyGroup);

    // Create individual property listings
    const properties = [];
    for (let i = 1; i <= availableUnits; i++) {
      const propertyId = Math.random().toString(36).substring(2, 15);
      const property = {
        id: propertyId,
        propertyGroupId,
        partnershipId,
        address: `${address} - Unit ${i}`,
        city,
        state,
        price: price.toString(),
        bedrooms,
        bathrooms,
        squareFeet,
        description,
        unitNumber: i,
        status: 'available',
        createdAt: new Date(),
      };

      await db.insert(housingProperties).values(property);
      properties.push(property);
    }

    // Update partnership properties count
    const currentCount = partnership.propertiesCount || 0;
    await db.update(partnerships)
      .set({
        propertiesCount: currentCount + availableUnits,
      })
      .where(eq(partnerships.id, partnershipId));

    res.status(201).json({
      success: true,
      propertyGroupId,
      properties,
      message: `${availableUnits} properties added to partnership program`,
    });
  } catch (err: any) {
    console.error('Error adding property:', err);
    res.status(500).json({ error: 'Failed to add property: ' + err.message });
  }
};

/**
 * GET /api/admin/housing/properties
 * Get all available properties
 */
export const getProperties = async (req: Request, res: Response) => {
  const { status, partnership } = req.query;

  try {
    let whereClause: any = undefined;
    
    if (status && partnership) {
      whereClause = sql`${housingProperties.status} = ${status} AND ${housingProperties.partnershipId} = ${partnership}`;
    } else if (status) {
      whereClause = eq(housingProperties.status, status as string);
    } else if (partnership) {
      whereClause = eq(housingProperties.partnershipId, partnership as string);
    }

    const properties = await db.select().from(housingProperties).where(whereClause);

    // Group by property group
    const grouped: { [key: string]: any[] } = {};
    properties.forEach((prop) => {
      if (!grouped[prop.propertyGroupId || 'unknown']) {
        grouped[prop.propertyGroupId || 'unknown'] = [];
      }
      grouped[prop.propertyGroupId || 'unknown'].push(prop);
    });

    res.status(200).json({
      propertyCount: properties.length,
      groupedByAddress: grouped,
      properties,
    });
  } catch (err: any) {
    console.error('Error getting properties:', err);
    res.status(500).json({ error: 'Failed to retrieve properties: ' + err.message });
  }
};

/**
 * GET /api/admin/housing/applications
 * Get all housing applications for review
 */
export const getApplications = async (req: Request, res: Response) => {
  const { status, partnership } = req.query;

  try {
    let whereClause: any = undefined;
    if (status) {
      whereClause = eq(housingApplications.status, status as string);
    }

    const apps = await db.select({
      application: housingApplications,
      teacher: users,
    })
    .from(housingApplications)
    .leftJoin(users, eq(housingApplications.teacherId, users.id))
    .where(whereClause)
    .orderBy(desc(housingApplications.appliedAt));

    const formattedApps = apps.map(row => ({
      ...row.application,
      teacherDetails: {
        name: row.teacher ? `${row.teacher.firstName} ${row.teacher.lastName}` : undefined,
        email: row.teacher?.email,
        phone: row.teacher?.phone,
        trustScore: row.teacher?.trustScore,
      }
    }));

    res.status(200).json({
      totalApplications: formattedApps.length,
      byStatus: {
        approved: formattedApps.filter((a) => a.status === 'approved').length,
        pending: formattedApps.filter((a) => a.status === 'pending').length,
        rejected: formattedApps.filter((a) => a.status === 'rejected').length,
      },
      applications: formattedApps,
    });
  } catch (err: any) {
    console.error('Error getting applications:', err);
    res.status(500).json({ error: 'Failed to retrieve applications: ' + err.message });
  }
};

/**
 * POST /api/admin/housing/applications/:applicationId/approve
 * Approve housing application
 */
export const approveApplication = async (req: Request, res: Response) => {
  const { applicationId } = req.params;
  const { notes } = req.body;

  try {
    const application = await db.query.housingApplications.findFirst({
      where: eq(housingApplications.id, applicationId),
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Update application status
    await db.update(housingApplications)
      .set({
        status: 'approved',
        approvedAt: new Date(),
        // approverNotes: notes, // Need to add this to schema if essential, currently Using details for extra info
      })
      .where(eq(housingApplications.id, applicationId));

    // Update partnership application count
    const property = await db.query.housingProperties.findFirst({
      where: eq(housingProperties.id, application.propertyId || ''),
    });

    if (property && property.partnershipId) {
      const partnership = await db.query.partnerships.findFirst({
        where: eq(partnerships.id, property.partnershipId),
      });

      if (partnership) {
        await db.update(partnerships)
          .set({
            applicationsProcessed: (partnership.applicationsProcessed || 0) + 1,
          })
          .where(eq(partnerships.id, partnership.id));
      }
    }

    res.status(200).json({
      success: true,
      message: 'Application approved successfully',
    });
  } catch (err: any) {
    console.error('Error approving application:', err);
    res.status(500).json({ error: 'Failed to approve application: ' + err.message });
  }
};

/**
 * POST /api/admin/housing/applications/:applicationId/reject
 * Reject housing application
 */
export const rejectApplication = async (req: Request, res: Response) => {
  const { applicationId } = req.params;
  const { reason } = req.body;

  try {
    const application = await db.query.housingApplications.findFirst({
      where: eq(housingApplications.id, applicationId),
    });

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    // Update application status
    await db.update(housingApplications)
      .set({
        status: 'rejected',
        rejectedAt: new Date(),
        rejectionReason: reason,
      })
      .where(eq(housingApplications.id, applicationId));

    // Release property if it was marked as occupied
    if (application.propertyId) {
      await db.update(housingProperties)
        .set({
          status: 'available',
          occupiedBy: null,
        })
        .where(eq(housingProperties.id, application.propertyId));
    }

    // Cancel mortgage if created
    if (application.mortgageId) {
      await db.update(mortgages)
        .set({
          status: 'cancelled',
        })
        .where(eq(mortgages.id, application.mortgageId));
    }

    res.status(200).json({
      success: true,
      message: 'Application rejected',
    });
  } catch (err: any) {
    console.error('Error rejecting application:', err);
    res.status(500).json({ error: 'Failed to reject application: ' + err.message });
  }
};

/**
 * GET /api/admin/housing/dashboard
 * Admin housing program dashboard
 */
export const getDashboard = async (req: Request, res: Response) => {
  try {
    const allPartnerships = await db.select().from(partnerships);
    const allProperties = await db.select().from(housingProperties);
    const allApplications = await db.select().from(housingApplications);
    const allMortgages = await db.select().from(mortgages);

    // Calculate stats
    const availableProperties = allProperties.filter((p) => p.status === 'available').length;
    const occupiedProperties = allProperties.filter((p) => p.status === 'occupied').length;
    const activeMortgages = allMortgages.filter((m) => m.status === 'active').length;
    const completedMortgages = allMortgages.filter((m) => m.status === 'completed').length;

    const totalPortfolioValue = allProperties.reduce((sum, p) => sum + parseFloat(p.price?.toString() || '0'), 0);
    const totalMortgageValue = allMortgages.reduce((sum, m) => sum + parseFloat(m.principal?.toString() || '0'), 0);

    res.status(200).json({
      partnerships: {
        total: allPartnerships.length,
        active: allPartnerships.filter((p) => p.status === 'active').length,
        details: allPartnerships,
      },
      properties: {
        total: allProperties.length,
        available: availableProperties,
        occupied: occupiedProperties,
        value: totalPortfolioValue,
      },
      applications: {
        total: allApplications.length,
        approved: allApplications.filter((a) => a.status === 'approved').length,
        pending: allApplications.filter((a) => a.status === 'pending').length,
        rejected: allApplications.filter((a) => a.status === 'rejected').length,
      },
      mortgages: {
        active: activeMortgages,
        completed: completedMortgages,
        totalValue: totalMortgageValue,
      },
      impact: {
        teachersHoused: occupiedProperties,
        teachersBecomingHomeowners: completedMortgages,
        totalInvestedByTeachers: allMortgages.reduce((sum, m) => sum + parseFloat(m.totalPaid?.toString() || '0'), 0),
      },
    });
  } catch (err: any) {
    console.error('Error getting dashboard:', err);
    res.status(500).json({ error: 'Failed to retrieve dashboard data: ' + err.message });
  }
};

/**
 * GET /api/admin/housing/partnerships/:partnershipId
 * Get partnership details and stats
 */
export const getPartnershipDetails = async (req: Request, res: Response) => {
  const { partnershipId } = req.params;

  try {
    const partnership = await db.query.partnerships.findFirst({
      where: eq(partnerships.id, partnershipId),
    });

    if (!partnership) {
      return res.status(404).json({ error: 'Partnership not found' });
    }

    const properties = await db.select()
      .from(housingProperties)
      .where(eq(housingProperties.partnershipId, partnershipId));

    // Applications that relate to properties in this partnership
    const applications = await db.select()
      .from(housingApplications)
      .where(eq(housingApplications.propertyId, sql`ANY(SELECT id FROM housing_properties WHERE partnership_id = ${partnershipId})`));

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
  } catch (err: any) {
    console.error('Error getting partnership details:', err);
    res.status(500).json({ error: 'Failed to retrieve partnership details: ' + err.message });
  }
};
