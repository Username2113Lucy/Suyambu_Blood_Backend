import express from 'express';
import Donor from '../models/Donor_Reg.js';

const router = express.Router();

// ONLY THESE ROUTES ARE NEEDED FOR REGISTRATION:

// 1. Register a new donor (your existing code - KEEP THIS)
router.post('/register', async (req, res) => {
  console.log('📝 Registration request received:', req.body);

  try {
    const {
      fullName,
      email,
      phone,
      age,
      gender,
      bloodGroup,
      district,
      address,
      lastDonationDate,
      willingToDonate = true,
      emergencyContact,
      medicalConditions
    } = req.body;

    // Check for existing donor
    const existingDonor = await Donor.findOne({
      $or: [{ email: email.toLowerCase() }, { phone }]
    });

    if (existingDonor) {
      return res.status(400).json({
        success: false,
        message: 'Donor with this email or phone already exists'
      });
    }

    // Create new donor
    const donor = new Donor({
      fullName,
      email: email.toLowerCase(),
      phone,
      age: parseInt(age),
      gender,
      bloodGroup,
      district,
      address,
      lastDonationDate: lastDonationDate || null,
      willingToDonate,
      emergencyContact,
      medicalConditions: medicalConditions || ''
    });

    // Save to database
    await donor.save();

    // Prepare response
    const donorResponse = donor.toObject();
    delete donorResponse.__v;

    return res.status(201).json({
      success: true,
      message: 'Donor registered successfully',
      donor: donorResponse
    });

  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: messages
      });
    }
    
    // Handle duplicate key errors
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate entry. Email or phone already exists'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again later'
    });
  }
});

// 2. Search donors for 5-at-a-time system (NEW - SIMPLIFIED)
router.get('/search', async (req, res) => {
  try {
    const { district, bloodGroup, page = 1, limit = 5 } = req.query;
    
    if (!district || !bloodGroup) {
      return res.status(400).json({
        success: false,
        message: 'District and blood group are required'
      });
    }
    
    // Basic query - will add eligibility filters later
    const query = { 
      district,
      bloodGroup,
      isActive: true,
      willingToDonate: true
    };
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Get donors with pagination
    const donors = await Donor.find(query)
      .select('fullName phone district bloodGroup lastDonationDate')
      .sort({ lastDonationDate: 1 }) // Those who haven't donated recently first
      .skip(skip)
      .limit(limitNum);
    
    // Get total count
    const total = await Donor.countDocuments(query);
    
    return res.json({
      success: true,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      totalDonors: total,
      donors: donors.map(donor => ({
        id: donor._id,
        name: donor.fullName,
        phone: donor.phone,
        bloodGroup: donor.bloodGroup,
        district: donor.district,
        lastDonationDate: donor.lastDonationDate,
        // Calculate if eligible (donated more than 3 months ago)
        isEligible: !donor.lastDonationDate || 
                   (new Date() - new Date(donor.lastDonationDate)) > (90 * 24 * 60 * 60 * 1000)
      }))
    });
    
  } catch (error) {
    console.error('Search error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// 3. Update donor status after contact (NEW)
router.post('/:id/contact', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body; // 'contacted', 'unavailable', 'donated_recently'
    
    const updateData = { lastUpdated: new Date() };
    
    if (status === 'donated_recently') {
      updateData.lastDonationDate = new Date();
    }
    
    const donor = await Donor.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    ).select('fullName phone lastDonationDate');
    
    if (!donor) {
      return res.status(404).json({
        success: false,
        message: 'Donor not found'
      });
    }
    
    return res.json({
      success: true,
      message: `Donor marked as ${status}`,
      donor
    });
    
  } catch (error) {
    console.error('Contact update error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// REMOVE ALL OTHER ROUTES - they're not needed for basic registration + 5-at-a-time search

export default router;