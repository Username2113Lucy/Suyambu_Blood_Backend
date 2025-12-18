import express from 'express';
import BloodRequest from '../models/Request_Blood.js';
import Donor from '../models/Donor_Reg.js';
import mongoose from 'mongoose';

const router = express.Router();

// Create new blood request
router.post('/create', async (req, res) => {
  try {
    const {
      patientName,
      hospitalName,
      contactNumber,
      bloodGroup,
      unitsRequired = 1,
      urgency = 'medium',
      district,
      additionalNotes = '',
      sessionId,
      currentPage = 1
    } = req.body;

    // Get IP and User Agent for tracking
    const submittedByIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const submittedByUserAgent = req.headers['user-agent'];

    // Create blood request
    const bloodRequest = new BloodRequest({
      patientName,
      hospitalName,
      contactNumber,
      bloodGroup,
      unitsRequired: parseInt(unitsRequired),
      urgency,
      district,
      additionalNotes,
      submittedByIp,
      submittedByUserAgent,
      searchSession: {
        sessionId,
        currentPage,
        donorsPerPage: 5
      }
    });

    // Find matching donors for initial contact list
    const matchingDonors = await Donor.find({
      district,
      bloodGroup,
      isActive: true,
      willingToDonate: true
    })
    .select('_id fullName phone email availability lastDonationDate')
    .sort({ availability: 1, lastUpdated: -1 })
    .limit(50); // Limit initial match to 50 donors

    // Add matching donors to contactedDonors list
    bloodRequest.contactedDonors = matchingDonors.map(donor => ({
      donorId: donor._id,
      contactStatus: 'not_contacted'
    }));

    // Calculate total pages
    const totalPages = Math.ceil(matchingDonors.length / 5);
    bloodRequest.searchSession.totalPages = totalPages;

    // Save blood request
    await bloodRequest.save();

    // Get first 5 donors for current page
    const startIndex = (currentPage - 1) * 5;
    const endIndex = startIndex + 5;
    const currentPageDonors = matchingDonors.slice(startIndex, endIndex);

    return res.status(201).json({
      success: true,
      message: 'Blood request created successfully',
      requestId: bloodRequest._id,
      requestNumber: bloodRequest.requestNumber,
      donors: currentPageDonors.map(donor => ({
        id: donor._id,
        name: donor.fullName,
        phone: donor.phone,
        bloodGroup: donor.bloodGroup,
        availability: donor.availability,
        lastUpdated: donor.lastUpdated
      })),
      pagination: {
        currentPage,
        totalPages,
        totalDonors: matchingDonors.length,
        hasNextPage: currentPage < totalPages,
        hasPreviousPage: currentPage > 1
      }
    });

  } catch (error) {
    console.error('Create blood request error:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: messages
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Server error. Please try again later'
    });
  }
});

