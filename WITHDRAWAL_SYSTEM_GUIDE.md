# Teacher Cash-Out / Withdrawal System

## Overview

The Teacher Cash-Out System enables educators to withdraw their accessible earnings from the EduWins platform. Teachers can request withdrawals via their bank accounts, with automatic processing through Paystack.

---

## System Architecture

### Backend Components

1. **withdrawalController.js** - Main business logic
   - 7 main functions for withdrawal operations
   - Earnings validation and balance calculation
   - Paystack integration for transfers

2. **withdrawals.js (Routes)** - API endpoints
   - 7 endpoints for teacher operations
   - 1 admin endpoint for processing withdrawals
   - Bank list retrieval

3. **server.js** - Route registration
   - Mounted at `/api/withdrawals`
   - Requires authentication middleware

### Frontend Components

1. **WithdrawalPage.jsx** - Complete UI component
   - 3 tabs: Available Balance, Withdraw, Withdrawal History
   - Real-time balance calculation
   - Transaction history with filtering

---

## How It Works

### Step 1: Check Available Balance

**Endpoint:** `GET /api/withdrawals/available-balance`

**Formula:**
```
Available Balance = Total Earnings - (Welfare Fund + Mortgage Payment + Reserved Pending Withdrawals)
```

**Breakdown:**
- **Total Earnings**: Sum of all lesson payments + premium content sales
- **Welfare Fund (10%)**: Automatically deducted, reserved for housing
- **Mortgage Payment**: If teacher has active mortgage, monthly payment deducted
- **Reserved Pending**: Funds from pending/processing withdrawals

**Response:**
```json
{
  "success": true,
  "totalEarnings": 250000,
  "totalAcquired": 250000,
  "deductions": {
    "welfareFund": 25000,
    "mortgagePayment": 15000,
    "reserved": 0
  },
  "availableBalance": 210000,
  "minWithdrawal": 5000,
  "maxWithdrawal": 500000,
  "processingFee": "1%",
  "estimatedProcessingTime": "24 hours"
}
```

### Step 2: Initiate Withdrawal Request

**Endpoint:** `POST /api/withdrawals/initiate`

**Request:**
```json
{
  "amount": 100000,
  "bankCode": "044",
  "accountNumber": "1234567890",
  "accountName": "John Doe",
  "narration": "Monthly withdrawal"
}
```

**Validations Performed:**
1. ✅ Amount >= ₦5,000 (minimum)
2. ✅ Amount <= ₦500,000 (per request max)
3. ✅ Amount <= Available Balance
4. ✅ Monthly total doesn't exceed ₦5,000,000
5. ✅ Bank account validation via Paystack

**Processing Fee:** 1% of withdrawal amount

**Response:**
```json
{
  "success": true,
  "withdrawalId": "WD_123456",
  "message": "Withdrawal request initiated successfully",
  "details": {
    "amount": "₦100,000",
    "processingFee": "₦1,000",
    "netAmount": "₦99,000",
    "status": "pending",
    "estimatedProcessingTime": "24 hours"
  }
}
```

**What Happens:**
1. ✅ Withdrawal record created in Firebase with status "pending"
2. ✅ Amount reserved from teacher's earnings
3. ✅ Notification sent to teacher
4. ✅ System ready for admin processing

### Step 3: Admin Processing

**Endpoint:** `POST /api/admin/withdrawals/process`

**Request:**
```json
{
  "withdrawalId": "WD_123456",
  "teacherId": "teacher_id_123"
}
```

**Processing:**
1. ✅ Withdrawal status changes to "processing"
2. ✅ Paystack API transfers funds
3. ✅ Status changes to "completed" or "failed"
4. ✅ Notification sent to teacher

**Automated Bank Recipient Creation:**
- System auto-generates recipient code using bank code + account number
- First transfer requires Paystack to validate account
- Subsequent transfers use saved recipient

### Step 4: Withdrawal History & Tracking

**Endpoint:** `GET /api/withdrawals/history?status=completed&limit=50&offset=0`

