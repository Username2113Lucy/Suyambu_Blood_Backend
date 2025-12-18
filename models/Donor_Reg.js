import mongoose from 'mongoose';

const DonorSchema = new mongoose.Schema({
  // Personal Information
  fullName: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^\d{10}$/, 'Phone number must be 10 digits']
  },
  age: {
    type: Number,
    required: [true, 'Age is required'],
    min: [18, 'Age must be at least 18'],
    max: [65, 'Age must be at most 65']
  },
  gender: {
    type: String,
    required: [true, 'Gender is required'],
    enum: ['Male', 'Female', 'Other', 'Prefer not to say']
  },
  
  // Donation Information
  bloodGroup: {
    type: String,
    required: [true, 'Blood group is required'],
    enum: ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']
  },
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
  lastDonationDate: {
    type: Date,
    default: null
  },
  willingToDonate: {
    type: Boolean,
    default: true
  },
  
  // Additional Information
  address: {
    type: String,
    trim: true
  },
  emergencyContact: {
    type: String,
    trim: true,
    match: [/^\d{10}$/, 'Emergency contact must be 10 digits']
  },
  medicalConditions: {
    type: String,
    trim: true,
    default: ''
  },
  
  // System fields
  isActive: {
    type: Boolean,
    default: true
  },
  registrationDate: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for faster queries
DonorSchema.index({ email: 1 }, { unique: true });
DonorSchema.index({ phone: 1 }, { unique: true });
DonorSchema.index({ district: 1, bloodGroup: 1 });
DonorSchema.index({ isActive: 1 });

export default mongoose.model('Donor', DonorSchema);