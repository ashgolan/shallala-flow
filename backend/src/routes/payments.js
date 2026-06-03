const express  = require('express');
const router   = express.Router();
const Payment  = require('../models/Payment');
const { requireAdmin } = require('../middleware/auth');

router.use(requireAdmin);

// ── GET all payments (with optional year filter) ──────────────
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.year) {
      const y = parseInt(req.query.year);
      filter.date = { $gte: new Date(y, 0, 1), $lt: new Date(y + 1, 0, 1) };
    }
    const payments = await Payment.find(filter).sort({ date: -1 }).lean();
    return res.json({
      payments: payments.map(p => ({
        ...p,
        id: p._id.toString(),
        date: p.date.toISOString().split('T')[0],
      }))
    });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// ── POST create ───────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { date, recipient, amount, checkNumber, invoiceNumber, description, category, notes } = req.body;
    if (!date || !recipient || !amount || !description)
      return res.status(400).json({ error: 'التاريخ والمستفيد والمبلغ والوصف مطلوبة' });
    const p = await Payment.create({
      date: new Date(date),
      recipient: recipient.trim(),
      amount: parseFloat(amount),
      checkNumber: checkNumber || '',
      invoiceNumber: invoiceNumber || '',
      description: description.trim(),
      category: category || 'general',
      notes: notes || '',
    });
    return res.status(201).json({ success: true, id: p._id.toString() });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// ── PUT update ────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { date, recipient, amount, checkNumber, invoiceNumber, description, category, notes } = req.body;
    await Payment.findByIdAndUpdate(req.params.id, {
      date: new Date(date),
      recipient: recipient.trim(),
      amount: parseFloat(amount),
      checkNumber: checkNumber || '',
      invoiceNumber: invoiceNumber || '',
      description: description.trim(),
      category: category || 'general',
      notes: notes || '',
    });
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// ── DELETE ────────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    await Payment.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

// ── GET summary by year ───────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const summary = await Payment.aggregate([
      {
        $group: {
          _id: { year: { $year: '$date' }, category: '$category' },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        }
      },
      { $sort: { '_id.year': -1 } }
    ]);
    return res.json({ summary });
  } catch(err) { return res.status(500).json({ error: 'خطأ في الخادم' }); }
});

module.exports = router;