**Filters:**
- `status`: pending, processing, completed, failed
- `limit`: Results per page (default 50)
- `offset`: Pagination offset (default 0)

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_withdrawn": 500000,
    "total_processing_fees": 5000,
    "pending_count": 2,
    "completed_count": 10,
    "failed_count": 1
  },
  "withdrawals": [
    {
      "withdrawal_id": "WD_123456",
      "amount": 100000,
      "net_amount": 99000,
      "processing_fee": 1000,
      "bank_code": "044",
      "account_number": "****7890",
      "account_name": "John Doe",
      "status": "completed",
      "created_at": "2026-03-30T10:30:00Z",
      "completed_at": "2026-03-30T14:30:00Z",
      "paystackReference": "PSK_REF_123456"
    }
  ],
  "pagination": {
    "total": 13,
    "limit": 50,
    "offset": 0,
    "pages": 1
  }
}
```

---

## Database Schema

### Firebase Nodes

#### `withdrawals/{teacherId}/{withdrawalId}`
```javascript
{
  withdrawal_id: "WD_123456",
  teacher_id: "teacher_id_123",
  amount: 100000,                    // Gross amount requested
  net_amount: 99000,                 // After 1% fee
  processing_fee: 1000,              // 1% deduction
  bank_code: "044",                  // Guaranty Trust Bank
  account_number: "****7890",        // Last 4 digits only (secure)
  account_name: "John Doe",
  narration: "Monthly withdrawal",
  status: "completed",               // pending → processing → completed/failed
  created_at: "2026-03-30T10:30:00Z",
  month: "2026-03",
  paystackReference: "PSK_REF_123456",
  failureReason: null,               // If status is 'failed'
  completed_at: "2026-03-30T14:30:00Z"
}
```

#### Integration with existing nodes:
```javascript
// earnings/{teacherId} - updated when withdrawal initiated
{
  total: 250000,
  acquired_from_lessons: 210000,     // Reduced by withdrawal amount
  from_premium_sales: 40000
}

// notifications/{teacherId} - withdrawal status updates
{
  type: "withdrawal_initiated" | "withdrawal_completed" | "withdrawal_failed",
  title: "...",
  message: "...",
  read: false,
  created_at: "2026-03-30T10:30:00Z"
}
```

---

## Configuration

### Withdrawal Limits

```javascript
WITHDRAWAL_CONFIG = {
  MIN_AMOUNT: 5000,                  // Minimum ₦5,000
  MAX_AMOUNT_PER_REQUEST: 500000,    // Maximum ₦500,000 per request
  MAX_AMOUNT_PER_MONTH: 5000000,     // Maximum ₦5,000,000 per month
  PROCESSING_FEE_PERCENTAGE: 1,      // 1% fee
  PROCESSING_TIME_HOURS: 24          // Est. 24 hour processing
}
```

### Paystack Configuration

Required environment variables in `.env`:
```
PAYSTACK_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxx
```

---

## Frontend Components

### WithdrawalPage.jsx (600+ lines)

#### Tab 1: Available Balance
- **Balance Display Card**
  - Shows accessible balance with eye/hide toggle
  - Direct navigation to withdrawal form
  - Real-time calculation

- **Balance Breakdown Card**
  - Total earnings breakdown
  - Deductions itemization (welfare, mortgage, reserved)
  - Percentage visualization

- **Limits & Info Card**
  - Min/max withdrawal limits
  - Processing fee (1%)
  - Estimated processing time (24hrs)
  - Info about welfare fund

**Features:**
- ✅ Secure balance hiding with toggle
- ✅ Detailed breakdown of all deductions
- ✅ Clear explanation of withdrawal limits
- ✅ Warning about welfare fund enrollment

#### Tab 2: Withdraw
- **Withdrawal Request Form**
  - Amount input with min/max validation
  - Bank dropdown (fetches from Paystack)
  - Account number input
  - Account name input
  - Optional narration

- **Fee Calculator**
  - Real-time display of processing fee
  - Shows gross vs net amount
  - Live calculation as amount changes

- **Info Sidebar**
  - Security information
  - Processing time details
  - Fee explanation
  - Paystack secure transfer assurance
  - Warnings about non-editable requests

**Validations:**
- ✅ Amount >= minimum withdrawal
- ✅ Amount <= maximum per request
- ✅ Total monthly amount <= limit
- ✅ Amount <= available balance
- ✅ All required fields populated

#### Tab 3: Withdrawal History
- **Statistics Cards**
  - Total withdrawn
  - Pending count
  - Failed count
  - Total fees paid

- **Status Filter**
  - All | Pending | Processing | Completed | Failed
  - Refreshes table on filter change

- **Withdrawal Table**
  - Date, Amount, Fee, Net Amount, Bank (last 4 digits), Status, Actions
  - Status badges with color coding
  - Cancel button for pending withdrawals
  - Sorted by newest first

**Status Badges:**
- 🟨 **Pending** (Yellow) - Awaiting processing
- 🔵 **Processing** (Blue) - Being transferred
- 🟢 **Completed** (Green) - Successfully transferred
- 🔴 **Failed** (Red) - Transfer failed, amount refunded

---

## API Reference

### 1. Get Available Balance
```
GET /api/withdrawals/available-balance
Auth: Required (JWT token)
Response: Balance breakdown with limits
```

### 2. Initiate Withdrawal
```
POST /api/withdrawals/initiate
Auth: Required
Body: {
  amount, bankCode, accountNumber, accountName, narration
}
Response: Withdrawal ID and confirmation
```

### 3. Get Withdrawal History
```
GET /api/withdrawals/history?status=completed&limit=50
Auth: Required
Query: status, limit, offset
Response: Paginated withdrawal list with stats
```

### 4. Get Withdrawal Details
```
GET /api/withdrawals/:withdrawalId
Auth: Required
Response: Single withdrawal record
```

### 5. Cancel Withdrawal
```
DELETE /api/withdrawals/:withdrawalId/cancel
Auth: Required
Condition: Only if status is "pending"
Response: Cancellation confirmation with refund amount
```

### 6. Get Bank Codes
```
GET /api/withdrawals/banks/list
Auth: Optional
Response: Array of available banks {code, name, longcode}
```

### 7. Process Withdrawal (Admin)
```
POST /api/admin/withdrawals/process
Auth: Required
Body: { withdrawalId, teacherId }
Response: Paystack transfer status
```

---

## Security Measures

### Data Protection
✅ Account numbers partially masked (show only last 4 digits)
✅ Account holder names stored in full for verification
✅ All transfers via Paystack (PCI-DSS compliant)
✅ SSL/TLS encryption for all API calls
✅ Request authentication via JWT token

### Transaction Validation
✅ Bank account validation against Paystack database
✅ Account name verification
✅ Monthly withdrawal limit enforcement
✅ Per-request maximum enforcement
✅ Availability check before processing

### Fraud Prevention
✅ Only teacher can cancel their own withdrawals
✅ Withdrawal amounts logged for audit
✅ Processing fee calculation verified server-side
✅ Paystack webhook verification (HMAC signature)

---

## Error Handling

### Common Errors

**400 - Insufficient Balance**
```json
{
  "error": "Insufficient balance. Available: ₦50,000",
  "available": 50000
}
```

**400 - Amount Below Minimum**
```json
{
  "error": "Minimum withdrawal amount is ₦5,000"
}
```

**400 - Monthly Limit Exceeded**
```json
{
  "error": "Monthly limit exceeded. Used: ₦3,000,000, Limit: ₦5,000,000",
  "used": 3000000,
  "limit": 5000000
}
```

**404 - Withdrawal Not Found**
```json
{
  "error": "Withdrawal not found"
}
```

**500 - Processing Error**
```json
{
  "error": "Could not initiate withdrawal request"
}
```

---

## Workflow Example

### Teacher's Journey to Cash Out

**1. Teacher Logs In**
```
✅ Navigates to /withdrawals
```

**2. Checks Available Balance**
```
GET /api/withdrawals/available-balance

