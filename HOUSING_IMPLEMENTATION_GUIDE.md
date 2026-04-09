# EduWins Housing Model - Implementation Guide

## Overview

The Housing Model is a 4-step system that helps teachers transition from renters to homeowners using their earnings on the EduWins platform as collateral. Edu-Wins acts as the "Institutional Guarantor," making block deals with developers and financial institutions.

---

## System Architecture

### 4-Step Model

#### **Step 1: Entry (Trust Building)**
- **Duration:** 6 months minimum
- **Requirements:**
  - Teacher completes 6 months of active teaching
  - Maintains minimum 4.5-star rating
  - Has completed active lessons
  - Credentials (TRCN/NIN) verified by admin
- **Purpose:** Prove consistency and earning reliability
- **Implementation:** `utils/eligibilityTracker.js`

#### **Step 2: Seed (Welfare Fund Milestone)**
- **Mechanism:** 10% of every lesson automatically goes to locked welfare fund
- **Milestone:** ₦500,000 accumulated
- **Unlock:** When milestone is reached, Housing Tier is automatically unlocked
- **Purpose:** Teacher has savings + Edu-Wins matches by unlocking access
- **Implementation:** `utils/welfareCalculator.js`

#### **Step 3: Leverage (Partnerships)**
- **Players:** Edu-Wins + Developers + FMBN + Teachers (100+ teachers as block)
- **Deal:** "We have 100 verified teachers with ₦50M in combined savings"
- **Mechanism:**
  - Partnerships with real estate developers
  - Partnerships with FMBN (Federal Mortgage Bank of Nigeria)
  - Bulk property allocation to teachers
  - Teacher future earnings serve as collateral
- **Implementation:** `controllers/partnershipController.js`

#### **Step 4: Key (Rent-to-Own)**
- **Process:**
  - Teacher selects property from partnership inventory
  - Creates mortgage contract (10-year term, 8.5% interest by default)
  - Monthly payment automatically deducted from earnings
  - After loan completion = Homeowner
- **Purpose:** Convert future earnings into home ownership
- **Implementation:** `utils/mortgageCalculator.js`, `controllers/housingController.js`

---

## Key Features

### 1. Eligibility Tracking

**File:** `utils/eligibilityTracker.js`

**Functions:**
- `checkHousingEligibility(teacherId)` - Verify all 4 requirements
- `trackEligibilityProgress(teacherId)` - Store eligibility record
- `getEligibilityStatus(teacherId)` - Get latest status

**Requirements:**
1. 6 months registration
2. 4.5+ star rating
3. Active lessons (completed at least 1)
4. Credentials verified

**Database:** `housing_eligibility` node

---

### 2. Welfare Fund Milestone Tracking

**File:** `utils/welfareCalculator.js`

**Functions:**
- `calculateTotalWelfareFund(teacherId)` - Sum all welfare accumulations
- `checkHousingMilestone(teacherId)` - Check if ₦500k reached
- `getWelfareFundProgress(teacherId)` - Get % progress
- `estimateMilestoneDate(teacherId)` - Estimate when ₦500k will be reached

**Milestone:** ₦500,000
- Automatic unlock of Housing Tier when reached
- Creates `housing_milestones` record
- Updates teacher profile: `housing_tier_unlocked = true`

**Database:** `welfare_funds`, `housing_milestones`

---

### 3. Partnership Management

**File:** `controllers/partnershipController.js`

**Admin Functions:**

#### Create Partnership
```
POST /api/admin/housing/partnerships
Body: {
  partnerType: "developer" | "fmbn" | "financial_institution",
  organizationName: "Company Name",
  contactPerson: "John Doe",
  email: "contact@company.com",
  phone: "+2348012345678",
  terms: {
    interestRate: 8.5,
    loanTerm: 10,
    minimumDownPayment: 0.2,
    maxTeachersPerBatch: 100
  }
}
```

#### Add Properties
```
POST /api/admin/housing/properties
Body: {
  partnershipId: "partnerId",
  propertyDetails: {
    address: "123 Bishop Street",
    city: "Lagos",
    price: 3500000,
    bedrooms: 2,
    bathrooms: 2,
    squareFeet: 1200,
    description: "Modern 2-bedroom bungalow",
    availableUnits: 50
  }
}
```

