const express = require('express');
const router = express.Router();
const { requireFarmer } = require('../middleware/auth');
const {
  getMyData, getMyNotes, addNote, deleteNote
} = require('../controllers/farmerController');

// All routes require farmer auth
router.use(requireFarmer);

// GET /api/farmer/my-data   → lands + readings + prices
router.get('/my-data', getMyData);

// GET /api/farmer/notes
router.get('/notes', getMyNotes);

// POST /api/farmer/notes
router.post('/notes', addNote);

// DELETE /api/farmer/notes/:noteId
router.delete('/notes/:noteId', deleteNote);

module.exports = router;