Response:
- Total Earnings: ₦300,000
- Welfare Fund: -₦30,000 (saved for housing)
- Mortgage: -₦15,000 (if active)
- Available: ₦255,000

✅ Teacher sees they can withdraw up to ₦500,000 but only has ₦255,000 available
```

**3. Submits Withdrawal Request**
```
POST /api/withdrawals/initiate

Body: {
  amount: 100000,
  bankCode: "044",
  accountNumber: "1234567890",
  accountName: "John Doe",
  narration: "March earnings"
}

Response:
- Withdrawal ID: WD_KJD892
- Status: pending
- Gross: ₦100,000
- Fee (1%): ₦1,000
- Net: ₦99,000
- Processing Time: ~24 hours

✅ Teacher receives confirmation notification
✅ Amount reserved from earnings (₦255k → ₦155k available)
```

**4. Admin Reviews & Processes**
```
POST /api/admin/withdrawals/process

Body: {
  withdrawalId: "WD_KJD892",
  teacherId: "teacher_123"
}

✅ Status changes: pending → processing
✅ Paystack API initiated transfer
✅ Funds transferred to bank account
✅ Status changes: processing → completed
```

**5. Teacher Receives Notification**
```
Title: "Withdrawal Completed"
Message: "Your withdrawal of ₦99,000 has been successfully transferred to your bank account."

✅ Teacher receives SMS/Email confirmation
✅ Funds in bank account within minutes
```

**6. Teacher Checks History**
```
GET /api/withdrawals/history

