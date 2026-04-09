/**
 * EduWins Housing Model - Complete Firebase Database Schema
 * 
 * This schema defines all database nodes required for the 4-step housing model:
 * Step 1: Entry (Trust Building) - Eligibility tracking
 * Step 2: Seed (Welfare Fund Milestone) - ₦500,000 accumulation
 * Step 3: Leverage (Partnerships) - Developer & FMBN partnerships
 * Step 4: Key (Rent-to-Own) - Mortgage & payments
 */

{
  // ==================== ELIGIBILITY TRACKING ====================
  // Tracks teacher progress toward housing eligibility
  "housing_eligibility": {
    "eligibilityRecordId": {
      "id": "eligibilityRecordId",
      "teacherId": "teacher123",
      "eligible": true,
      "reason": "Teacher meets all eligibility requirements",
      "details": {
        "educatorTenure": {
          "requirement": "6 months active teaching",
          "met": true,
          "startDate": "2025-09-30T00:00:00Z",
          "daysRemaining": 0,
          "qualified": "Yes"
        },
        "ratingRequirement": {
          "requirement": "4.5+ star rating",
          "met": true,
          "currentRating": 4.8,
          "qualified": "Yes"
        },
        "activeLessons": {
          "requirement": "Must have active lessons",
          "met": true,
          "totalLessons": 45,
          "qualified": "Yes"
        },
        "verification": {
          "requirement": "Credentials verified by admin",
          "met": true,
          "qualified": "Yes"
        }
      },
      "nextStep": "Teacher is eligible for Housing Tier Step 2",
      "checkedAt": 1711804800000,
      "lastUpdated": 1711804800000
    }
  },

  // ==================== WELFARE FUND MILESTONES ====================
  // Tracks when teachers reach ₦500,000 milestone for housing tier unlock
  "housing_milestones": {
    "milestoneAchievementId": {
      "id": "milestoneAchievementId",
      "teacherId": "teacher123",
      "milestoneType": "welfare_fund_500k",
      "amount": 500000,
      "achievedAt": 1711804800000,
      "status": "completed"
    }
  },

  // ==================== PARTNERSHIPS ====================
  // Developer and financial institution partnerships for housing programs
  "partnerships": {
    "partnerId": {
      "id": "partnerId",
      "partnerType": "developer", // or "fmbn" or "financial_institution"
      "organizationName": "Premium Homes Development Ltd.",
      "contactPerson": "John Doe",
      "email": "contact@premiumhomes.com",
      "phone": "+2348012345678",
      "terms": {
        "interestRate": 8.5,
        "loanTerm": 10,
        "minimumDownPayment": 0.2,
        "maxTeachersPerBatch": 100
      },
      "status": "active",
      "activeSince": 1711804800000,
      "propertiesCount": 50,
      "applicationsProcessed": 12
    }
  },

  // ==================== PROPERTIES ====================
  // Individual housing properties available through partnerships
  "housing_properties": {
    "propertyId": {
      "id": "propertyId",
      "propertyGroupId": "groupId123",
      "partnershipId": "partnerId",
      "address": "123 Bishop Street, Lagos Island",
      "city": "Lagos",
      "state": "Lagos",
      "price": 3500000,
      "bedrooms": 2,
      "bathrooms": 2,
      "squareFeet": 1200,
      "description": "Modern 2-bedroom bungalow with full facilities",
      "unitNumber": 1,
      "status": "available", // or "occupied" or "reserved"
      "occupiedBy": null, // teacherId if occupied
      "occupiedSince": null,
      "createdAt": 1711804800000
    }
  },

  // ==================== PROPERTY GROUPS ====================
  // Groups of similar properties from same partnership
  "property_groups": {
    "propertyGroupId": {
      "id": "propertyGroupId",
      "partnershipId": "partnerId",
      "address": "123 Bishop Street, Lagos Island",
      "city": "Lagos",
      "state": "Lagos",
      "price": 3500000,
      "bedrooms": 2,
      "bathrooms": 2,
      "squareFeet": 1200,
      "description": "Modern 2-bedroom bungalows with full facilities",
      "totalUnits": 50,
      "occupiedUnits": 12,
      "status": "active",
      "createdAt": 1711804800000
    }
  },

  // ==================== HOUSING APPLICATIONS ====================
  // Teachers' applications for housing program
  "housing_applications": {
    "applicationId": {
      "id": "applicationId",
      "teacherId": "teacher123",
      "propertyId": "propertyId",
      "mortgageId": "mortgageId",
      "status": "approved", // or "pending" or "rejected"
      "propertyDetails": {
        "address": "123 Bishop Street, Lagos Island",
        "price": 3500000,
        "bedrooms": 2,
        "bathrooms": 2
      },
      "mortgageDetails": {
        "id": "mortgageId",
        "principalAmount": 2800000,
        "monthlyPayment": 32000,
        "loanTerm": 10,
        "interestRate": 8.5
      },
      "appliedAt": 1711804800000,
      "approvedAt": 1711891200000,
      "approverNotes": "All requirements met. Property inspected and approved.",
      "rejectedAt": null,
      "rejectionReason": null
    }
  },

  // ==================== MORTGAGES (RENT-TO-OWN CONTRACTS) ====================
  // Rent-to-own mortgage contracts for teachers
  "mortgages": {
    "mortgageId": {
      "id": "mortgageId",
      "teacherId": "teacher123",
      "propertyId": "propertyId",
      "propertyPrice": 3500000,
      "downPayment": 700000, // From welfare fund or savings
      "principal": 2800000, // Amount financed
      "loanTerm": 10,
      "interestRate": 8.5,
      "monthlyPayment": 32000,
      "monthlyIncome": 150000,
      "debtToIncomeRatio": "21.33",
      "status": "active", // or "completed" or "cancelled"
      "totalPaid": 0,
      "paymentsCompleted": 0,
      "paymentsMissed": 0,
      "remainingBalance": 2800000,
      "startDate": 1711804800000,
      "endDate": 2047132800000, // 10 years later
      "nextPaymentDue": "2026-04-30T00:00:00Z",
      "lastPaymentDate": null,
      "completedAt": null,
      "createdAt": 1711804800000,
      "updatedAt": 1711804800000
    }
  },

  // ==================== MORTGAGE PAYMENTS ====================
  // Individual monthly mortgage payments from teacher earnings
  "mortgage_payments": {
    "paymentId": {
      "id": "paymentId",
      "teacherId": "teacher123",
      "mortgageId": "mortgageId",
      "amount": 32000,
      "principalPaydown": 28000,
      "interestPaid": 4000,
      "paymentDate": 1714483200000, // First payment date
      "status": "completed"
    }
  },

  // ==================== MISSED PAYMENTS ====================
  // Records of missed mortgage payments for delinquency tracking
  "missed_payments": {
    "missedPaymentId": {
      "id": "missedPaymentId",
      "teacherId": "teacher123",
      "mortgageId": "mortgageId",
      "dueAmount": 32000,
      "availableAmount": 15000,
      "dueDate": 1714483200000,
      "status": "missed",
      "rescheduledFor": null
    }
  },

  // ==================== USER UPDATES ====================
  // Additional fields added to existing user records
  "users": {
    "teacher123": {
      // existing fields...
      
      // Housing eligibility fields
      "housing_eligible": true,
      "housing_eligibility_checked": true,
      "housing_eligibility_details": { /* eligibility details */ },
      
      // Housing tier unlock (at ₦500k welfare fund)
      "housing_tier_unlocked": true,
      "housing_tier_unlock_date": 1711804800000,
      "housing_eligible_for_application": true,
      
      // Housing status
      "housing_status": "rent-to-own", // or "not-started", "homeowner", "completed"
      "has_active_mortgage": true,
      "active_mortgage_id": "mortgageId",
      "property_owned": false,
      
      // Estimated monthly earnings (used for debt-to-income ratio)
      "average_monthly_earnings": 150000
    }
  },

  // ==================== WELFARE FUND (EXISTING) ====================
  // Already implemented in Phase 2, extended for housing
  "welfare_funds": {
    "teacher123": {
      "2026-01": {
        "month": "2026-01",
        "amount": 25000,
        "createdAt": 1704067200000,
        "lessonCount": 50,
        "status": "locked" // Locked until 5th of next month
      },
      "2026-02": {
        "month": "2026-02",
        "amount": 25000,
        "createdAt": 1706745600000,
        "lessonCount": 50,
        "status": "locked"
      }
    }
  }
}