**Database:**
- `partnerships` - Partnership records
- `housing_properties` - Individual property listings
- `property_groups` - Groups of similar properties

---

### 4. Mortgage System

**File:** `utils/mortgageCalculator.js`

**Functions:**

#### Calculate Monthly Payment
```javascript
calculateMonthlyPayment(principal, annualRate, years)
// Uses amortization formula
// M = P * [r(1+r)^n] / [(1+r)^n - 1]
```

#### Create Mortgage Contract
```javascript
createMortgageContract(teacherId, propertyId, {
  propertyPrice: 3500000,
  downPayment: 700000,
  loanTerm: 10,
  interestRate: 8.5,
  monthlyIncome: 150000
})
```

**Validation:**
- Debt-to-income ratio ≤ 40%
- Monthly payment ≤ 40% of income

#### Process Monthly Payment
```javascript
processMonthlyMortgage(teacherId, mortgageId, earningsForMonth)
```

**Logic:**
- Check if payment due
- Verify sufficient earnings
- Record payment with principal/interest split
- Track remaining balance
- Mark as "completed" when balance = 0

**Database:**
- `mortgages` - Mortgage contracts
- `mortgage_payments` - Individual payments
- `missed_payments` - Delinquency tracking

---

## API Endpoints

### Teacher Endpoints

#### Check Eligibility
```
GET /api/housing/eligibility
Response: {
  step1Entry: { requirements, requirementsMet },
  step2Seed: { welfareProgress, milestoneStatus },
  status: "Eligible..." | "Not Yet Eligible...",
  nextSteps: [...]
}
```

#### Get Housing Status
```
GET /api/housing/status
Response: {
  housingProgram: { enrolled, status },
  eligibility: { step1Met, details },
  welfareFund: { accumulated, progress%, milestoneReached },
  mortgage: { status, progress, equity },
  summary: { step, nextAction }
}
```

#### Apply for Housing
```
POST /api/housing/apply
Body: {
  propertyId: "propertyId",
  mortgageDetails: {
    downPayment: 700000,
    loanTerm: 10,
    interestRate: 8.5
  }
}
Response: {
  success: true,
  applicationId: "...",
  mortgage: { ...mortgageDetails },
  nextSteps: [...]
}
```

#### Process Monthly Payment
```
POST /api/housing/process-payment
Body: { earningsForMonth: 150000 }
Response: {
  success: true,
  payment: { amount, remaining, status }
}
```

#### Get Mortgage Schedule
```
GET /api/housing/mortgage/:mortgageId/schedule
Response: {
  schedule: [ { paymentNumber, payment, principal, interest, balance }, ... ],
  summary: { totalPayments, totalPrincipal, totalInterest, totalCost }
}
```

#### Get Payment History
```
GET /api/housing/payments
Response: {
  totalPayments: 12,
  payments: [ { amount, date, status }, ... ]
}
```

### Admin Endpoints

#### Create Partnership
```
POST /api/admin/housing/partnerships
```

#### Add Properties
```
POST /api/admin/housing/properties
```

#### Get Properties
```
GET /api/admin/housing/properties
Query: ?status=available&partnership=partnerId
```

#### Get Applications
```
GET /api/admin/housing/applications
Query: ?status=pending
```

#### Approve Application
```
POST /api/admin/housing/applications/:applicationId/approve
Body: { notes: "..." }
```

#### Reject Application
```
POST /api/admin/housing/applications/:applicationId/reject
Body: { reason: "..." }
```

#### Admin Dashboard
```
GET /api/admin/housing/dashboard
Response: {
  partnerships: { total, active, details },
  properties: { total, available, occupied, value },
  applications: { total, approved, pending, rejected },
  mortgages: { active, completed, totalValue },
  impact: { teachersHoused, homeowners, invested }
}
```

---

## Database Schema

See `HOUSING_SCHEMA.js` for complete Firebase structure including:
- `housing_eligibility` - Eligibility tracking
- `housing_milestones` - Milestone achievements
- `partnerships` - Partner organizations
- `housing_properties` - Available properties
- `property_groups` - Property groupings
- `housing_applications` - Teacher applications
- `mortgages` - Mortgage contracts
- `mortgage_payments` - Payment records
- `missed_payments` - Delinquency records

