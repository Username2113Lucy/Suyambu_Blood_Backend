import mongoose from 'mongoose';

const BloodRequestSchema = new mongoose.Schema({
  // Basic Information
  patientName: {
    type: String,
    required: [true, 'Patient name is required'],
    trim: true,
    uppercase: true
  },
  hospitalName: {
    type: String,
    required: [true, 'Hospital name is required'],
    trim: true
  },
  contactNumber: {
    type: String,
    required: [true, 'Contact number is required'],
    trim: true,
    match: [/^\d{10}$/, 'Phone number must be 10 digits']
  },
  
  // Medical Requirements
  bloodGroup: {
    type: String,
    required: [true, 'Blood group is required'],
    enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']
  },
  unitsRequired: {
    type: Number,
    required: true,
    min: [1, 'At least 1 unit is required'],
    max: [10, 'Maximum 10 units per request'],
    default: 1
  },
  urgency: {
    type: String,
    required: true,
    enum: ['low', 'medium', 'high', 'emergency'],
    default: 'medium'
  },
  
  // Location
  district: {
    type: String,
    required: [true, 'District is required'],
    enum: [
      'Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore',
      'Dharmapuri', 'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram',
      'Kanyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai',
      'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai',
      'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi',
      'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli',
      'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur',
      'Vellore', 'Viluppuram', 'Virudhunagar'
    ]
  },
  
  // Additional Information
  additionalNotes: {
    type: String,
    trim: true,
    default: ''
  },
  
  // Donor Contact Tracking
  contactedDonors: [{
    donorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Donor'
    },
    contactStatus: {
      type: String,
      enum: ['not_contacted', 'contacted', 'confirmed', 'declined', 'unavailable'],
      default: 'not_contacted'
    },
    contactTime: Date,
    notes: String
  }],
  
  // Search Session Tracking
  searchSession: {
    sessionId: String,
    currentPage: {
      type: Number,
      default: 1
    },
    donorsPerPage: {
      type: Number,
      default: 5
    },
    totalPages: Number,
    statusUpdates: [{
      donorId: mongoose.Schema.Types.ObjectId,
      oldStatus: String,
      newStatus: String,
      updatedAt: Date
    }]
  },
  
  // Request Status
  status: {
    type: String,
    enum: ['pending', 'in_progress', 'fulfilled', 'cancelled', 'expired'],
    default: 'pending'
  },
  
  // Tracking Information
  requestNumber: {
    type: String,
    unique: true
  },
  submittedByIp: String,
  submittedByUserAgent: String,
  
  // Timestamps
  requestedAt: {
    type: Date,
    default: Date.now
  },
  fulfilledAt: Date,
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Remove next parameter entirely
BloodRequestSchema.pre('save', async function() {
  if (!this.requestNumber) {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    this.requestNumber = `BR-${timestamp}-${random}`.toUpperCase();
  }
});

BloodRequestSchema.pre('save', async function() {
  this.lastUpdated = new Date();
});

// Indexes for faster queries
BloodRequestSchema.index({ district: 1, bloodGroup: 1 });
BloodRequestSchema.index({ status: 1, urgency: 1 });
BloodRequestSchema.index({ requestNumber: 1 }, { unique: true });
BloodRequestSchema.index({ requestedAt: -1 });

export default mongoose.model('BloodRequest', BloodRequestSchema);