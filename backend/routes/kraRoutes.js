const express = require('express');
const router = express.Router();
const Kra = require('../models/Kra');
const { adminAuth } = require('../middleware/adminAuth');

// GET all KRAs
router.get('/', async (req, res) => {
  try {
    const kras = await Kra.find({ isActive: true })
      .sort({ sortOrder: 1, name: 1 });
    
    res.json({
      success: true,
      count: kras.length,
      data: kras
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching KRAs',
      error: error.message
    });
  }
});

// GET single KRA
router.get('/:id', async (req, res) => {
  try {
    const kra = await Kra.findById(req.params.id);
    
    if (!kra) {
      return res.status(404).json({
        success: false,
        message: 'KRA not found'
      });
    }
    
    res.json({
      success: true,
      data: kra
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching KRA',
      error: error.message
    });
  }
});

// POST create KRA
router.post('/', adminAuth, async (req, res) => {
  try {
    const kra = await Kra.create(req.body);
    
    res.status(201).json({
      success: true,
      message: 'KRA created successfully',
      data: kra
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'name';
      const msg = field === 'kraNumber'
        ? 'KRA with this number already exists'
        : 'KRA with this name already exists';
      return res.status(400).json({
        success: false,
        message: msg
      });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error creating KRA',
      error: error.message
    });
  }
});

// PUT update KRA
router.put('/:id', adminAuth, async (req, res) => {
  try {
    const kra = await Kra.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    if (!kra) {
      return res.status(404).json({
        success: false,
        message: 'KRA not found'
      });
    }
    
    res.json({
      success: true,
      message: 'KRA updated successfully',
      data: kra
    });
  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || 'name';
      const msg = field === 'kraNumber'
        ? 'KRA with this number already exists'
        : 'KRA with this name already exists';
      return res.status(400).json({
        success: false,
        message: msg
      });
    }
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(e => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', ')
      });
    }
    res.status(500).json({
      success: false,
      message: 'Error updating KRA',
      error: error.message
    });
  }
});

// DELETE KRA (soft delete)
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const kra = await Kra.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    
    if (!kra) {
      return res.status(404).json({
        success: false,
        message: 'KRA not found'
      });
    }
    
    res.json({
      success: true,
      message: 'KRA deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error deleting KRA',
      error: error.message
    });
  }
});

module.exports = router;
