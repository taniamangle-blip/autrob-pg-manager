export type DefaultMessageTemplate = { templateKey: string; name: string; category: string; body: string; defaultChannel: 'WhatsApp' };

export const DEFAULT_MESSAGE_TEMPLATES: DefaultMessageTemplate[] = [
  {
    "templateKey": "system-01",
    "name": "Enquiry Received",
    "category": "ENQUIRY & BOOKING",
    "body": "Hi {{ResidentName}},\n\nThank you for your enquiry about accommodation at {{PropertyName}}.\n\nWe have received your request and will get back to you shortly with availability and stay details.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-02",
    "name": "Room/Bed Availability",
    "category": "ENQUIRY & BOOKING",
    "body": "Hi {{ResidentName}},\n\nGood news! We currently have accommodation available at {{PropertyName}}.\n\nRoom/Bed: {{RoomNumber}} / {{BedNumber}}\nMonthly Rent: ₹{{RentAmount}}\n\nPlease contact us if you would like to proceed with the booking.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-03",
    "name": "Booking Confirmation",
    "category": "ENQUIRY & BOOKING",
    "body": "Hi {{ResidentName}},\n\nYour booking at {{PropertyName}} is confirmed. 🎉\n\nRoom/Bed: {{RoomNumber}} / {{BedNumber}}\nCheck-in Date: {{CheckInDate}}\nMonthly Rent: ₹{{RentAmount}}\nSecurity Deposit: ₹{{DepositAmount}}\n\nWe look forward to welcoming you!\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-04",
    "name": "Advance Payment Received",
    "category": "ENQUIRY & BOOKING",
    "body": "Hi {{ResidentName}},\n\nWe have received your advance/booking payment of ₹{{Amount}}.\n\nYour booking at {{PropertyName}} has been updated successfully.\n\nThank you!\n\n— {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-05",
    "name": "Upcoming Check-in Reminder",
    "category": "CHECK-IN & WELCOME",
    "body": "Hi {{ResidentName}},\n\nThis is a reminder that your check-in at {{PropertyName}} is scheduled for {{CheckInDate}}.\n\nRoom/Bed: {{RoomNumber}} / {{BedNumber}}\n\nPlease keep your required ID/KYC documents ready.\n\nWe look forward to welcoming you!\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-06",
    "name": "Welcome Message",
    "category": "CHECK-IN & WELCOME",
    "body": "Hi {{ResidentName}} 👋\n\nWelcome to {{PropertyName}}!\n\nRoom/Bed: {{RoomNumber}} / {{BedNumber}}\n\nWe hope you have a comfortable and pleasant stay with us.\n\nFor any assistance, please contact {{ContactNumber}}.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-07",
    "name": "KYC/Documents Pending",
    "category": "CHECK-IN & WELCOME",
    "body": "Hi {{ResidentName}},\n\nYour KYC/document verification for your stay at {{PropertyName}} is still pending.\n\nPlease submit the required documents at the earliest.\n\nIf already submitted, please ignore this message.\n\nThank you.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-08",
    "name": "House Rules",
    "category": "CHECK-IN & WELCOME",
    "body": "Hi {{ResidentName}},\n\nA friendly reminder to please follow the house rules of {{PropertyName}} for a safe and comfortable environment for everyone.\n\nPlease check the House Rules section or contact management if you need any clarification.\n\nThank you for your cooperation.\n\n— {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-09",
    "name": "Upcoming Rent Reminder",
    "category": "RENT & PAYMENTS",
    "body": "Hi {{ResidentName}},\n\nA friendly reminder that your rent of ₹{{RentAmount}} is due on {{DueDate}}.\n\nPlease make the payment on or before the due date to avoid late charges.\n\nIf already paid, please ignore this message.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-10",
    "name": "Rent Due Today",
    "category": "RENT & PAYMENTS",
    "body": "Hi {{ResidentName}},\n\nYour rent of ₹{{RentAmount}} for {{PropertyName}} is due today.\n\nPlease complete the payment today to avoid late charges of ₹50 per day from the applicable overdue date.\n\nIf already paid, please ignore this message.\n\nThank you.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-11",
    "name": "Rent Overdue",
    "category": "RENT & PAYMENTS",
    "body": "Hi {{ResidentName}},\n\nYour rent payment is overdue.\n\nRent: ₹{{RentAmount}}\nDue Date: {{DueDate}}\nDays Late: {{LateDays}}\nLate Fee: ₹{{LateFee}}\nTotal Due: ₹{{TotalDue}}\n\nPlease clear the outstanding amount at the earliest.\n\nIf already paid, please contact management so we can update our records.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-12",
    "name": "Payment Received",
    "category": "RENT & PAYMENTS",
    "body": "Hi {{ResidentName}},\n\nPayment received successfully. ✅\n\nAmount: ₹{{Amount}}\nFor: {{PaymentType}}\nPayment Date: {{PaymentDate}}\nReceipt No.: {{ReceiptNumber}}\n\nThank you!\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-13",
    "name": "Pending Payment",
    "category": "RENT & PAYMENTS",
    "body": "Hi {{ResidentName}},\n\nThis is a reminder that ₹{{TotalDue}} is currently pending on your account at {{PropertyName}}.\n\nPlease clear the outstanding amount at the earliest.\n\nIf you believe this amount is incorrect, please contact management.\n\n— {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-14",
    "name": "Electricity Bill Generated",
    "category": "ELECTRICITY & OTHER CHARGES",
    "body": "Hi {{ResidentName}},\n\nYour electricity bill for the current billing period has been generated.\n\nUnits/Share: {{ElectricityUnits}}\nElectricity Amount: ₹{{ElectricityAmount}}\nDue Date: {{DueDate}}\n\nPlease make the payment on or before the due date.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-15",
    "name": "Additional Charges",
    "category": "ELECTRICITY & OTHER CHARGES",
    "body": "Hi {{ResidentName}},\n\nAn additional charge has been added to your account.\n\nCharge: {{PaymentType}}\nAmount: ₹{{Amount}}\nDue Date: {{DueDate}}\n\nPlease check your account for details or contact management if you have any questions.\n\n— {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-16",
    "name": "Cleaning Schedule",
    "category": "STAY & PROPERTY OPERATIONS",
    "body": "Hi {{ResidentName}},\n\nCleaning for your room/common area is scheduled for:\n\nDate: {{ScheduledDate}}\nTime: {{ScheduledTime}}\n\nPlease cooperate with the housekeeping team.\n\nThank you.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-17",
    "name": "Maintenance Notice",
    "category": "STAY & PROPERTY OPERATIONS",
    "body": "Hi {{ResidentName}},\n\nMaintenance work is scheduled at {{PropertyName}}.\n\nDate: {{ScheduledDate}}\nTime: {{ScheduledTime}}\n\nThere may be temporary inconvenience during this period.\n\nThank you for your patience and cooperation.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-18",
    "name": "Water Supply Notice",
    "category": "STAY & PROPERTY OPERATIONS",
    "body": "Hi {{ResidentName}},\n\nPlease note that the water supply may be temporarily affected at {{PropertyName}}.\n\nDate: {{ScheduledDate}}\nExpected Time: {{ScheduledTime}}\n\nWe apologize for the inconvenience and appreciate your cooperation.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-19",
    "name": "Electricity/Power Notice",
    "category": "STAY & PROPERTY OPERATIONS",
    "body": "Hi {{ResidentName}},\n\nPlease note that electricity/power supply may be temporarily affected at {{PropertyName}}.\n\nDate: {{ScheduledDate}}\nExpected Time: {{ScheduledTime}}\n\nThank you for your understanding.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-20",
    "name": "Wi-Fi/Internet Notice",
    "category": "STAY & PROPERTY OPERATIONS",
    "body": "Hi {{ResidentName}},\n\nThe Wi-Fi/internet service at {{PropertyName}} is currently undergoing maintenance.\n\nWe are working to restore the service as soon as possible.\n\nThank you for your patience.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-21",
    "name": "Parcel Received",
    "category": "STAY & PROPERTY OPERATIONS",
    "body": "Hi {{ResidentName}},\n\nA parcel/delivery has been received for you at {{PropertyName}}.\n\nPlease collect it from the designated collection point/reception.\n\nThank you.\n\n— {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-22",
    "name": "Complaint Received",
    "category": "COMPLAINTS & SERVICE REQUESTS",
    "body": "Hi {{ResidentName}},\n\nWe have received your complaint/service request.\n\nComplaint No.: {{ComplaintNumber}}\nIssue: {{ComplaintType}}\n\nOur team will review it and take the necessary action.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-23",
    "name": "Complaint In Progress",
    "category": "COMPLAINTS & SERVICE REQUESTS",
    "body": "Hi {{ResidentName}},\n\nYour complaint/service request {{ComplaintNumber}} is currently being worked on.\n\nIssue: {{ComplaintType}}\n\nWe will notify you once it has been resolved.\n\nThank you for your patience.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-24",
    "name": "Complaint Resolved",
    "category": "COMPLAINTS & SERVICE REQUESTS",
    "body": "Hi {{ResidentName}},\n\nYour complaint/service request has been marked as resolved. ✅\n\nComplaint No.: {{ComplaintNumber}}\nIssue: {{ComplaintType}}\n\nIf the issue still persists, please contact management.\n\n— {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-25",
    "name": "General Notice",
    "category": "RULES, WARNINGS & NOTICES",
    "body": "Hi {{ResidentName}},\n\nImportant notice from {{PropertyName}}:\n\n{{CustomMessage}}\n\nThank you.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-26",
    "name": "Rule Violation Warning",
    "category": "RULES, WARNINGS & NOTICES",
    "body": "Hi {{ResidentName}},\n\nThis is a notice regarding a violation of the property/house rules at {{PropertyName}}.\n\nIssue:\n{{CustomMessage}}\n\nPlease ensure that the property rules are followed going forward.\n\nIf you need clarification, please contact management.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-27",
    "name": "Visitor Policy Reminder",
    "category": "RULES, WARNINGS & NOTICES",
    "body": "Hi {{ResidentName}},\n\nA friendly reminder to follow the visitor policy of {{PropertyName}}.\n\nPlease ensure that all visitors comply with the property's entry, timing and identification requirements.\n\nThank you for your cooperation.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-28",
    "name": "Emergency/Security Notice",
    "category": "RULES, WARNINGS & NOTICES",
    "body": "IMPORTANT NOTICE — {{PropertyName}}\n\nHi {{ResidentName}},\n\n{{CustomMessage}}\n\nPlease follow the instructions provided by management.\n\nFor assistance, contact {{ContactNumber}}.\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-29",
    "name": "Stay Renewal Reminder",
    "category": "RENEWAL",
    "body": "Hi {{ResidentName}},\n\nYour current stay period at {{PropertyName}} is approaching its renewal date.\n\nCurrent/Expected End Date: {{CheckOutDate}}\n\nPlease let us know whether you would like to continue your stay.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-30",
    "name": "Rent Revision Notice",
    "category": "RENEWAL",
    "body": "Hi {{ResidentName}},\n\nPlease note that your monthly rent at {{PropertyName}} will be revised.\n\nCurrent Rent: ₹{{RentAmount}}\nNew Rent: ₹{{NewRentAmount}}\nEffective From: {{EffectiveDate}}\n\nPlease contact management if you need any clarification.\n\n— {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-31",
    "name": "Checkout Reminder",
    "category": "CHECKOUT",
    "body": "Hi {{ResidentName}},\n\nThis is a reminder that your scheduled checkout from {{PropertyName}} is on {{CheckOutDate}}.\n\nRoom/Bed: {{RoomNumber}} / {{BedNumber}}\n\nPlease ensure that all pending dues and checkout formalities are completed before leaving.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-32",
    "name": "Pending Dues Before Checkout",
    "category": "CHECKOUT",
    "body": "Hi {{ResidentName}},\n\nYour checkout is scheduled for {{CheckOutDate}}.\n\nOutstanding Amount: ₹{{TotalDue}}\n\nPlease clear all pending dues before completing checkout.\n\nIf already paid, please contact management to update the records.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-33",
    "name": "Room Inspection",
    "category": "CHECKOUT",
    "body": "Hi {{ResidentName}},\n\nYour room/bed inspection is scheduled before checkout.\n\nDate: {{ScheduledDate}}\nTime: {{ScheduledTime}}\nRoom/Bed: {{RoomNumber}} / {{BedNumber}}\n\nPlease ensure your belongings have been removed and the space is ready for inspection.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-34",
    "name": "Security Deposit Settlement",
    "category": "CHECKOUT",
    "body": "Hi {{ResidentName}},\n\nYour security deposit settlement has been processed.\n\nSecurity Deposit: ₹{{DepositAmount}}\nAdjustments/Deductions: ₹{{DeductionAmount}}\nFinal Refund: ₹{{RefundAmount}}\n\nPlease check your settlement details for the complete breakdown.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-35",
    "name": "Refund Processed",
    "category": "CHECKOUT",
    "body": "Hi {{ResidentName}},\n\nYour refund of ₹{{RefundAmount}} has been processed successfully. ✅\n\nRefund Date: {{PaymentDate}}\n\nThank you for staying with {{PropertyName}}.\n\n— {{PropertyName}}",
    "defaultChannel": "WhatsApp"
  },
  {
    "templateKey": "system-36",
    "name": "Thank You & Feedback",
    "category": "CHECKOUT",
    "body": "Hi {{ResidentName}},\n\nThank you for staying with {{PropertyName}}! 🙏\n\nWe hope you had a comfortable experience.\n\nWe would appreciate your feedback about your stay.\n\nYour feedback helps us improve our services.\n\nWe wish you all the best!\n\n— {{PropertyName}}\n",
    "defaultChannel": "WhatsApp"
  }
];
