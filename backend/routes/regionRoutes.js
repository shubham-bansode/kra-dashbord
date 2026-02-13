const express = require('express');
const router = express.Router();
const Region = require('../models/Region');
const Corporation = require('../models/Corporation');
const { getAllowedRegionNames, isAllowedRegionName } = require('../config/googleFormHierarchy');

// GET all regions
router.get('/', async (req, res) => {
  try {
    const filter = { isActive: true };

    // Filter by corporation if provided
    if (req.query.corporation) {
      const corp = await Corporation.findById(req.query.corporation).select('name');
      if (!corp) {
        return res.status(400).json({
          success: false,
          message: 'Invalid corporation selected'
        });
      }

      const allowedNames = getAllowedRegionNames(corp.name);
      filter.corporation = req.query.corporation;
      filter.name = { $in: allowedNames };

      const regions = await Region.find(filter)
        .populate('corporation', 'name code')
        .sort({ name: 1 });

      return res.json({
        success: true,
        count: regions.length,
        data: regions
      });
    }

    // No corporation filter: only include Regions that match the Google Form exactly
    const regions = await Region.find(filter)
      .populate('corporation', 'name code')
      .sort({ name: 1 });

    const filteredRegions = regions.filter((r) => isAllowedRegionName(r?.corporation?.name, r?.name));
    
    res.json({
      success: true,
      count: filteredRegions.length,
      data: filteredRegions
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
    const corp = await Corporation.findById(req.params.corporationId).select('name');
    if (!corp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid corporation selected'
      });
    }

    const allowedNames = getAllowedRegionNames(corp.name);

    const filteredRegions = await Region.find({
      corporation: req.params.corporationId,
      isActive: true,
      name: { $in: allowedNames }
    })
      .populate('corporation', 'name code')
      .sort({ name: 1 });
    
    res.json({
      success: true,
      count: filteredRegions.length,
      data: filteredRegions
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