---

## Workflow Examples

### Example 1: Teacher Becomes Eligible

1. **Month 0-6:** Teacher teaches, earns ₦1.5M (10% → ₦150k welfare)
2. **Month 7:** System checks: 6 months ✓, 4.5 rating ✓, lessons ✓, verified ✓
3. **Result:** `housing_eligible = true`

### Example 2: Welfare Fund Reaches Milestone

1. **Month 1-20:** Teacher accumulates welfare fund ₦500k from lessons
2. **Month 21:** System checks: welfare = ₦500k ✓
3. **Trigger:**
   - `housing_tier_unlocked = true`
   - Create `housing_milestones` record
   - Teacher can now apply for housing

### Example 3: Teacher Secures Property

1. **Admin creates partnership with developer**
   - Adds 50 properties @ ₦3.5M each
   - Terms: 8.5%, 10-year, 20% down
2. **Teacher applies for property ID 123**
   - Down payment: ₦700k (from ₦500k welfare + ₦200k savings)
   - Mortgage: ₦2.8M over 10 years
   - Monthly payment: ₦32k
3. **System creates:**
   - `housing_applications` record
   - `mortgages` contract
4. **Monthly:**
   - Teacher earns ₦150k/month
   - ₦32k automatically deducted for mortgage
   - ₦15k (10%) goes to welfare
   - Teacher gets ₦103k

### Example 4: Payment Tracking

```
Month 1: Payment ₦32,000 → Principal ₦28k + Interest ₦4k
         Remaining: ₦2,772,000
Month 2: Payment ₦32,000 → Principal ₦28.1k + Interest ₦3.9k
         Remaining: ₦2,743,900
...
Month 120 (10 years): Last payment + homeowner status
         Remaining: ₦0
```

---

## Integration Points

### With Welfare Fund System (Existing)
- Welfare fund accumulations tracked
- Automatically used as down payment
- Monitored for ₦500k milestone

### With Earnings/Payment System
- Monthly earnings retrieved
- Mortgage payments deducted
- Debt-to-income ratio calculated

### With Authentication
- All teacher endpoints protected by `auth` middleware
- Admin endpoints require user role verification
- Property operations audit-logged

### With Admin Dashboard
- Partnership performance metrics
- Application review queue
- Teacher housing status tracking

---

## Important Notes

1. **Debt-to-Income Limit:** Monthly payment cannot exceed 40% of income
2. **Interest Calculation:** Uses standard amortization formula
3. **Payment Timing:** Automatic deduction from earnings (like welfare fund)
4. **Missed Payments:** Recorded but need escalation logic (future enhancement)
5. **Tax Implications:** Teachers should track mortgage interest deductions (future enhancement)
6. **Insurance:** Property insurance should be handled separately (future enhancement)

---

## Future Enhancements

1. **Payment Reminders:** Email/SMS before payment due dates
2. **Loan Modifications:** Allow early repayment without penalty
3. **Refinancing:** Lower interest rates after X years
4. **Insurance Integration:** Property and mortgage protection
5. **Tax Documentation:** Generate mortgage statements for tax purposes
6. **Missed Payment Escalation:** Reminders, penalties, foreclosure notices
7. **Alternative Down Payments:** Multiple payment options
8. **Co-Signer Support:** Family members as co-signers

---

## Testing Checklist

- [ ] Teacher eligibility check works
- [ ] Welfare fund milestone triggers at ₦500k
- [ ] Partnership creation stores correctly
- [ ] Properties added with correct units
- [ ] Housing application accepted when eligible
- [ ] Mortgage contract created with correct calculations
- [ ] Monthly payments calculated correctly
- [ ] Debt-to-income validation rejects over-leveraged
- [ ] Payment processing deducts correctly
- [ ] Amortization schedule generated accurately
- [ ] Admin dashboard shows correct metrics
- [ ] Teacher becomes homeowner after full payment

---

## Code Quality

✅ All functions have error handling
✅ Firebase transactions used where needed
✅ Input validation on all endpoints
✅ Audit logging for admin actions
✅ Proper HTTP status codes
✅ Comprehensive error messages
✅ Comments on complex calculations
✅ Modular controller structure
✅ Reusable utility functions
✅ Database schema documentation
