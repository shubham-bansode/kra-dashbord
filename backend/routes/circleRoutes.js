const express = require('express');
const router = express.Router();
const Circle = require('../models/Circle');
const Region = require('../models/Region');
const Corporation = require('../models/Corporation');
const { getAllowedCircleNames, isAllowedCircleName } = require('../config/googleFormHierarchy');

// GET all circles
router.get('/', async (req, res) => {
  try {
    const filter = { isActive: true };

    // If region is provided, enforce (corp + region) whitelist
    if (req.query.region) {
      const region = await Region.findById(req.query.region).populate('corporation', 'name');
      if (!region?.corporation) {
        return res.status(400).json({
          success: false,
          message: 'Invalid region selected'
        });
      }

      const allowedNames = getAllowedCircleNames(region.corporation.name, region.name);
      filter.region = req.query.region;
      filter.corporation = region.corporation._id;
      filter.name = { $in: allowedNames };

      const circles = await Circle.find(filter)
        .populate('region', 'name code')
        .populate('corporation', 'name code')
        .sort({ name: 1 });

      return res.json({
        success: true,
        count: circles.length,
        data: circles
      });
    }

    // If only corporation is provided, allow the union of all Google-Form circles for that corporation
    if (req.query.corporation) {
      const corp = await Corporation.findById(req.query.corporation).select('name');
      if (!corp) {
        return res.status(400).json({
          success: false,
          message: 'Invalid corporation selected'
        });
      }

      // Collect all allowed circles across all regions for this corporation
      const regionDocs = await Region.find({ corporation: req.query.corporation, isActive: true })
        .select('name')
        .lean();
      const allowedSet = new Set();
      for (const r of regionDocs) {
        for (const c of getAllowedCircleNames(corp.name, r.name)) allowedSet.add(c);
      }

      filter.corporation = req.query.corporation;
      filter.name = { $in: [...allowedSet] };

      const circles = await Circle.find(filter)
        .populate('region', 'name code')
        .populate('corporation', 'name code')
        .sort({ name: 1 });

      return res.json({
        success: true,
        count: circles.length,
        data: circles
      });
    }

    // No filters: only include Circles that match the Google Form exactly
    const circles = await Circle.find(filter)
      .populate('region', 'name code')
      .populate('corporation', 'name code')
      .sort({ name: 1 });

    const filteredCircles = circles.filter((c) =>
      isAllowedCircleName(c?.corporation?.name, c?.region?.name, c?.name)
    );
    
    res.json({
      success: true,
      count: filteredCircles.length,
      data: filteredCircles
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
    const region = await Region.findById(req.params.regionId)
      .populate('corporation', 'name')
      .select('_id name corporation')
      .lean();

    if (!region?.corporation) {
      return res.status(400).json({
        success: false,
        message: 'Invalid region selected'
      });
    }

    const allowedNames = getAllowedCircleNames(region.corporation.name, region.name);

    const filteredCircles = await Circle.find({
      region: req.params.regionId,
      corporation: region.corporation._id,
      isActive: true,
      name: { $in: allowedNames }
    })
      .populate('region', 'name code')
      .populate('corporation', 'name code')
      .sort({ name: 1 });
    
    res.json({
      success: true,
      count: filteredCircles.length,
      data: filteredCircles
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
