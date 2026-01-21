const express = require('express');
const router = express.Router();
const Corporation = require('../models/Corporation');

// GET all corporations
router.get('/', async (req, res) => {
  try {
    const corporations = await Corporation.find({ isActive: true })
      .sort({ name: 1 });
    
    res.json({
      success: true,
      count: corporations.length,
      data: corporations
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching corporations',
      error: error.message
    });
  }
});

// GET single corporation
router.get('/:id', async (req, res) => {
  try {
    const corporation = await Corporation.findById(req.params.id);
    
    if (!corporation) {
      return res.status(404).json({
        success: false,
        message: 'Corporation not found'
      });
    }
    
    res.json({
      success: true,
      data: corporation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching corporation',
      error: error.message
    });
  }
});

// POST create corporation
router.post('/', async (req, res) => {
  try {
    const corporation = await Corporation.create(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Corporation created successfully',
      data: corporation
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Corporation with this name or code already exists'
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating corporation',
      error: error.message
    });
  }
});

// PUT update corporation
router.put('/:id', async (req, res) => {
  try {
    const corporation = await Corporation.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!corporation) {
      return res.status(404).json({
        success: false,
        message: 'Corporation not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Corporation updated successfully',
      data: corporation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error updating corporation',
      error: error.message
    });
  }
});

// DELETE corporation (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const corporation = await Corporation.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!corporation) {
      return res.status(404).json({
        success: false,
        message: 'Corporation not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Corporation deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting corporation',
      error: error.message
    });
  }
});

module.exports = router;