// Get next page of donors for a request
router.get('/:requestId/donors/:page', async (req, res) => {
  try {
    const { requestId, page } = req.params;
    const pageNum = parseInt(page) || 1;
    
    const bloodRequest = await BloodRequest.findById(requestId)
      .populate({
        path: 'contactedDonors.donorId',
        select: 'fullName phone bloodGroup availability lastUpdated'
      });
    
    if (!bloodRequest) {
      return res.status(404).json({
        success: false,
        message: 'Blood request not found'
      });
    }
    
    // Update current page in search session
    bloodRequest.searchSession.currentPage = pageNum;
    await bloodRequest.save();
    
    // Calculate pagination
    const donorsPerPage = 5;
    const startIndex = (pageNum - 1) * donorsPerPage;
    const endIndex = startIndex + donorsPerPage;
    
    // Get donors for current page
    const currentPageDonors = bloodRequest.contactedDonors
      .slice(startIndex, endIndex)
      .map(item => ({
        id: item.donorId._id,
        name: item.donorId.fullName,
        phone: item.donorId.phone,
        bloodGroup: item.donorId.bloodGroup,
        availability: item.donorId.availability,
        lastUpdated: item.donorId.lastUpdated,
        contactStatus: item.contactStatus
      }));
    
    const totalPages = Math.ceil(bloodRequest.contactedDonors.length / donorsPerPage);
    
    return res.json({
      success: true,
      donors: currentPageDonors,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalDonors: bloodRequest.contactedDonors.length,
        hasNextPage: pageNum < totalPages,
        hasPreviousPage: pageNum > 1
      }
    });
    
  } catch (error) {
    console.error('Get donors error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Update donor status for a request
router.post('/:requestId/update-donor-status', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { donorId, status, notes } = req.body;
    
    const bloodRequest = await BloodRequest.findById(requestId);
    
    if (!bloodRequest) {
      return res.status(404).json({
        success: false,
        message: 'Blood request not found'
      });
    }
    
    // Find and update donor in contactedDonors
    const donorIndex = bloodRequest.contactedDonors.findIndex(
      item => item.donorId.toString() === donorId
    );
    
    if (donorIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Donor not found in this request'
      });
    }
    
    // Update donor status
    bloodRequest.contactedDonors[donorIndex].contactStatus = status;
    bloodRequest.contactedDonors[donorIndex].contactTime = new Date();
    if (notes) {
      bloodRequest.contactedDonors[donorIndex].notes = notes;
    }
    
    // Also update donor's availability in Donor collection
    await Donor.findByIdAndUpdate(donorId, {
      $set: {
        availability: status === 'confirmed' ? 'available' : 
                    status === 'declined' || status === 'unavailable' ? 'unavailable' : 'other',
        lastUpdated: new Date()
      }
    });
    
    // Add to status updates tracking
    bloodRequest.searchSession.statusUpdates.push({
      donorId: new mongoose.Types.ObjectId(donorId),
      newStatus: status,
      updatedAt: new Date()
    });
    
    await bloodRequest.save();
    
    return res.json({
      success: true,
      message: 'Donor status updated successfully'
    });
    
  } catch (error) {
    console.error('Update donor status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Batch update multiple donor statuses
router.post('/:requestId/batch-update-status', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { updates } = req.body; // Array of { donorId, status, notes }
    
    if (!Array.isArray(updates) || updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Updates array is required'
      });
    }
    
    const bloodRequest = await BloodRequest.findById(requestId);
    
    if (!bloodRequest) {
      return res.status(404).json({
        success: false,
        message: 'Blood request not found'
      });
    }
    
    // Process each update
    for (const update of updates) {
      const { donorId, status, notes } = update;
      
      const donorIndex = bloodRequest.contactedDonors.findIndex(
        item => item.donorId.toString() === donorId
      );
      
      if (donorIndex !== -1) {
        // Update in blood request
        bloodRequest.contactedDonors[donorIndex].contactStatus = status;
        bloodRequest.contactedDonors[donorIndex].contactTime = new Date();
        if (notes) {
          bloodRequest.contactedDonors[donorIndex].notes = notes;
        }
        
        // Update donor availability
        await Donor.findByIdAndUpdate(donorId, {
          $set: {
            availability: status === 'confirmed' ? 'available' : 
                        status === 'declined' || status === 'unavailable' ? 'unavailable' : 'other',
            lastUpdated: new Date()
          }
        });
        
        // Track status update
        bloodRequest.searchSession.statusUpdates.push({
          donorId: new mongoose.Types.ObjectId(donorId),
          newStatus: status,
          updatedAt: new Date()
        });
      }
    }
    
    await bloodRequest.save();
    
    return res.json({
      success: true,
      message: 'Batch update completed successfully',
      updatedCount: updates.length
    });
    
  } catch (error) {
    console.error('Batch update error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Complete blood request
router.post('/:requestId/complete', async (req, res) => {
  try {
    const { requestId } = req.params;
    const { status = 'fulfilled', notes } = req.body;
    
    const bloodRequest = await BloodRequest.findById(requestId);
    
    if (!bloodRequest) {
      return res.status(404).json({
        success: false,
        message: 'Blood request not found'
      });
    }
    
    bloodRequest.status = status;
    if (status === 'fulfilled') {
      bloodRequest.fulfilledAt = new Date();
    }
    if (notes) {
      bloodRequest.additionalNotes += `\n[Completion Notes]: ${notes}`;
    }
    
    await bloodRequest.save();
    
    return res.json({
      success: true,
      message: `Blood request marked as ${status}`,
      requestNumber: bloodRequest.requestNumber
    });
    
  } catch (error) {
    console.error('Complete request error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get request details
router.get('/:requestId', async (req, res) => {
  try {
    const { requestId } = req.params;
    
    const bloodRequest = await BloodRequest.findById(requestId)
      .populate({
        path: 'contactedDonors.donorId',
        select: 'fullName phone bloodGroup'
      });
    
    if (!bloodRequest) {
      return res.status(404).json({
        success: false,
        message: 'Blood request not found'
      });
    }
    
    return res.json({
      success: true,
      request: bloodRequest
    });
    
  } catch (error) {
    console.error('Get request error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Get all blood requests (for admin)
router.get('/', async (req, res) => {
  try {
    const { status, district, bloodGroup, page = 1, limit = 20 } = req.query;
    
    const query = {};
    
    if (status) query.status = status;
    if (district) query.district = district;
    if (bloodGroup) query.bloodGroup = bloodGroup;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    const requests = await BloodRequest.find(query)
      .sort({ requestedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-__v -searchSession.statusUpdates');
    
    const total = await BloodRequest.countDocuments(query);
    
    return res.json({
      success: true,
      count: requests.length,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: pageNum,
      requests
    });
    
  } catch (error) {
    console.error('Get requests error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Add this route to your blood-requests.js file

// Get blood request by phone number
router.get('/phone/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    // Find the latest blood request with this phone number
    const bloodRequest = await BloodRequest.findOne({ contactNumber: phoneNumber })
      .sort({ requestedAt: -1 }) // Get the most recent request
      .select('-__v -searchSession.statusUpdates -contactedDonors');
    
    if (!bloodRequest) {
      return res.status(404).json({
        success: false,
        message: 'No blood request found with this phone number'
      });
    }
    
    return res.json({
      success: true,
      request: {
        _id: bloodRequest._id,
        patientName: bloodRequest.patientName,
        hospitalName: bloodRequest.hospitalName,
        bloodGroup: bloodRequest.bloodGroup,
        unitsRequired: bloodRequest.unitsRequired,
        district: bloodRequest.district,
        urgency: bloodRequest.urgency,
        contactNumber: bloodRequest.contactNumber,
        additionalNotes: bloodRequest.additionalNotes,
        requestedAt: bloodRequest.requestedAt,
        status: bloodRequest.status
      }
    });
    
  } catch (error) {
    console.error('Phone lookup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Add this to your blood-requests.js routes
router.get('/phone/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    const bloodRequest = await BloodRequest.findOne({ contactNumber: phoneNumber })
      .sort({ requestedAt: -1 })
      .select('-__v -searchSession.statusUpdates -contactedDonors');
    
    if (!bloodRequest) {
      return res.status(404).json({
        success: false,
        message: 'No blood request found with this phone number'
      });
    }
    
    return res.json({
      success: true,
      request: {
        patientName: bloodRequest.patientName,
        hospitalName: bloodRequest.hospitalName,
        bloodGroup: bloodRequest.bloodGroup,
        unitsRequired: bloodRequest.unitsRequired,
        district: bloodRequest.district,
        urgency: bloodRequest.urgency,
        contactNumber: bloodRequest.contactNumber,
        additionalNotes: bloodRequest.additionalNotes,
        requestedAt: bloodRequest.requestedAt,
        status: bloodRequest.status
      }
    });
    
  } catch (error) {
    console.error('Phone lookup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

// Search available donors by district and blood group
router.get('/search/available', async (req, res) => {
  try {
    const { district, bloodGroup, page = 1, limit = 5 } = req.query;
    
    if (!district || !bloodGroup) {
      return res.status(400).json({
        success: false,
        message: 'District and blood group are required'
      });
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;
    
    // Build query
    const query = {
      district: district,
      bloodGroup: bloodGroup,
      isActive: true, // Assuming you have this field
      willingToDonate: true // Assuming you have this field
    };
    
    // Get total count for available donors
    const availableCount = await Donor.countDocuments({
      ...query,
      availability: 'available'
    });
    
    // Get paginated donors
    const donors = await Donor.find(query)
      .select('fullName phone bloodGroup district availability lastUpdated')
      .sort({ availability: 1, lastUpdated: -1 }) // Available donors first
      .skip(skip)
      .limit(limitNum);
    
    return res.json({
      success: true,
      donors: donors.map(donor => ({
        id: donor._id,
        name: donor.fullName,
        phone: donor.phone,
        bloodGroup: donor.bloodGroup,
        district: donor.district,
        availability: donor.availability || 'available',
        lastUpdated: donor.lastUpdated || new Date().toISOString().split('T')[0]
      })),
      availableCount,
      currentPage: pageNum,
      totalPages: Math.ceil(donors.length / limitNum)
    });
    
  } catch (error) {
    console.error('Search donors error:', error);
    return res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

export default router;