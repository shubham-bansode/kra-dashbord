const express = require('express');
const router = express.Router();
const Circle = require('../models/Circle');

// GET all circles
router.get('/', async (req, res) => {
  try {
    const filter = { isActive: true };
    
    // Filter by region if provided
    if (req.query.region) {
      filter.region = req.query.region;
    }
    
    // Filter by corporation if provided
    if (req.query.corporation) {
      filter.corporation = req.query.corporation;
    }
    
    const circles = await Circle.find(filter)
      .populate('region', 'name code')
      .populate('corporation', 'name code')
      .sort({ name: 1 });
    
    res.json({
      success: true,
      count: circles.length,
      data: circles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching circles',
      error: error.message
    });
  }
});

// GET circles by region ID
router.get('/by-region/:regionId', async (req, res) => {
  try {
    const circles = await Circle.find({
      region: req.params.regionId,
      isActive: true
    })
      .populate('region', 'name code')
      .populate('corporation', 'name code')
      .sort({ name: 1 });
    
    res.json({
      success: true,
      count: circles.length,
      data: circles
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching circles',
      error: error.message
    });
  }
});

// GET single circle
router.get('/:id', async (req, res) => {
  try {
    const circle = await Circle.findById(req.params.id)
      .populate('region', 'name code')
      .populate('corporation', 'name code');
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    res.json({
      success: true,
      data: circle
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching circle',
      error: error.message
    });
  }
});

// POST create circle
router.post('/', async (req, res) => {
  try {
    const circle = await Circle.create(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Circle created successfully',
      data: circle
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Circle with this name or code already exists for this region'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating circle',
      error: error.message
    });
  }
});

// PUT update circle
router.put('/:id', async (req, res) => {
  try {
    const circle = await Circle.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Circle updated successfully',
      data: circle
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating circle',
      error: error.message
    });
  }
});

// DELETE circle (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const circle = await Circle.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!circle) {
      return res.status(404).json({
        success: false,
        message: 'Circle not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Circle deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting circle',
      error: error.message
    });
  }
});

module.exports = router;
