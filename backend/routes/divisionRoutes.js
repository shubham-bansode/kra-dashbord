const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Division = require('../models/Division');

// GET all divisions (optionally filtered)
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.corporation) filter.corporation = req.query.corporation;
    if (req.query.region) filter.region = req.query.region;
    if (req.query.circle) filter.circle = req.query.circle;

    const divisions = await Division.find(filter)
      .populate('corporation', 'name')
      .populate('region', 'name')
      .populate('circle', 'name')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: divisions.length,
      data: divisions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching divisions',
      error: error.message
    });
  }
});

// GET divisions by circle
router.get('/by-circle/:circleId', async (req, res) => {
  try {
    const { circleId } = req.params;
    if (!mongoose.isValidObjectId(circleId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid circle id'
      });
    }

    const divisions = await Division.find({ circle: circleId, isActive: true })
      .select('name code circle region corporation')
      .sort({ name: 1 });

    res.json({
      success: true,
      count: divisions.length,
      data: divisions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error fetching divisions by circle',
      error: error.message
    });
  }
});

module.exports = router;
