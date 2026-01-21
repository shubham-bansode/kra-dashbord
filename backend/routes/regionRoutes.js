const express = require('express');
const router = express.Router();
const Region = require('../models/Region');

// GET all regions
router.get('/', async (req, res) => {
  try {
    const filter = { isActive: true };
    
    // Filter by corporation if provided
    if (req.query.corporation) {
      filter.corporation = req.query.corporation;
    }
    
    const regions = await Region.find(filter)
      .populate('corporation', 'name code')
      .sort({ name: 1 });
    
    res.json({
      success: true,
      count: regions.length,
      data: regions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching regions',
      error: error.message
    });
  }
});

// GET regions by corporation ID
router.get('/by-corporation/:corporationId', async (req, res) => {
  try {
    const regions = await Region.find({
      corporation: req.params.corporationId,
      isActive: true
    })
      .populate('corporation', 'name code')
      .sort({ name: 1 });
    
    res.json({
      success: true,
      count: regions.length,
      data: regions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching regions',
      error: error.message
    });
  }
});

// GET single region
router.get('/:id', async (req, res) => {
  try {
    const region = await Region.findById(req.params.id)
      .populate('corporation', 'name code');
    
    if (!region) {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }
    
    res.json({
      success: true,
      data: region
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching region',
      error: error.message
    });
  }
});

// POST create region
router.post('/', async (req, res) => {
  try {
    const region = await Region.create(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Region created successfully',
      data: region
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Region with this name or code already exists for this corporation'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating region',
      error: error.message
    });
  }
});

// PUT update region
router.put('/:id', async (req, res) => {
  try {
    const region = await Region.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!region) {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Region updated successfully',
      data: region
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating region',
      error: error.message
    });
  }
});

// DELETE region (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const region = await Region.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!region) {
      return res.status(404).json({
        success: false,
        message: 'Region not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Region deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting region',
      error: error.message
    });
  }
});

module.exports = router;
