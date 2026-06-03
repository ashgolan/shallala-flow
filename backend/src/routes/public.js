const express = require('express');
const router  = express.Router();
const { Announcement, Gallery, Video } = require('../models/Settings');

router.get('/public', async (req, res) => {
  try {
    const [announcementDoc, galleryDoc, videoDoc] = await Promise.all([
      Announcement.findOne({ key: 'announcement' }).lean(),
      Gallery.findOne({ key: 'gallery' }).lean(),
      Video.findOne({ key: 'video' }).lean(),
    ]);
    return res.json({
      announcement: announcementDoc ? { text: announcementDoc.text, updatedAt: announcementDoc.updatedAt } : { text: '' },
      gallery:      galleryDoc?.images || [],
      video:        videoDoc ? { url: videoDoc.url, title: videoDoc.title } : { url: '', title: '' },
    });
  } catch (err) {
    return res.status(500).json({ error: 'خطأ في الخادم' });
  }
});

module.exports = router;