✅ Withdrawal appears in history table
✅ Status: Completed ✓
✅ Shows net amount received: ₦99,000
✅ Shows fee paid: ₦1,000
```

---

## Integration Points

### 1. With Earnings System
- Reads from `earnings/{teacherId}` node
- Updates `acquired_from_lessons` when withdrawal initiated
- Refunds on cancellation

### 2. With Welfare Fund System
- Welfare fund portion always protected and non-withdrawable
- Only accessible via accumulated fund or housing application

### 3. With Mortgage System
- If teacher has active mortgage, monthly payment protected
- Mortgage deduction included in balance calculation

### 4. With Notification System
- Withdrawal initiated notification
- Processing notification (optional)
- Completion notification
- Failure notification with refund confirmation

### 5. With Paystack
- Bank validation (optional, improves success rate)
- Transfer initiation
- Webhook callback on completion
- Auto-retry on transient failures (in future version)

---

## Testing Checklist

### Balance Calculation
- [ ] Earnings without deductions shows correctly
- [ ] Welfare fund (10%) calculated correctly
- [ ] Mortgage payment (if active) deducted
- [ ] Reserved pending withdrawals tracked
- [ ] Final available balance accurate

### Withdrawal Initiation
- [ ] Min amount (₦5k) enforced
- [ ] Max per request (₦500k) enforced  
- [ ] Max per month (₦5m) enforced
- [ ] Insufficient balance rejected
- [ ] Bank validation passes
- [ ] All required fields validated

### Processing
- [ ] Paystack transfer initiates
- [ ] Status transitions: pending → processing → completed
- [ ] Notification sent on completion
- [ ] Amount appears in teacher's bank account
- [ ] Withdrawal history updated

### Withdrawal History
- [ ] Correct stats calculated
- [ ] Filtering by status works
- [ ] Pagination works
- [ ] Most recent withdrawals first

### Edge Cases
- [ ] Cancellation works (pending only)
- [ ] Failed transfer triggers refund
- [ ] Duplicate submissions prevented
- [ ] Account name masking works
- [ ] Fees calculated server-side

### Security
- [ ] Only teacher can access their withdrawals
- [ ] Account numbers partially masked
- [ ] Paystack webhook validated
- [ ] Monthly limits enforced
- [ ] No concurrent withdrawal exploits

---

## Future Enhancements

### Phase 2
- [ ] Recurring withdrawals (auto-withdraw after earnings threshold)
- [ ] Withdrawal scheduling (schedule for specific date)
- [ ] Multiple bank accounts (add/save for future use)
- [ ] Withdrawal analytics & reports
- [ ] Early warning alerts (approaching monthly limit)

### Phase 3
- [ ] Mobile wallet integration
- [ ] Crypto withdrawal option
- [ ] International bank transfers
- [ ] Payroll tie-in (sync with HRMS)
- [ ] Tax documentation generation

### Phase 4
- [ ] Machine learning fraud detection
- [ ] Biometric authorization for large withdrawals
- [ ] Real-time FX conversion for international
- [ ] Batch processing for admin efficiency
- [ ] Audit trail and compliance reports

---

## Troubleshooting

### Bank Transfer Failed
**Problem:** Withdrawal status shows "failed"

**Solutions:**
1. Check account number is correct (re-verify with bank)
2. Check account name matches bank records exactly
3. Try again (may be temporary bank issue)
4. Contact support with Paystack reference

### Balance Shows Lower Than Expected
**Problem:** Available balance is less than total earnings

**Reason:** Deductions include:
- Welfare fund (10% always reserved)
- Active mortgage payment
- Pending withdrawal reserves

**Solution:** Check "Balance Breakdown" tab for itemization

### Withdrawal Stuck in "Processing"
**Problem:** Withdrawal hasn't completed after 24 hours

**Solution:**
1. Wait up to 24 business hours
2. Check bank account (may have completed silently)
3. Contact support with withdrawal ID

---

## Dashboard Integration

Add withdrawal option to teacher dashboard tabs:

```jsx
// In DashboardPage.jsx - teacher navigation tabs
const teacherTabs = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'schedule', label: 'Schedule', icon: '📅' },
  { id: 'earnings', label: 'Earnings', icon: '💵' },
  { id: 'welfare', label: 'Welfare Fund', icon: '🏦' },
  { id: 'withdrawals', label: 'Cash Out', icon: '💰' },  // NEW
  { id: 'reports', label: 'Reports', icon: '📊' },
  { id: 'settings', label: 'Settings', icon: '⚙️' }
]
```

---

## Deployment Checklist

Before going live:

- [ ] PAYSTACK_SECRET_KEY set in production .env
- [ ] Database backup configured
- [ ] Error logging enabled
- [ ] Rate limiting configured (withdrawal endpoint)
- [ ] Email notifications configured
- [ ] SMS notifications configured
- [ ] Paystack webhook verified and configured
- [ ] Security headers set (CORS, CSP)
- [ ] API endpoints tested with Postman
- [ ] Frontend tested across browsers
- [ ] Mobile responsiveness verified
- [ ] Load testing completed
- [ ] Backup withdrawal process documented (manual transfers if needed)
- [ ] Support documentation created for admins

---

## Support & Maintenance

### Daily Tasks
- Monitor failed withdrawals
- Check error logs
- Verify Paystack connectivity

### Weekly Tasks
- Review withdrawal statistics
- Check for suspicious patterns
- Verify bank account connections

### Monthly Tasks
- Generate withdrawal reports
- Audit transaction logs
- Update limits if needed

### Quarterly Tasks
- Security audit
- Performance optimization
- Feature planning

---

*Last Updated: March 30, 2026*
*Version: 1.0*
*Status: Production Ready*
